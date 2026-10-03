import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase-service";
import {
  normalizePhoneForWhatsApp,
  sendWhatsAppMessage,
  sendWhatsAppTemplateMessage,
} from "@/lib/whatsapp";
import { fetchAllPages } from "@/lib/supabase-pagination";

export interface BroadcastSendResult {
  contactId: string;
  name: string;
  phone: string;
  success: boolean;
  error?: string;
  /** Not attempted: plain text and the contact's 24-hour reply window is closed. */
  skipped?: boolean;
}

/** Stored on broadcasts.send_summary once a broadcast has been sent. */
export interface BroadcastSendSummary {
  total: number;
  sent: number;
  /** Plain text not sent because the contact's 24-hour reply window was closed. */
  skipped: number;
  failed: number;
  skipped_names: string[];
  failures: Array<{ name: string; error: string }>;
}

const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Contacts (of the given ids) who messaged in the last 24 hours. Meta only
 * delivers free-form text to them; to anyone else it is silently dropped.
 * Returns null if the lookup fails, so sending isn't blocked by a CRM error.
 */
async function contactsWithOpenReplyWindow(
  supabase: SupabaseClient,
  contactIds: string[],
): Promise<Set<string> | null> {
  const since = new Date(Date.now() - REPLY_WINDOW_MS).toISOString();
  const open = new Set<string>();
  try {
    for (let i = 0; i < contactIds.length; i += 200) {
      const rows = await fetchAllPages<{ contact_id: string }>((from, to) =>
        supabase
          .from("whatsapp_messages")
          .select("contact_id")
          .in("contact_id", contactIds.slice(i, i + 200))
          .eq("direction", "in")
          .is("deleted_at", null)
          .gte("sent_at", since)
          .range(from, to)
      );
      for (const row of rows) open.add(row.contact_id);
    }
  } catch {
    return null;
  }
  return open;
}

type SupportedContactField = "first_name" | "name" | "phone" | "email";
const ALLOWED_CONTACT_FIELDS = new Set<SupportedContactField>([
  "first_name",
  "name",
  "phone",
  "email",
]);

interface ValidatedMappingContactField {
  type: "contact_field";
  field: SupportedContactField;
  fallback?: string;
}

interface ValidatedMappingStatic {
  type: "static";
  value: string;
}

type ValidatedMapping = ValidatedMappingContactField | ValidatedMappingStatic;

function extractNumericPlaceholders(text: string): string[] {
  const matches = new Set<string>();
  const regex = /\{\{(\d+)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    matches.add(match[1]);
  }
  return Array.from(matches).sort((a, b) => Number(a) - Number(b));
}

function validateTemplateMappingsForSend(
  templateBody: string,
  rawMappings: unknown
): { error: string | null; mappings: Record<string, ValidatedMapping> } {
  const placeholders = extractNumericPlaceholders(templateBody);
  if (placeholders.length === 0) {
    return { error: null, mappings: {} };
  }

  if (
    !rawMappings ||
    typeof rawMappings !== "object" ||
    Array.isArray(rawMappings)
  ) {
    return {
      error: "Broadcast is missing variable mappings for template placeholders.",
      mappings: {},
    };
  }

  const mapObj = rawMappings as Record<string, unknown>;
  const validated: Record<string, ValidatedMapping> = {};

  for (const ph of placeholders) {
    const entry = mapObj[ph];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return {
        error: `Template placeholder {{${ph}}} has no configured mapping.`,
        mappings: {},
      };
    }

    const rawEntry = entry as Record<string, unknown>;
    const type = rawEntry.type;

    if (type === "static") {
      if (typeof rawEntry.value !== "string" || !rawEntry.value.trim()) {
        return {
          error: `Static mapping for {{${ph}}} must have a non-empty value.`,
          mappings: {},
        };
      }
      validated[ph] = {
        type: "static",
        value: rawEntry.value,
      };
    } else if (type === "contact_field") {
      const field = rawEntry.field as SupportedContactField;
      if (!ALLOWED_CONTACT_FIELDS.has(field)) {
        return {
          error: `Invalid contact field "${String(rawEntry.field)}" for placeholder {{${ph}}}.`,
          mappings: {},
        };
      }
      validated[ph] = {
        type: "contact_field",
        field,
        fallback:
          typeof rawEntry.fallback === "string" && rawEntry.fallback.trim()
            ? rawEntry.fallback.trim()
            : undefined,
      };
    } else {
      return {
        error: `Invalid mapping type for placeholder {{${ph}}}.`,
        mappings: {},
      };
    }
  }

  return { error: null, mappings: validated };
}

