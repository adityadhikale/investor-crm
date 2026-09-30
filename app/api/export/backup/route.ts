import { NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";
import { fetchAllPages } from "@/lib/supabase-pagination";

export const dynamic = "force-dynamic";

// Each table is paged in a stable order so no rows are skipped or repeated.
const BACKUP_TABLES: Array<{ table: string; orderBy: string[] }> = [
  { table: "contacts", orderBy: ["id"] },
  { table: "groups", orderBy: ["id"] },
  { table: "contact_groups", orderBy: ["contact_id", "group_id"] },
  { table: "interactions", orderBy: ["id"] },
  { table: "follow_ups", orderBy: ["id"] },
  { table: "templates", orderBy: ["id"] },
  { table: "broadcasts", orderBy: ["id"] },
  { table: "whatsapp_messages", orderBy: ["id"] },
];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data: Record<string, unknown[]> = {};
  try {
    for (const { table, orderBy } of BACKUP_TABLES) {
      data[table] = await fetchAllPages<Record<string, unknown>>((from, to) => {
        let query = supabase.from(table).select("*");
        for (const column of orderBy) {
          query = query.order(column, { ascending: true });
        }
        return query.range(from, to);
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Backup failed: ${message}` }, { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const backup = {
    exportedAt: new Date().toISOString(),
    counts: Object.fromEntries(
      Object.entries(data).map(([table, rows]) => [table, rows.length])
    ),
    data,
  };

  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="crest-crm-backup-${today}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
