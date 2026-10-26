import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

import { createClient } from "@/src/lib/supabase/server";
import { fetchAllPages } from "@/lib/supabase-pagination";

export const dynamic = "force-dynamic";

type ContactExportRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  tags: string[] | null;
  notes: string | null;
  date_saved: string | null;
  contact_groups: Array<{ groups: { name: string } | Array<{ name: string }> | null }> | null;
};

const COLUMNS = "id, name, phone, email, company, tags, notes, date_saved, contact_groups(groups(name))";
const HEADER = ["Name", "Phone", "Email", "Company", "Tags", "Groups", "Notes", "Date Saved"];
const ID_CHUNK = 150;
const MAX_IDS = 20000;

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Quotes the value for CSV and neutralises spreadsheet formulas (a cell that
// starts with = + - @ would otherwise be executed when opened in Excel).
function csvCell(value: string | null | undefined) {
  let text = value ?? "";
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function groupNames(contact: ContactExportRow): string {
  return (contact.contact_groups ?? [])
    .flatMap((link) => (Array.isArray(link.groups) ? link.groups : link.groups ? [link.groups] : []))
    .map((group) => group.name)
    .join("; ");
}

function toCells(contact: ContactExportRow): string[] {
  return [
    contact.name ?? "",
    contact.phone ?? "",
    contact.email ?? "",
    contact.company ?? "",
    (contact.tags ?? []).join("; "),
    groupNames(contact),
    contact.notes ?? "",
    contact.date_saved?.slice(0, 10) ?? "",
  ];
}

/** All active contacts (A to Z), or just the given ones in the order given. */
async function loadContacts(supabase: Supabase, ids: string[] | null): Promise<ContactExportRow[]> {
  if (!ids) {
    return fetchAllPages<ContactExportRow>((from, to) =>
      supabase
        .from("contacts")
        .select(COLUMNS)
        .is("deleted_at", null)
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
        .then((result) => ({ data: result.data as unknown as ContactExportRow[] | null, error: result.error }))
    );
  }

  const byId = new Map<string, ContactExportRow>();
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await supabase
      .from("contacts")
      .select(COLUMNS)
      .in("id", ids.slice(i, i + ID_CHUNK))
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as unknown as ContactExportRow[]) byId.set(row.id, row);
  }
  return ids.map((id) => byId.get(id)).filter((row): row is ContactExportRow => Boolean(row));
}

function buildCsv(contacts: ContactExportRow[]): Buffer {
  const lines = [HEADER.map(csvCell).join(","), ...contacts.map((contact) => toCells(contact).map(csvCell).join(","))];
  // The BOM makes Excel read the file as UTF-8 (names with accents, etc.).
  return Buffer.from(`﻿${lines.join("\r\n")}\r\n`, "utf8");
}

async function buildXlsx(contacts: ContactExportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CREST CRM";
  const sheet = workbook.addWorksheet("Contacts", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: HEADER[0], key: "name", width: 28 },
    // Text format keeps phone numbers exactly as stored (no 9.8E+09, no lost zeros).
    { header: HEADER[1], key: "phone", width: 16, style: { numFmt: "@" } },
    { header: HEADER[2], key: "email", width: 32 },
    { header: HEADER[3], key: "company", width: 28 },
    { header: HEADER[4], key: "tags", width: 28 },
    { header: HEADER[5], key: "groups", width: 24 },
    { header: HEADER[6], key: "notes", width: 44 },
    { header: HEADER[7], key: "date", width: 14, style: { numFmt: "@" } },
  ];
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
  for (const contact of contacts) sheet.addRow(toCells(contact));
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: HEADER.length } };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function respond(supabase: Supabase, ids: string[] | null, format: "csv" | "xlsx", label: string) {
  let contacts: ContactExportRow[];
  try {
    contacts = await loadContacts(supabase, ids);
  } catch {
    return NextResponse.json({ error: "Contacts could not be exported." }, { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const body = format === "xlsx" ? await buildXlsx(contacts) : buildCsv(contacts);
  const contentType =
    format === "xlsx"
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "text/csv; charset=utf-8";
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="crest-contacts-${label}${today}.${format}"`,
      "X-Contact-Count": String(contacts.length),
      "Cache-Control": "no-store",
    },
  });
}

/** All contacts as a CSV (the My Profile download link). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return respond(supabase, null, "csv", "");
}

/**
 * Exports contacts as CSV or Excel. With "ids" it exports just those contacts
 * (the selected ones, or the current search and filter results); without
 * "ids" it exports every active contact.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { ids?: unknown; format?: unknown; label?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const format = body.format === "xlsx" ? "xlsx" : "csv";
  let ids: string[] | null = null;
  if (body.ids !== undefined && body.ids !== null) {
    if (!Array.isArray(body.ids) || body.ids.some((id) => typeof id !== "string")) {
      return NextResponse.json({ error: "Invalid contact list." }, { status: 400 });
    }
    ids = [...new Set(body.ids as string[])];
    if (ids.length === 0) return NextResponse.json({ error: "No contacts to export." }, { status: 400 });
    if (ids.length > MAX_IDS) return NextResponse.json({ error: "Too many contacts selected." }, { status: 400 });
  }
  const label = body.label === "selected" ? "selected-" : body.label === "filtered" ? "filtered-" : "";
  return respond(supabase, ids, format, label);
}
