import type { requireActionAuth } from "@/lib/auth";

type ActionSupabase = NonNullable<Awaited<ReturnType<typeof requireActionAuth>>["supabase"]>;

/**
 * Meta only delivers free-form messages within 24 hours of the contact's last
 * message (its "customer service window"). Outside it they are silently dropped.
 */
export async function isReplyWindowOpen(supabase: ActionSupabase, contactId: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("contact_id", contactId)
    .eq("direction", "in")
    .is("deleted_at", null)
    .gte("sent_at", since);
  // If the check itself fails, don't block the user; Meta stays the final judge.
  if (error) return true;
  return (count ?? 0) > 0;
}
