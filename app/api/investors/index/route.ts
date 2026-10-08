import { NextResponse } from "next/server";

import { createClient } from "@/src/lib/supabase/server";
import { fetchAllPages } from "@/lib/supabase-pagination";
import { INVESTOR_TAGS } from "@/lib/tags";

export const dynamic = "force-dynamic";

const BASE_COLUMNS = "id, name, phone, email, tags, date_saved, notes";
const WITH_LAST_MESSAGE = `${BASE_COLUMNS}, last_message_at, last_message_text, last_message_direction`;

type Row = Record<string, unknown>;

/**
 * Every investor with their last interaction and next follow-up, in one
 * response, so the Investors page can search and page instantly in the browser.
 * Row-level security limits it to the CRM owner's data.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  async function loadInvestors(columns: string) {
    return fetchAllPages<Row>((from, to) =>
      supabase
        .from("contacts")
        .select(columns)
        .overlaps("tags", INVESTOR_TAGS)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to)
        .then((result) => ({ data: result.data as unknown as Row[] | null, error: result.error }))
    );
  }

  try {
    let investors: Row[];
    try {
      investors = await loadInvestors(WITH_LAST_MESSAGE);
    } catch {
      // The last-message columns don't exist until the chat-list migration is run.
      investors = await loadInvestors(BASE_COLUMNS);
    }

    const [interactions, followUps] = await Promise.all([
      fetchAllPages<{ contact_id: string; created_at: string }>((from, to) =>
        supabase
          .from("interactions")
          .select("contact_id, created_at")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .range(from, to)
      ),
      fetchAllPages<{ contact_id: string; due_date: string }>((from, to) =>
        supabase
          .from("follow_ups")
          .select("contact_id, due_date")
          .eq("is_done", false)
          .is("deleted_at", null)
          .order("due_date", { ascending: true })
          .range(from, to)
      ),
    ]);

    const lastInteraction = new Map<string, string>();
    for (const interaction of interactions) {
      if (!lastInteraction.has(interaction.contact_id)) {
        lastInteraction.set(interaction.contact_id, interaction.created_at);
      }
    }
    const nextFollowUp = new Map<string, string>();
    for (const followUp of followUps) {
      if (!nextFollowUp.has(followUp.contact_id)) {
        nextFollowUp.set(followUp.contact_id, followUp.due_date);
      }
    }

    const rows = investors.map((investor) => ({
      ...investor,
      contact_groups: null,
      lastInteraction: lastInteraction.get(String(investor.id)) ?? null,
      nextFollowUp: nextFollowUp.get(String(investor.id)) ?? null,
    }));
    return NextResponse.json({ investors: rows }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Investors could not be loaded." }, { status: 500 });
  }
}
