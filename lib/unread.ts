import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Unread inbound WhatsApp message counts keyed by contact id, from the
 * unread_conversations() SQL function. Returns an empty object on error so a
 * failed lookup never breaks the page that shows the badges.
 */
export async function getUnreadCountsByContact(
  supabase: SupabaseClient,
): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc("unread_conversations");
  if (error || !data) return {};

  const counts: Record<string, number> = {};
  for (const row of data as Array<{ contact_id: string; unread_count: number }>) {
    counts[row.contact_id] = Number(row.unread_count);
  }
  return counts;
}
