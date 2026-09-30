import { NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";
import { fetchAllPages } from "@/lib/supabase-pagination";

export const dynamic = "force-dynamic";

type ContactExportRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  tags: string[] | null;
  notes: string | null;
  date_saved: string | null;
};

// Quotes the value for CSV and neutralises spreadsheet formulas (a cell that
// starts with = + - @ would otherwise be executed when opened in Excel).
function csvCell(value: string | null | undefined) {
  let text = value ?? "";
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let contacts: ContactExportRow[];
  try {
    contacts = await fetchAllPages<ContactExportRow>((from, to) =>
      supabase
        .from("contacts")
        .select("id, name, phone, email, tags, notes, date_saved")
        .is("deleted_at", null)
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
    );
  } catch {
    return NextResponse.json({ error: "Contacts could not be exported." }, { status: 500 });
  }

  const header = ["Name", "Phone", "Email", "Tags", "Notes", "Date Saved"];
  const lines = [
    header.map(csvCell).join(","),
    ...contacts.map((contact) =>
      [
        contact.name,
        contact.phone,
        contact.email,
        (contact.tags ?? []).join("; "),
        contact.notes,
        contact.date_saved?.slice(0, 10),
      ]
        .map(csvCell)
        .join(",")
    ),
  ];

  const today = new Date().toISOString().slice(0, 10);
  // The BOM makes Excel read the file as UTF-8 (names with accents, etc.).
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="crest-contacts-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
