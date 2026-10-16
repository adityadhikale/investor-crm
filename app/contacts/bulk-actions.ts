"use server";

import { revalidatePath } from "next/cache";

import { requireActionAuth } from "@/lib/auth";
import { fetchAllPages } from "@/lib/supabase-pagination";
import { TAG_OPTIONS } from "@/lib/tags";
import { matchTag, splitTagCell } from "@/lib/tag-match";
import { normalizeToLocalPhone } from "@/lib/whatsapp";

const CHUNK = 500;
const MAX_CONTACTS = 5000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIGRATION_HINT =
  "The latest database update hasn't been run yet. Run 20261016000000_company_and_bulk_updates.sql in the Supabase SQL Editor, then try again.";

function isMissingFunction(message: string | undefined) {
  return Boolean(message && /could not find the function|bulk_(change_contact_tags|update_contacts)|company/i.test(message));
}

// ================= Bulk tag change =================

export type BulkTagMode = "add" | "remove" | "replace";

/**
 * Changes one tag on many contacts at once. "add" gives them the tag,
 * "remove" takes it off, "replace" makes it their only tag.
 */
export async function bulkChangeTags(
  ids: string[],
  mode: BulkTagMode,
  tag: string,
): Promise<{ success: true; updated: number } | { error: string }> {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const normalizedTag = TAG_OPTIONS.find((option) => option === tag.trim());
  if (!normalizedTag) return { error: "That tag is not available." };
  if (!["add", "remove", "replace"].includes(mode)) return { error: "Unknown action." };

  const contactIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (contactIds.length === 0) return { error: "No contacts were selected." };
  if (contactIds.length > MAX_CONTACTS) return { error: `Please select at most ${MAX_CONTACTS} contacts at a time.` };

  let updated = 0;
  for (let i = 0; i < contactIds.length; i += CHUNK) {
    const { data, error } = await supabase.rpc("bulk_change_contact_tags", {
      p_ids: contactIds.slice(i, i + CHUNK),
      p_mode: mode,
      p_tag: normalizedTag,
    });
    if (error) {
      console.error("[bulkChangeTags] failed:", error.message);
      return {
        error: isMissingFunction(error.message)
          ? MIGRATION_HINT
          : updated > 0
          ? `Stopped part-way: ${updated} contacts were changed before an error. Please try again for the rest.`
          : "The tags could not be changed. Please try again.",
      };
    }
    updated += Number(data ?? 0);
  }

  revalidatePath("/contacts");
  revalidatePath("/investors");
  return { success: true, updated };
}

// ================= Update from a file =================

/** One row of the uploaded file. Only phone is required; empty fields are ignored. */
export type ContactUpdateRow = {
  phone: string;
  name?: string;
  email?: string;
  company?: string;
  notes?: string;
  dateSaved?: string;
  tag?: string;
};

export type TagUpdateMode = "add" | "replace";

export interface ContactUpdatePreview {
  totalRows: number;
  /** Rows whose phone number matched a contact. */
  matched: number;
  /** Matched contacts where at least one value really changes. */
  willChange: number;
  /** Matched contacts whose values are already the same. */
  unchanged: number;
  notFound: number;
  invalid: number;
  duplicatesInFile: number;
  /** How many contacts change in each field. */
  fieldCounts: Record<string, number>;
  samples: Array<{ name: string; phone: string; changes: string[] }>;
  notFoundSamples: string[];
  invalidSamples: Array<{ row: number; reason: string }>;
  /** Every skipped row, so the whole list can be downloaded and fixed (capped at 5,000). */
  invalidRows: Array<{ row: number; phone: string; reason: string }>;
  notFoundRows: Array<{ row: number; phone: string }>;
}

type ExistingContact = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  company: string | null;
  notes: string | null;
  date_saved: string | null;
  tags: string[] | null;
};