function resolveContactField(
  contact: { name?: string | null; phone?: string | null; email?: string | null },
  field: SupportedContactField
): string | null {
  if (field === "first_name") {
    const name = (contact.name ?? "").trim();
    if (!name) return null;
    const tokens = name.split(/\s+/);
    return tokens[0] || null;
  }
  if (field === "name") {
    const name = (contact.name ?? "").trim();
    return name || null;
  }
  if (field === "phone") {
    const phone = (contact.phone ?? "").trim();
    return phone || null;
  }
  if (field === "email") {
    const email = (contact.email ?? "").trim();
    return email || null;
  }
  return null;
}

function resolveBroadcastMessageForContact({
  templateBody,
  mappings,
  contact,
}: {
  templateBody: string;
  mappings: Record<string, ValidatedMapping>;
  contact: { name: string; phone: string; email?: string | null };
}): { message: string | null; params: string[]; error: string | null } {
  const placeholders = extractNumericPlaceholders(templateBody);
  let resolved = templateBody;
  // Values in placeholder order, for sending a Meta template.
  const params: string[] = [];

  for (const ph of placeholders) {
    const mapping = mappings[ph];
    if (!mapping) {
      return {
        message: null,
        params: [],
        error: `Missing mapping for placeholder {{${ph}}}`,
      };
    }

    if (mapping.type === "static") {
      resolved = resolved.replaceAll(`{{${ph}}}`, mapping.value);
      params.push(mapping.value);
    } else if (mapping.type === "contact_field") {
      const fieldVal = resolveContactField(contact, mapping.field);
      let finalVal: string | null = fieldVal;

      if (!finalVal) {
        if (mapping.fallback) {
          finalVal = mapping.fallback;
        } else {
          return {
            message: null,
            params: [],
            error: `Contact is missing "${mapping.field}" with no fallback provided for {{${ph}}}`,
          };
        }
      }

      resolved = resolved.replaceAll(`{{${ph}}}`, finalVal);
      params.push(finalVal);
    }
  }

  return { message: resolved, params, error: null };
}

export type SendBroadcastResult =
  | {
      success: true;
      total: number;
      sentCount: number;
      failedCount: number;
      /** Plain-text recipients skipped because their reply window is closed. */
      skippedCount: number;
      results: BroadcastSendResult[];
      error?: undefined;
    }
  | {
      success?: false;
      error: string;
      total?: undefined;
      sentCount?: undefined;
      failedCount?: undefined;
      skippedCount?: undefined;
      results?: undefined;
    };

