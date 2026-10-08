import { NextResponse } from "next/server";

import { createClient } from "@/src/lib/supabase/server";
import { fetchAllPages } from "@/lib/supabase-pagination";

export const dynamic = "force-dynamic";

const BASE_COLUMNS = "id, name, phone, email, tags, date_saved, notes, contact_groups(groups(id, name))";
const WITH_LAST_MESSAGE = `${BASE_COLUMNS}, last_message_at, last_message_text, last_message_direction`;

/**
 * Every active contact in one compact response. The Contacts page keeps this
 * in memory so searching, filtering and paging happen instantly in the browser
 * instead of asking the server on every keystroke. Row-level security limits
 * it to the CRM owner's data.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  async function load(columns: string) {
    return fetchAllPages<Record<string, unknown>>((from, to) =>
      supabase
        .from("contacts")
        .select(columns)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to)
        .then((result) => ({
          data: result.data as unknown as Record<string, unknown>[] | null,
          error: result.error,
        })),
    );
  }

  try {
    let contacts: Record<string, unknown>[];
    try {
      contacts = await load(WITH_LAST_MESSAGE);
    } catch {
      // The last-message columns don't exist until the chat-list migration is run.
      contacts = await load(BASE_COLUMNS);
    }
    return NextResponse.json({ contacts }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Contacts could not be loaded." }, { status: 500 });
  }
}
