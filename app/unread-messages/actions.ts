"use server";

import { revalidatePath } from "next/cache";
import { requireActionAuth } from "@/lib/auth";
import { getUnknownConversations } from "@/lib/unknown-numbers";

export async function getUnreadConversationCount(): Promise<number> {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return 0;

  const [{ count, error }, unknown] = await Promise.all([
    supabase.rpc("unread_conversations", {}, { count: "exact", head: true }),
    getUnknownConversations(supabase),
  ]);

  // Numbers that messaged but aren't saved as contacts count too.
  return (error ? 0 : count ?? 0) + unknown.length;
}

export async function markConversationRead(contactId: string) {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const normalizedContactId = contactId.trim();
  if (!normalizedContactId) return { error: "The contact could not be found." };

  const { error } = await supabase
    .from("contacts")
    .update({ last_read_at: new Date().toISOString() })
    .eq("id", normalizedContactId);

  if (error) return { error: "The conversation could not be marked as read." };

  revalidatePath("/unread-messages");
  return { success: true as const };
}

export async function markAllConversationsRead() {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const { data, error: listError } = await supabase.rpc("unread_conversations");
  if (listError) return { error: "Unread conversations could not be loaded." };

  const contactIds = (data ?? []).map((row: { contact_id: string }) => row.contact_id);
  if (contactIds.length === 0) return { success: true as const, marked: 0 };

  const readAt = new Date().toISOString();
  for (let i = 0; i < contactIds.length; i += 100) {
    const { error } = await supabase
      .from("contacts")
      .update({ last_read_at: readAt })
      .in("id", contactIds.slice(i, i + 100));

    if (error) return { error: "Conversations could not be marked as read." };
  }

  revalidatePath("/unread-messages");
  return { success: true as const, marked: contactIds.length };
}
