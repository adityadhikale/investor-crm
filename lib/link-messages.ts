import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeToLocalPhone } from "@/lib/whatsapp";

/**
 * Links WhatsApp messages that arrived from a number before it was saved as
 * a contact (contact_id = null) to the contact that now has that number.
 * Never throws: a failure here must not break adding or importing contacts.
 */
export async function linkUnmatchedMessages(
  supabase: SupabaseClient,
  contacts: Array<{ id: string; phone: string | null }>,
): Promise<void> {
  try {
    const idByPhone = new Map<string, string>();
    for (const contact of contacts) {
      const phone = normalizeToLocalPhone(contact.phone ?? "");
      if (phone) idByPhone.set(phone, contact.id);
    }
    const phones = [...idByPhone.keys()];

    for (let i = 0; i < phones.length; i += 200) {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("phone")
        .is("contact_id", null)
        .in("phone", phones.slice(i, i + 200));
      if (error || !data) continue;

      for (const phone of new Set(data.map((row) => row.phone as string))) {
        await supabase
          .from("whatsapp_messages")
          .update({ contact_id: idByPhone.get(phone) })
          .is("contact_id", null)
          .eq("phone", phone);
      }
    }
  } catch (err) {
    console.error("[link-messages] Could not link earlier WhatsApp messages:", err);
  }
}