type UpdateItem = {
  id: string;
  name?: string;
  email?: string;
  company?: string;
  notes?: string;
  date_saved?: string;
  tags?: string[];
};

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    date.getUTCFullYear() === Number(value.slice(0, 4)) &&
    date.getUTCMonth() + 1 === Number(value.slice(5, 7)) &&
    date.getUTCDate() === Number(value.slice(8, 10))
  );
}

/** Reads the tag cell: one tag, or several separated by ; | , or a new line. Spelling and spacing differences are forgiven. */
function parseTags(cell: string): { tags: string[]; unknown?: string } {
  const tags: string[] = [];
  for (const part of splitTagCell(cell)) {
    const match = matchTag(part);
    if (!match) return { tags: [], unknown: part };
    if (!tags.includes(match)) tags.push(match);
  }
  return { tags };
}

async function planUpdate(
  supabase: NonNullable<Awaited<ReturnType<typeof requireActionAuth>>["supabase"]>,
  rows: ContactUpdateRow[],
  tagMode: TagUpdateMode,
): Promise<{ preview: ContactUpdatePreview; items: UpdateItem[] } | { error: string }> {
  let existing: ExistingContact[];
  try {
    existing = await fetchAllPages<ExistingContact>((from, to) =>
      supabase
        .from("contacts")
        .select("id, name, phone, email, company, notes, date_saved, tags")
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: ExistingContact[] | null; error: { message: string } | null }>,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    return { error: isMissingFunction(message) ? MIGRATION_HINT : "The contacts could not be loaded." };
  }

  const byPhone = new Map<string, ExistingContact>();
  for (const contact of existing) {
    const key = normalizeToLocalPhone(String(contact.phone));
    if (key && !byPhone.has(key)) byPhone.set(key, contact);
  }

  const preview: ContactUpdatePreview = {
    totalRows: rows.length,
    matched: 0,
    willChange: 0,
    unchanged: 0,
    notFound: 0,
    invalid: 0,
    duplicatesInFile: 0,
    fieldCounts: {},
    samples: [],
    notFoundSamples: [],
    invalidSamples: [],
    invalidRows: [],
    notFoundRows: [],
  };
  const items = new Map<string, UpdateItem>();
  const seen = new Set<string>();
  const countField = (field: string) => {
    preview.fieldCounts[field] = (preview.fieldCounts[field] ?? 0) + 1;
  };

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // header is row 1
    const invalid = (reason: string) => {
      preview.invalid++;
      if (preview.invalidSamples.length < 10) preview.invalidSamples.push({ row: rowNumber, reason });
      if (preview.invalidRows.length < 5000) preview.invalidRows.push({ row: rowNumber, phone: String(row.phone ?? ""), reason });
    };

    const phoneKey = normalizeToLocalPhone(String(row.phone ?? ""));
    if (!phoneKey || !/^\d{7,15}$/.test(phoneKey)) return invalid("Phone number is missing or not valid.");

    const name = row.name?.trim() || undefined;
    const email = row.email?.trim().toLowerCase() || undefined;
    const company = row.company?.trim() || undefined;
    const notes = row.notes?.trim() || undefined;
    const dateSaved = row.dateSaved?.trim() || undefined;
    if (email && !EMAIL_REGEX.test(email)) return invalid(`Email "${row.email}" is not valid.`);
    if (dateSaved && !isValidDate(dateSaved)) return invalid(`Date "${row.dateSaved}" must be YYYY-MM-DD.`);
    const parsedTags = row.tag?.trim() ? parseTags(row.tag) : { tags: [] as string[] };
    if (parsedTags.unknown) return invalid(`Unknown tag "${parsedTags.unknown}".`);

    const contact = byPhone.get(phoneKey);
    if (!contact) {
      preview.notFound++;
      if (preview.notFoundSamples.length < 10) preview.notFoundSamples.push(String(row.phone));
      if (preview.notFoundRows.length < 5000) preview.notFoundRows.push({ row: rowNumber, phone: String(row.phone ?? "") });
      return;
    }
    if (seen.has(contact.id)) preview.duplicatesInFile++;
    seen.add(contact.id);

    // Only fields present in the file are considered, and only if they differ.
    const item: UpdateItem = { id: contact.id };
    const changes: string[] = [];
    if (name !== undefined && name !== contact.name) {
      item.name = name;
      changes.push(`Name: ${contact.name} → ${name}`);
      countField("Name");
    }
    if (email !== undefined && email !== (contact.email ?? "").toLowerCase()) {
      item.email = email;
      changes.push(`Email: ${contact.email || "(empty)"} → ${email}`);
      countField("Email");
    }
    if (company !== undefined && company !== (contact.company ?? "")) {
      item.company = company;
      changes.push(`Company: ${contact.company || "(empty)"} → ${company}`);
      countField("Company");
    }
    if (notes !== undefined && notes !== (contact.notes ?? "")) {
      item.notes = notes;
      changes.push("Notes updated");
      countField("Notes");
    }
    if (dateSaved !== undefined && dateSaved !== (contact.date_saved ?? "").slice(0, 10)) {
      item.date_saved = dateSaved;
      changes.push(`Date saved: ${contact.date_saved || "(empty)"} → ${dateSaved}`);
      countField("Date saved");
    }
    if (parsedTags.tags.length > 0) {
      const current = contact.tags ?? [];
      const next =
        tagMode === "replace" ? parsedTags.tags : [...current, ...parsedTags.tags.filter((tag) => !current.includes(tag))];
      const same = next.length === current.length && next.every((tag) => current.includes(tag));
      if (!same) {
        item.tags = next;
        changes.push(`Tags: ${current.length ? current.join(", ") : "(none)"} → ${next.join(", ")}`);
        countField("Tags");
      }
    }

    const previous = items.get(contact.id);
    if (changes.length === 0 && !previous) {
      preview.unchanged++;
      return;
    }
    items.set(contact.id, { ...previous, ...item });
    if (!previous) {
      preview.willChange++;
      if (preview.samples.length < 8) preview.samples.push({ name: contact.name, phone: contact.phone, changes });
    }
  });
  preview.matched = preview.willChange + preview.unchanged;

  return { preview, items: [...items.values()] };
}

