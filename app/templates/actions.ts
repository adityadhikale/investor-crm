"use server";

import { revalidatePath } from "next/cache";
import { requireActionAuth } from "@/lib/auth";
import {
  fetchWhatsAppMessageTemplates,
  type MetaMessageTemplate,
} from "@/lib/whatsapp";

export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";

export interface TemplateData {
  id: string;
  name: string;
  meta_template_id?: string | null;
  variables: Record<string, string>;
  category: TemplateCategory | string | null;
  body_text: string;
  approved_at?: string | null;
  created_at: string;
  deleted_at?: string | null;
}

export interface CreateTemplateInput {
  name: string;
  category: TemplateCategory;
  body_text: string;
  variables: Record<string, string>;
}

export interface UpdateTemplateInput {
  name: string;
  category: TemplateCategory;
  body_text: string;
  variables: Record<string, string>;
}

const TEMPLATE_NAME_REGEX = /^[a-z0-9_]+$/;

function validateTemplateInput(data: {
  name: string;
  category: string;
  body_text: string;
}): string | null {
  const name = (data.name ?? "").trim();
  if (!name) {
    return "Template name is required.";
  }

  if (!TEMPLATE_NAME_REGEX.test(name)) {
    return "Template name must contain only lowercase letters, numbers, and underscores (e.g. quarterly_update_2026).";
  }

  if (name.length > 512) {
    return "Template name must be 512 characters or fewer.";
  }

  const validCategories: TemplateCategory[] = [
    "MARKETING",
    "UTILITY",
    "AUTHENTICATION",
  ];
  if (!validCategories.includes(data.category as TemplateCategory)) {
    return "Please select a valid category (MARKETING, UTILITY, or AUTHENTICATION).";
  }

  const bodyText = (data.body_text ?? "").trim();
  if (!bodyText) {
    return "Body text is required.";
  }

  return null;
}

export async function createTemplate(data: CreateTemplateInput) {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) {
    return { error: "Unauthorized" };
  }

  const validationError = validateTemplateInput(data);
  if (validationError) {
    return { error: validationError };
  }

  const normalizedName = data.name.trim().toLowerCase();
  const normalizedBody = data.body_text.trim();
  const variables = data.variables && typeof data.variables === "object" ? data.variables : {};

  const { data: inserted, error } = await supabase
    .from("templates")
    .insert({
      name: normalizedName,
      category: data.category,
      body_text: normalizedBody,
      variables,
      meta_template_id: null,
      approved_at: null,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message || "Failed to create template." };
  }

  revalidatePath("/templates");
  return { success: true, id: inserted.id };
}

export async function updateTemplate(id: string, data: UpdateTemplateInput) {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) {
    return { error: "Unauthorized" };
  }

  if (!id) {
    return { error: "Template ID is required." };
  }

  const validationError = validateTemplateInput(data);
  if (validationError) {
    return { error: validationError };
  }

  const normalizedName = data.name.trim().toLowerCase();
  const normalizedBody = data.body_text.trim();
  const variables = data.variables && typeof data.variables === "object" ? data.variables : {};

  // Verify template exists and is not deleted
  const { data: existing, error: fetchError } = await supabase
    .from("templates")
    .select("id, meta_template_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError || !existing) {
    return { error: "Template not found." };
  }

  // The text Meta approved is what gets sent, so it must not drift in the CRM.
  if (existing.meta_template_id) {
    return {
      error:
        "This template comes from Meta. Edit it in WhatsApp Manager, then click \"Sync from Meta\".",
    };
  }

  const { error } = await supabase
    .from("templates")
    .update({
      name: normalizedName,
      category: data.category,
      body_text: normalizedBody,
      variables,
    })
    .eq("id", id);

  if (error) {
    return { error: error.message || "Failed to update template." };
  }

  revalidatePath("/templates");
  revalidatePath(`/templates/${id}`);
  return { success: true };
}

export async function deleteTemplate(id: string) {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) {
    return { error: "Unauthorized" };
  }

  if (!id) {
    return { error: "Template ID is required." };
  }

  const { error } = await supabase
    .from("templates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return { error: error.message || "Failed to delete template." };
  }

  revalidatePath("/templates");
  return { success: true };
}

const SUPPORTED_META_BUTTONS = new Set(["QUICK_REPLY", "PHONE_NUMBER", "URL"]);

/**
 * Why the CRM can't send this Meta template, or null if it can. The CRM only
 * fills body variables, so anything needing other parameters is skipped.
 */
