import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppMediaMessage } from "@/lib/whatsapp";
import { insertOutboundMessage } from "@/lib/message-status";

/**
 * Template buttons that get an automatic reply. When someone taps one of the
 * quick-reply buttons on our template, WhatsApp sends it to us as a message
 * and opens a 24-hour window, so the reply can be a normal file message.
 *
 * To change the PDF, replace the file in /public and keep the same name (or
 * change `file` here). The file is sent from the live site's own address.
 */
const SITE_URL = process.env.URL || "https://investor-crm.netlify.app";

const BUTTON_AUTO_REPLIES: {
  buttonTitle: string;
  /** Text that must appear in the message the button belongs to (our template). */
  templateTextIncludes: string;
  file: string;
  filename: string;
  caption: string;
}[] = [
  {
    buttonTitle: "Send details first",
    templateTextIncludes: "CREST Family Office Advisory",
    file: "/crest-company-details.pdf",
    filename: "CREST Capital - Company Details.pdf",
    caption: "Thank you for your interest. Please find our company details attached.",
  },
];

/**
 * Sends the matching file when an incoming message is one of the buttons
 * above. Never throws: a failure here must not break message storage.
 */
export async function sendButtonAutoReply(
  supabase: SupabaseClient,
  args: {
    buttonTitle: string | null;
    /** ID of the message the button was tapped on (Meta's `context.id`). */
    repliedToId: string | undefined;
    phone: string | undefined;
    contactId: string | null;
  },
): Promise<void> {
  const title = args.buttonTitle?.trim().toLowerCase();
  if (!title || !args.phone) return;

  const rule = BUTTON_AUTO_REPLIES.find((r) => r.buttonTitle.toLowerCase() === title);
  if (!rule) return;

  // Only for our approved template: the tapped message must be one we sent.
  if (!args.repliedToId) return;
  const { data: original } = await supabase
    .from("whatsapp_messages")
    .select("message_text")
    .eq("wamid", args.repliedToId)
    .eq("direction", "out")
    .maybeSingle();
  if (!original?.message_text?.includes(rule.templateTextIncludes)) return;

  try {
    const response = await sendWhatsAppMediaMessage({
      to: args.phone,
      link: `${SITE_URL}${rule.file}`,
      mediaType: "document",
      filename: rule.filename,
      caption: rule.caption,
    });

    // Keep it in the chat history only when the sender is a saved contact.
    if (args.contactId) {
      await insertOutboundMessage(
        supabase,
        {
          contact_id: args.contactId,
          message_text: rule.caption,
          media_url: `${SITE_URL}${rule.file}`,
        },
        response.messages?.[0]?.id,
      );
    }
  } catch (err) {
    console.error("[WhatsApp Webhook] Auto-reply failed:", err);
  }
}