/** Shows what an update from a file would change, without changing anything. */
export async function previewContactUpdate(
  rows: ContactUpdateRow[],
  tagMode: TagUpdateMode,
): Promise<{ preview: ContactUpdatePreview } | { error: string }> {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };
  if (!Array.isArray(rows) || rows.length === 0) return { error: "The file has no rows." };
  if (rows.length > 20000) return { error: "That file is too large. Please split it into smaller files." };

  const plan = await planUpdate(supabase, rows, tagMode === "replace" ? "replace" : "add");
  if ("error" in plan) return plan;
  return { preview: plan.preview };
}

/** Applies an update from a file: only the columns in the file change, and empty cells never erase data. */
export async function applyContactUpdate(
  rows: ContactUpdateRow[],
  tagMode: TagUpdateMode,
): Promise<{ success: true; updated: number; preview: ContactUpdatePreview } | { error: string }> {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };
  if (!Array.isArray(rows) || rows.length === 0) return { error: "The file has no rows." };
  if (rows.length > 20000) return { error: "That file is too large. Please split it into smaller files." };

  const plan = await planUpdate(supabase, rows, tagMode === "replace" ? "replace" : "add");
  if ("error" in plan) return plan;

  let updated = 0;
  for (let i = 0; i < plan.items.length; i += CHUNK) {
    const { data, error } = await supabase.rpc("bulk_update_contacts", { p_rows: plan.items.slice(i, i + CHUNK) });
    if (error) {
      console.error("[applyContactUpdate] failed:", error.message);
      return {
        error: isMissingFunction(error.message)
          ? MIGRATION_HINT
          : updated > 0
          ? `Stopped part-way: ${updated} contacts were updated before an error. Upload the file again; contacts already updated will show as unchanged.`
          : "The contacts could not be updated. Please try again.",
      };
    }
    updated += Number(data ?? 0);
  }

  revalidatePath("/contacts");
  revalidatePath("/investors");
  return { success: true, updated, preview: plan.preview };
}
