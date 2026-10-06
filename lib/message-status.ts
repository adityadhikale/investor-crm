import type { SupabaseClient } from "@supabase/supabase-js";

/** Delivery states in order; a message never moves backwards. */
const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };

export function isKnownStatus(status: string | undefined): boolean {
  return Boolean(status && status in STATUS_RANK);
}

/**
 * Plain-language reasons for WhatsApp's most common delivery error codes.
 * https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 */
const ERROR_EXPLANATIONS: Record<number, string> = {
  130472: "Meta didn't deliver this message to this person (part of a Meta delivery experiment).",
  131021: "The recipient is the same as the sender number.",
  131026: "WhatsApp couldn't deliver it: the number isn't on WhatsApp, or the person can't receive this message.",
  131047: "The 24-hour reply window is closed; only approved templates can be sent.",
  131048: "Blocked as spam: too many messages to this number were reported or ignored.",
  131049:
    "Meta limited this marketing message: this person has already received many marketing messages from businesses, so WhatsApp held it back. Try a Utility template, or ask them to message you first.",
  131050: "This person has opted out of marketing messages from businesses.",
  131051: "The message type isn't supported.",
  131052: "The media file couldn't be downloaded by WhatsApp.",
  131053: "The media file couldn't be uploaded to WhatsApp.",
  131056: "Too many messages sent to this person in a short time; try again later.",
  131042: "A payment problem with the WhatsApp Business account stopped the message. Check billing in WhatsApp Manager.",
  131031: "The WhatsApp Business account is restricted.",
  132000: "The template's variables don't match what Meta approved.",
  132001: "The template doesn't exist or isn't approved in that language.",
  132007: "The template text breaks WhatsApp's content policy.",
  132015: "The template is paused because of low quality.",
  132016: "The template is disabled because of low quality.",
};

export function describeDeliveryError(
  code: number | undefined,
  title?: string,
  detail?: string,
): string {
  const explained = code !== undefined ? ERROR_EXPLANATIONS[code] : undefined;
  const raw = [title, detail].filter(Boolean).join(" — ");
  const base = explained ?? (raw || "WhatsApp could not deliver this message.");
  return code !== undefined ? `${base} (code ${code})` : base;
}

/**
 * Saves a message we sent, with WhatsApp's message ID so its delivery status
 * can be matched later. Until the delivery-status migration is run, the new
 * columns don't exist; then the message is saved without them.
 */
export async function insertOutboundMessage(
  supabase: SupabaseClient,
  row: {
    contact_id: string;
    message_text: string | null;
    media_url?: string | null;
    sent_at?: string;
  },
  wamid: string | undefined,
): Promise<{ error: { message: string } | null }> {
  const base = {
    contact_id: row.contact_id,
    direction: "out",
    message_text: row.message_text,
    media_url: row.media_url ?? null,
    sent_at: row.sent_at ?? new Date().toISOString(),
  };

  if (wamid) {
    const withStatus = await supabase
      .from("whatsapp_messages")
      .insert({ ...base, wamid, status: "sent", status_at: base.sent_at });
    if (!withStatus.error) return { error: null };
    // The webhook already saved this message (an echo arrived first): nothing to add.
    if (withStatus.error.code === "23505") return { error: null };
    if (!/wamid|status/i.test(withStatus.error.message)) return { error: withStatus.error };
  }

  const { error } = await supabase.from("whatsapp_messages").insert(base);
  return { error };
}

/**
 * Applies a delivery report from Meta to the message with that ID. Stale or
 * out-of-order reports are ignored (e.g. "sent" arriving after "delivered").
 * Returns false if no such message exists (yet).
 */
export async function applyDeliveryStatus(
  supabase: SupabaseClient,
  wamid: string,
  status: string,
  errorText: string | null,
  at: string,
): Promise<boolean> {
  if (!isKnownStatus(status)) return false;

  const { data: message, error: findError } = await supabase
    .from("whatsapp_messages")
    .select("id, status")
    .eq("wamid", wamid)
    .maybeSingle();
  if (findError || !message) return false;

  const current = message.status as string | null;
  if (current && STATUS_RANK[current] >= STATUS_RANK[status] && current !== "failed") {
    return true;
  }
  // A failure is final: it can't be overwritten by a later "sent"/"delivered" echo.
  if (current === "failed") return true;

  await supabase
    .from("whatsapp_messages")
    .update({
      status,
      status_error: status === "failed" ? errorText : null,
      status_at: at,
    })
    .eq("id", message.id);
  return true;
}
