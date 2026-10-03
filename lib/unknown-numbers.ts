import type { SupabaseClient } from "@supabase/supabase-js";

export interface UnknownConversation {
  /** 10-digit local number, as contacts are stored. */
  phone: string;
  /** Name the sender set in WhatsApp, if Meta sent one. */
  profileName: string | null;
  messageCount: number;
  lastMessageAt: string;
  lastMessageText: string | null;
  hasMedia: boolean;
}

/**
 * Numbers that messaged on WhatsApp but aren't saved as contacts, newest
 * first. Returns [] on error (e.g. before the phone column migration is run).
 */
export async function getUnknownConversations(
  supabase: SupabaseClient,
): Promise<UnknownConversation[]> {
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("phone, profile_name, message_text, media_url, sent_at")
    .is("contact_id", null)
    .eq("direction", "in")
    .not("phone", "is", null)
    .is("deleted_at", null)
    .order("sent_at", { ascending: false })
    .limit(1000);
  if (error || !data) return [];

  const byPhone = new Map<string, UnknownConversation>();
  for (const row of data) {
    const phone = row.phone as string;
    const existing = byPhone.get(phone);
    if (existing) {
      existing.messageCount++;
      existing.profileName ??= (row.profile_name as string | null) ?? null;
      continue;
    }
    byPhone.set(phone, {
      phone,
      profileName: (row.profile_name as string | null) ?? null,
      messageCount: 1,
      lastMessageAt: row.sent_at as string,
      lastMessageText: (row.message_text as string | null) ?? null,
      hasMedia: Boolean(row.media_url),
    });
  }
  return [...byPhone.values()];
}
