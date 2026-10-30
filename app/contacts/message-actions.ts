"use server";

import { requireActionAuth } from "@/lib/auth";
import { draftMessage } from "@/lib/message-drafting";
import { isReplyWindowOpen } from "@/lib/reply-window";

/**
 * Drafts a personalised message for a contact. Nothing is saved or sent: the
 * owner reviews the text, then copies it or sends it with sendWhatsAppReply.
 * `windowOpen` says whether WhatsApp would currently deliver a free-form message.
 */
export async function generatePersonalisedMessage(
  contactId: string,
): Promise<{ message: string; windowOpen: boolean } | { error: string }> {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const id = contactId.trim();
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id, name, company, tags, notes")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (contactError || !contact) return { error: "The contact could not be found." };

  const [messages, notes, followUps, windowOpen] = await Promise.all([
    supabase
      .from("whatsapp_messages")
      .select("direction, message_text, sent_at, created_at")
      .eq("contact_id", id)
      .is("deleted_at", null)
      .order("sent_at", { ascending: true }),
    supabase
      .from("interactions")
      .select("note, created_at")
      .eq("contact_id", id)
      .eq("type", "meeting")
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("follow_ups")
      .select("due_date, message, is_done")
      .eq("contact_id", id)
      .is("deleted_at", null),
    isReplyWindowOpen(supabase, id),
  ]);
  if (messages.error || notes.error || followUps.error) {
    return { error: "Could not load the contact's messages, notes or follow-ups." };
  }

  try {
    const message = await draftMessage({
      todayIsoDate: new Date().toISOString().slice(0, 10),
      contact,
      messages: messages.data ?? [],
      meetingNotes: notes.data ?? [],
      followUps: followUps.data ?? [],
    });
    return { message, windowOpen };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "The message could not be generated." };
  }
}
