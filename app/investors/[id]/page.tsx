import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { InvestorDetail, type WhatsAppMessage } from "@/components/investor-detail";
import type { MeetingNote } from "@/app/contacts/actions";
import type { FollowUp } from "@/app/investors/actions";
import { isInvestorTag } from "@/lib/tags";

export const metadata: Metadata = {
  title: "Investor Details",
};

export default async function InvestorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireAuth();
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select(
      "id, name, phone, email, tags, date_saved, notes, whatsapp_summary, whatsapp_summary_generated_at, contact_groups(groups(id, name))"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (contactError || !contact || !contact.tags?.some((tag: string) => isInvestorTag(tag))) {
    notFound();
  }

  const { data: notes, error: notesError } = await supabase
    .from("interactions")
    .select("id, note, created_at")
    .eq("contact_id", id)
    .eq("type", "meeting")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const { data: followUps, error: followUpsError } = await supabase
    .from("follow_ups")
    .select("id, due_date, message, is_done, created_at")
    .eq("contact_id", id)
    .is("deleted_at", null)
    .order("is_done", { ascending: true })
    .order("due_date", { ascending: true })
    .order("created_at", { ascending: true });

  const { data: whatsappMessages, error: whatsAppMessagesError } = await supabase
    .from("whatsapp_messages")
    .select("id, direction, message_text, media_url, sent_at, created_at")
    .eq("contact_id", id)
    .is("deleted_at", null)
    .order("sent_at", { ascending: true });

  return (
    <InvestorDetail
      contact={contact}
      initialNotes={notesError ? [] : (notes ?? []) as MeetingNote[]}
      notesError={notesError ? "Meeting notes could not be loaded." : null}
      initialFollowUps={followUpsError ? [] : (followUps ?? []) as FollowUp[]}
      followUpsError={followUpsError ? "Follow-ups could not be loaded." : null}
      initialWhatsAppMessages={whatsAppMessagesError ? [] : (whatsappMessages ?? []) as WhatsAppMessage[]}
      whatsAppMessagesError={whatsAppMessagesError ? "WhatsApp messages could not be loaded." : null}
      initialWhatsAppSummary={contact.whatsapp_summary ?? null}
      initialWhatsAppSummaryGeneratedAt={contact.whatsapp_summary_generated_at ?? null}
    />
  );
}