export async function dispatchBroadcast(
  broadcastId: string,
  supabase: SupabaseClient
): Promise<SendBroadcastResult> {
  if (!broadcastId) {
    return { error: "Broadcast ID is required." };
  }

  // 1. Fetch broadcast row
  const { data: broadcast, error: fetchError } = await supabase
    .from("broadcasts")
    .select("id, message_text, target_type, target_ids, status, template_id, variable_mappings")
    .eq("id", broadcastId)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError || !broadcast) {
    return { error: "Broadcast not found." };
  }

  // 2. If template-based, load referenced template and validate variable mappings
  let templateBody: string | null = null;
  let validatedMappings: Record<string, ValidatedMapping> = {};
  // Set when the template is synced from Meta: it is then sent as a real
  // WhatsApp template (allowed outside the 24-hour window), not as text.
  let metaTemplate: { name: string; language: string } | null = null;

  if (broadcast.template_id) {
    const { data: tmpl, error: tmplError } = await supabase
      .from("templates")
      .select("id, name, language, body_text, meta_template_id, approved_at, deleted_at")
      .eq("id", broadcast.template_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (tmplError || !tmpl || !tmpl.body_text) {
      return { error: "Referenced template not found or is inactive." };
    }

    if (tmpl.meta_template_id) {
      if (!tmpl.approved_at) {
        return {
          error: `Template "${tmpl.name}" is not approved by Meta yet. Sync templates again once it is approved.`,
        };
      }
      metaTemplate = { name: tmpl.name, language: tmpl.language };
    }

    const { error: mappingError, mappings } = validateTemplateMappingsForSend(
      tmpl.body_text,
      broadcast.variable_mappings
    );

    if (mappingError) {
      return { error: mappingError };
    }

    templateBody = tmpl.body_text;
    validatedMappings = mappings;
  }

  // 3. Resolve target contacts (with email for personalization)
  let targetContacts: Array<{ id: string; name: string; phone: string; email?: string | null }> = [];

  try {
    if (broadcast.target_type === "manual") {
      targetContacts = await fetchAllPages<{ id: string; name: string; phone: string; email?: string | null }>(
        (from, to) =>
          supabase
            .from("contacts")
            .select("id, name, phone, email")
            .in("id", broadcast.target_ids)
            .is("deleted_at", null)
            .range(from, to)
      );
    } else if (broadcast.target_type === "group") {
      const relations = await fetchAllPages<{ contact_id: string; contacts: unknown }>(
        (from, to) =>
          supabase
            .from("contact_groups")
            .select("contact_id, contacts(id, name, phone, email, deleted_at)")
            .in("group_id", broadcast.target_ids)
            .range(from, to)
      );

      const contactMap = new Map<string, { id: string; name: string; phone: string; email?: string | null }>();
      for (const rel of relations) {
        const c = rel.contacts as unknown as {
          id: string;
          name: string;
          phone: string;
          email?: string | null;
          deleted_at: string | null;
        } | null;
        if (c && !c.deleted_at && !contactMap.has(c.id)) {
          contactMap.set(c.id, {
            id: c.id,
            name: c.name,
            phone: c.phone,
            email: c.email ?? null,
          });
        }
      }
      targetContacts = Array.from(contactMap.values());
    } else if (broadcast.target_type === "tag") {
      targetContacts = await fetchAllPages<{ id: string; name: string; phone: string; email?: string | null }>(
        (from, to) =>
          supabase
            .from("contacts")
            .select("id, name, phone, email")
            .overlaps("tags", broadcast.target_ids)
            .is("deleted_at", null)
            .range(from, to)
      );
    }
  } catch {
    return { error: "Failed to resolve recipient contacts." };
  }

  if (targetContacts.length === 0) {
    return { error: "No active recipient contacts found for this target." };
  }

  // 4. Dispatch WhatsApp messages to each contact with per-recipient resolution
  const results: BroadcastSendResult[] = [];

  // Plain text only reaches contacts inside their 24-hour reply window; the
  // rest are skipped (and reported) instead of being silently dropped by Meta.
  const openWindowIds = metaTemplate
    ? null
    : await contactsWithOpenReplyWindow(supabase, targetContacts.map((c) => c.id));

  for (const contact of targetContacts) {
    if (openWindowIds && !openWindowIds.has(contact.id)) {
      results.push({
        contactId: contact.id,
        name: contact.name,
        phone: contact.phone,
        success: false,
        skipped: true,
        error: "Not sent: no message from this contact in the last 24 hours. Use an approved Meta template.",
      });
      continue;
    }

    const normalizedPhone = normalizePhoneForWhatsApp(contact.phone);
    if (!normalizedPhone) {
      results.push({
        contactId: contact.id,
        name: contact.name,
        phone: contact.phone,
        success: false,
        error: "Invalid phone number format",
      });
      continue;
    }

    let messageToSend: string;
    let templateParams: string[] = [];
    if (templateBody) {
      const resolution = resolveBroadcastMessageForContact({
        templateBody,
        mappings: validatedMappings,
        contact,
      });

      if (resolution.error || !resolution.message) {
        results.push({
          contactId: contact.id,
          name: contact.name,
          phone: normalizedPhone,
          success: false,
          error: resolution.error || "Failed to resolve template variables",
        });
        continue;
      }
      messageToSend = resolution.message;
      templateParams = resolution.params;
    } else {
      messageToSend = broadcast.message_text;
    }

    try {
      if (metaTemplate) {
        await sendWhatsAppTemplateMessage({
          to: normalizedPhone,
          templateName: metaTemplate.name,
          language: metaTemplate.language,
          bodyParameters: templateParams,
        });
      } else {
        await sendWhatsAppMessage({
          to: normalizedPhone,
          message: messageToSend,
        });
      }

      // Log the outbound message so it shows up in WhatsApp History. A
      // logging failure here doesn't affect the actual send, which already
      // succeeded, so it's swallowed rather than marking the recipient failed.
      const { error: logError } = await supabase.from("whatsapp_messages").insert({
        contact_id: contact.id,
        direction: "out",
        message_text: messageToSend,
        sent_at: new Date().toISOString(),
      });
      if (logError) {
        console.error("Failed to log outbound broadcast message:", logError);
      }

      results.push({
        contactId: contact.id,
        name: contact.name,
        phone: normalizedPhone,
        success: true,
      });
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err.message : "Failed to send message";
      results.push({
        contactId: contact.id,
        name: contact.name,
        phone: normalizedPhone,
        success: false,
        error: errMsg,
      });
    }
  }

  const sentCount = results.filter((r) => r.success).length;
  const skippedCount = results.filter((r) => r.skipped).length;
  const failedCount = results.filter((r) => !r.success && !r.skipped).length;

  // 5. Update broadcast row status and timestamp
  await supabase
    .from("broadcasts")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
    })
    .eq("id", broadcastId);

  // Saved separately so a missing send_summary column (migration not yet run)
  // can never stop the status update above.
  const summary: BroadcastSendSummary = {
    total: results.length,
    sent: sentCount,
    skipped: skippedCount,
    failed: failedCount,
    skipped_names: results.filter((r) => r.skipped).slice(0, 100).map((r) => r.name),
    failures: results
      .filter((r) => !r.success && !r.skipped)
      .slice(0, 100)
      .map((r) => ({ name: r.name, error: r.error ?? "Unknown error" })),
  };
  const { error: summaryError } = await supabase
    .from("broadcasts")
    .update({ send_summary: summary })
    .eq("id", broadcastId);
  if (summaryError) {
    console.error("[broadcast] Could not save send summary:", summaryError.message);
  }

  revalidatePath("/broadcasts");
  revalidatePath(`/broadcasts/${broadcastId}`);

  return {
    success: true,
    total: results.length,
    sentCount,
    failedCount,
    skippedCount,
    results,
  };
}