function unsupportedMetaTemplateReason(template: MetaMessageTemplate): string | null {
  if (template.name === "hello_world") return "Meta's sample, only sendable from test numbers";
  if (template.category === "AUTHENTICATION") return "authentication template";
  if (template.parameter_format === "NAMED") return "uses named variables";

  const components = template.components ?? [];
  if (!components.some((c) => c.type === "BODY" && c.text)) return "no body text";

  for (const component of components) {
    if (component.type === "HEADER") {
      if (component.format && component.format !== "TEXT") return "has an image/video/document header";
      if (component.text?.includes("{{")) return "has a variable in the header";
    }
    if (component.type === "BUTTONS") {
      for (const button of component.buttons ?? []) {
        if (!SUPPORTED_META_BUTTONS.has(button.type)) return `has a ${button.type} button`;
        if (button.url?.includes("{{")) return "has a variable in a button link";
      }
    }
  }
  return null;
}

export interface SyncMetaTemplatesResult {
  error?: string;
  success?: boolean;
  imported?: number;
  approved?: number;
  skipped?: string[];
}

/**
 * Copies the message templates from Meta (WhatsApp Manager) into the CRM so
 * they can be used in broadcasts and sent outside the 24-hour window. Only
 * templates Meta has approved get an approval date; re-running the sync
 * refreshes text, category and approval status.
 */
export async function syncMetaTemplates(): Promise<SyncMetaTemplatesResult> {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) {
    return { error: "Unauthorized" };
  }

  let metaTemplates: MetaMessageTemplate[];
  try {
    metaTemplates = await fetchWhatsAppMessageTemplates();
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not load templates from Meta.",
    };
  }

  const { data: allRows, error: existingError } = await supabase
    .from("templates")
    .select("id, name, meta_template_id, approved_at, deleted_at");
  const existingRows = (allRows ?? []).filter((row) => !row.deleted_at);
  // Templates deleted in the CRM stay hidden instead of coming back on every sync.
  const deletedMetaIds = new Set(
    (allRows ?? []).filter((row) => row.deleted_at && row.meta_template_id).map((row) => row.meta_template_id),
  );
  if (existingError) {
    return { error: existingError.message || "Could not load CRM templates." };
  }

  const skipped: string[] = [];
  let imported = 0;
  let approved = 0;

  for (const template of metaTemplates) {
    if (deletedMetaIds.has(template.id)) continue;
    const reason = unsupportedMetaTemplateReason(template);
    if (reason) {
      skipped.push(`${template.name} (${reason})`);
      continue;
    }

    const body = template.components?.find((c) => c.type === "BODY") as
      | { text?: string; example?: { body_text?: string[][] } }
      | undefined;
    const samples = body?.example?.body_text?.[0] ?? [];
    const variables: Record<string, string> = {};
    samples.forEach((sample, index) => {
      variables[String(index + 1)] = sample;
    });

    const isApproved = template.status === "APPROVED";
    if (isApproved) approved++;

    // Match on Meta's ID; fall back to a CRM-only template with the same name.
    const existing =
      existingRows?.find((row) => row.meta_template_id === template.id) ??
      existingRows?.find((row) => !row.meta_template_id && row.name === template.name);

    const row = {
      name: template.name,
      category: template.category,
      language: template.language,
      body_text: body?.text ?? "",
      variables,
      meta_template_id: template.id,
      approved_at: isApproved ? existing?.approved_at ?? new Date().toISOString() : null,
    };

    const { error } = existing
      ? await supabase.from("templates").update(row).eq("id", existing.id)
      : await supabase.from("templates").insert(row);
    if (error) {
      return { error: `Could not save "${template.name}": ${error.message}` };
    }
    imported++;
  }

  revalidatePath("/templates");
  revalidatePath("/broadcasts/new");
  return { success: true, imported, approved, skipped };
}

export interface ChatTemplate {
  id: string;
  name: string;
  language: string;
  body_text: string;
  variables: Record<string, string>;
  /** "meta": approved WhatsApp template, sendable any time. "crm": plain text, 24-hour window only. */
  kind: "meta" | "crm";
}

/**
 * Templates that can be sent to one contact from their chat: Meta-approved
 * ones, plus the CRM's own templates (sent as plain text). Meta templates that
 * aren't approved yet are left out.
 */
export async function getChatTemplates(): Promise<ChatTemplate[]> {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return [];

  const { data } = await supabase
    .from("templates")
    .select("id, name, language, body_text, variables, meta_template_id, approved_at")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  return (data ?? [])
    .filter((row) => !row.meta_template_id || row.approved_at)
    .map((row) => ({
      id: row.id,
      name: row.name,
      language: row.language,
      body_text: row.body_text ?? "",
      variables: row.variables ?? {},
      kind: row.meta_template_id ? "meta" : "crm",
    }));
}