export interface ProcessedBroadcastResult {
  broadcastId: string;
  success: boolean;
  error?: string;
  total?: number;
  sentCount?: number;
  failedCount?: number;
  skippedCount?: number;
}

export interface DispatchDueBroadcastsSummary {
  success: boolean;
  error?: string;
  processedCount: number;
  results: ProcessedBroadcastResult[];
}

export async function dispatchDueBroadcasts(): Promise<DispatchDueBroadcastsSummary> {
  const supabase = createServiceRoleClient();

  const nowIso = new Date().toISOString();
  const { data: dueBroadcasts, error: fetchError } = await supabase
    .from("broadcasts")
    .select("id, scheduled_for")
    .eq("status", "scheduled")
    .lte("scheduled_for", nowIso)
    .is("deleted_at", null)
    .order("scheduled_for", { ascending: true });

  if (fetchError) {
    return {
      success: false,
      error: fetchError.message || "Failed to fetch due broadcasts",
      processedCount: 0,
      results: [],
    };
  }

  if (!dueBroadcasts || dueBroadcasts.length === 0) {
    return {
      success: true,
      processedCount: 0,
      results: [],
    };
  }

  const results: ProcessedBroadcastResult[] = [];

  for (const broadcast of dueBroadcasts) {
    // Claim the broadcast before sending: flip it from "scheduled" to "sent"
    // in one conditional update. If two runs overlap, or a run is cut off by a
    // function time limit, the broadcast can never be sent twice.
    const { data: claimed, error: claimError } = await supabase
      .from("broadcasts")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", broadcast.id)
      .eq("status", "scheduled")
      .select("id");

    if (claimError || !claimed || claimed.length === 0) {
      continue;
    }

    try {
      const res = await dispatchBroadcast(broadcast.id, supabase);
      if ("error" in res && res.error) {
        // These errors all happen before any message is sent, so put it back
        // to "scheduled" (as before) and let a later run retry it.
        await supabase
          .from("broadcasts")
          .update({ status: "scheduled", sent_at: null })
          .eq("id", broadcast.id);
        results.push({
          broadcastId: broadcast.id,
          success: false,
          error: res.error,
        });
      } else if ("success" in res && res.success) {
        results.push({
          broadcastId: broadcast.id,
          success: true,
          total: res.total,
          sentCount: res.sentCount,
          failedCount: res.failedCount,
          skippedCount: res.skippedCount,
        });
      } else {
        results.push({
          broadcastId: broadcast.id,
          success: false,
          error: "Unknown dispatch result",
        });
      }
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err.message : "Failed to dispatch broadcast";
      results.push({
        broadcastId: broadcast.id,
        success: false,
        error: errMsg,
      });
    }
  }

  return {
    success: true,
    processedCount: results.length,
    results,
  };
}
