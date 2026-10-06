import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase-service";
import {
  normalizePhoneForWhatsApp,
  sendWhatsAppMessage,
  sendWhatsAppTemplateMessage,
} from "@/lib/whatsapp";
import { fetchAllPages } from "@/lib/supabase-pagination";
import { insertOutboundMessage } from "@/lib/message-status";

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


/** How far a broadcast has got. `done` once every recipient has an outcome. */
export interface BroadcastProgress {
  total: number;
  sent: number;
  skipped: number;
  failed: number;
  /** Recipients still waiting to be sent. */
  remaining: number;
  done: boolean;
}

export type SendBroadcastResult =
  | ({ success: true; error?: undefined } & BroadcastProgress)
  | { success?: false; error: string };

// Netlify allows ~60 s per request. Recipients are claimed in small batches
// and sent a few at a time, stopping with a safety margin before the limit.
const BATCH_SIZE = 20;
const CONCURRENCY = 5;
const DEADLINE_MARGIN_MS = 6_000;
/** A recipient claimed this long ago without an outcome was interrupted. */
const STALE_SENDING_MS = 10 * 60 * 1000;
/** Time budget for one "Send Now" / "continue" request from the browser. */
export const SEND_NOW_BUDGET_MS = 40_000;
/** Time budget for one scheduler run (the scheduled function waits up to 30 s). */
const SCHEDULER_BUDGET_MS = 22_000;

type TargetContact = { id: string; name: string; phone: string; email?: string | null };

type RecipientRow = {
  id: string;
  contact_id: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
};

interface PreparedBroadcast {
  id: string;
  messageText: string;
  targetType: string;
  targetIds: string[];
  templateBody: string | null;
  mappings: Record<string, ValidatedMapping>;
  /** Set for templates synced from Meta: sent as a real WhatsApp template. */
  metaTemplate: { name: string; language: string } | null;
}

/** Loads a broadcast and checks its template and variable mappings. */
async function prepareBroadcast(
  supabase: SupabaseClient,
  broadcastId: string
): Promise<{ prepared?: PreparedBroadcast; error?: string }> {
  const { data: broadcast, error: fetchError } = await supabase
    .from("broadcasts")
    .select("id, message_text, target_type, target_ids, template_id, variable_mappings")
    .eq("id", broadcastId)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError || !broadcast) {
    return { error: "Broadcast not found." };
  }

  let templateBody: string | null = null;
  let mappings: Record<string, ValidatedMapping> = {};
  let metaTemplate: PreparedBroadcast["metaTemplate"] = null;

  if (broadcast.template_id) {
    const { data: tmpl, error: tmplError } = await supabase
      .from("templates")
      .select("id, name, language, body_text, meta_template_id, approved_at")
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

    const validation = validateTemplateMappingsForSend(tmpl.body_text, broadcast.variable_mappings);
    if (validation.error) {
      return { error: validation.error };
    }

    templateBody = tmpl.body_text;
    mappings = validation.mappings;
  }

  return {
    prepared: {
      id: broadcast.id,
      messageText: broadcast.message_text,
      targetType: broadcast.target_type,
      targetIds: broadcast.target_ids ?? [],
      templateBody,
      mappings,
      metaTemplate,
    },
  };
}

/** The contacts a broadcast targets (group members, tagged or hand-picked). */
async function resolveTargetContacts(
  supabase: SupabaseClient,
  prepared: PreparedBroadcast
): Promise<TargetContact[]> {
  if (prepared.targetType === "manual") {
    return fetchAllPages<TargetContact>((from, to) =>
      supabase
        .from("contacts")
        .select("id, name, phone, email")
        .in("id", prepared.targetIds)
        .is("deleted_at", null)
        .range(from, to)
    );
  }

  if (prepared.targetType === "group") {
    const relations = await fetchAllPages<{ contact_id: string; contacts: unknown }>((from, to) =>
      supabase
        .from("contact_groups")
        .select("contact_id, contacts(id, name, phone, email, deleted_at)")
        .in("group_id", prepared.targetIds)
        .range(from, to)
    );
    const contactMap = new Map<string, TargetContact>();
    for (const rel of relations) {
      const c = rel.contacts as (TargetContact & { deleted_at: string | null }) | null;
      if (c && !c.deleted_at && !contactMap.has(c.id)) {
        contactMap.set(c.id, { id: c.id, name: c.name, phone: c.phone, email: c.email ?? null });
      }
    }
    return Array.from(contactMap.values());
  }

  if (prepared.targetType === "tag") {
    return fetchAllPages<TargetContact>((from, to) =>
      supabase
        .from("contacts")
        .select("id, name, phone, email")
        .overlaps("tags", prepared.targetIds)
        .is("deleted_at", null)
        .range(from, to)
    );
  }

  return [];
}

/**
 * Starts sending a broadcast: checks it, moves it from `fromStatus` to
 * "sending" (one conditional update, so it can only start once) and records
 * every recipient as pending. Messages are then sent by processBroadcast.
 */
export async function startBroadcast(
  supabase: SupabaseClient,
  broadcastId: string,
  fromStatus: "draft" | "scheduled"
): Promise<{ error?: string }> {
  const { prepared, error } = await prepareBroadcast(supabase, broadcastId);
  if (!prepared) return { error: error ?? "Broadcast not found." };

  let contacts: TargetContact[];
  try {
    contacts = await resolveTargetContacts(supabase, prepared);
  } catch {
    return { error: "Failed to resolve recipient contacts." };
  }
  if (contacts.length === 0) {
    return { error: "No active recipient contacts found for this target." };
  }

  const { data: claimed, error: claimError } = await supabase
    .from("broadcasts")
    .update({ status: "sending" })
    .eq("id", broadcastId)
    .eq("status", fromStatus)
    .select("id");
  if (claimError) {
    return { error: claimError.message || "Could not start the broadcast." };
  }
  if (!claimed || claimed.length === 0) {
    return { error: "This broadcast is already being sent or has been sent." };
  }

  for (let i = 0; i < contacts.length; i += 500) {
    const rows = contacts.slice(i, i + 500).map((c) => ({
      broadcast_id: broadcastId,
      contact_id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email ?? null,
    }));
    const { error: insertError } = await supabase
      .from("broadcast_recipients")
      .upsert(rows, { onConflict: "broadcast_id,contact_id", ignoreDuplicates: true });
    if (insertError) {
      // Nothing has been sent yet: undo, so the broadcast can be tried again.
      await supabase.from("broadcast_recipients").delete().eq("broadcast_id", broadcastId);
      await supabase.from("broadcasts").update({ status: fromStatus }).eq("id", broadcastId);
      return { error: `Could not prepare the recipients: ${insertError.message}` };
    }
  }

  revalidatePath("/broadcasts");
  return {};
}

/** Sends to one recipient and records the outcome on its row. */
async function sendToRecipient(
  supabase: SupabaseClient,
  prepared: PreparedBroadcast,
  recipient: RecipientRow,
  openWindowIds: Set<string> | null
): Promise<void> {
  const finish = async (
    status: "sent" | "skipped" | "failed",
    error: string | null = null,
    wamid?: string
  ) => {
    const fields = {
      status,
      error,
      sent_at: status === "sent" ? new Date().toISOString() : null,
    };
    const result = await supabase
      .from("broadcast_recipients")
      .update(wamid ? { ...fields, wamid } : fields)
      .eq("id", recipient.id);
    // Until the add_wamid_to_broadcast_recipients migration is run, the column
    // doesn't exist; record the outcome without it rather than losing it.
    if (result.error && wamid && /wamid/i.test(result.error.message)) {
      return supabase.from("broadcast_recipients").update(fields).eq("id", recipient.id);
    }
    return result;
  };

  // Plain text only reaches contacts inside their 24-hour reply window.
  if (openWindowIds && !(recipient.contact_id && openWindowIds.has(recipient.contact_id))) {
    await finish(
      "skipped",
      "Not sent: no message from this contact in the last 24 hours. Use an approved Meta template."
    );
    return;
  }

  const normalizedPhone = normalizePhoneForWhatsApp(recipient.phone ?? "");
  if (!normalizedPhone) {
    await finish("failed", "Invalid phone number format");
    return;
  }

  let messageToSend = prepared.messageText;
  let templateParams: string[] = [];
  if (prepared.templateBody) {
    const resolution = resolveBroadcastMessageForContact({
      templateBody: prepared.templateBody,
      mappings: prepared.mappings,
      contact: {
        name: recipient.name ?? "",
        phone: recipient.phone ?? "",
        email: recipient.email,
      },
    });
    if (resolution.error || !resolution.message) {
      await finish("failed", resolution.error || "Failed to resolve template variables");
      return;
    }
    messageToSend = resolution.message;
    templateParams = resolution.params;
  }

  let wamid: string | undefined;
  try {
    const response = prepared.metaTemplate
      ? await sendWhatsAppTemplateMessage({
          to: normalizedPhone,
          templateName: prepared.metaTemplate.name,
          language: prepared.metaTemplate.language,
          bodyParameters: templateParams,
        })
      : await sendWhatsAppMessage({ to: normalizedPhone, message: messageToSend });
    wamid = response.messages?.[0]?.id;
  } catch (err: unknown) {
    await finish("failed", err instanceof Error ? err.message : "Failed to send message");
    return;
  }

  await finish("sent", null, wamid);

  // Log it so it shows in WhatsApp History. The message already went out, so
  // a logging failure doesn't count against the recipient.
  if (recipient.contact_id) {
    const { error: logError } = await insertOutboundMessage(
      supabase,
      { contact_id: recipient.contact_id, message_text: messageToSend },
      wamid,
    );
    if (logError) {
      console.error("Failed to log outbound broadcast message:", logError);
    }
  }
}

async function countRecipients(
  supabase: SupabaseClient,
  broadcastId: string,
  status: string
): Promise<number> {
  const { count } = await supabase
    .from("broadcast_recipients")
    .select("id", { count: "exact", head: true })
    .eq("broadcast_id", broadcastId)
    .eq("status", status);
  return count ?? 0;
}

/** Current counts; marks the broadcast sent (with its summary) once all are done. */
async function finalizeIfDone(
  supabase: SupabaseClient,
  broadcastId: string
): Promise<BroadcastProgress> {
  const [pending, sending, sent, skipped, failed] = await Promise.all(
    ["pending", "sending", "sent", "skipped", "failed"].map((status) =>
      countRecipients(supabase, broadcastId, status)
    )
  );
  const remaining = pending + sending;
  const progress: BroadcastProgress = {
    total: remaining + sent + skipped + failed,
    sent,
    skipped,
    failed,
    remaining,
    done: remaining === 0,
  };
  if (!progress.done) return progress;

  const [{ data: skippedRows }, { data: failedRows }] = await Promise.all([
    supabase
      .from("broadcast_recipients")
      .select("name")
      .eq("broadcast_id", broadcastId)
      .eq("status", "skipped")
      .order("name")
      .limit(100),
    supabase
      .from("broadcast_recipients")
      .select("name, error")
      .eq("broadcast_id", broadcastId)
      .eq("status", "failed")
      .order("name")
      .limit(100),
  ]);

  const summary: BroadcastSendSummary = {
    total: progress.total,
    sent,
    skipped,
    failed,
    skipped_names: (skippedRows ?? []).map((r) => r.name ?? "Unknown"),
    failures: (failedRows ?? []).map((r) => ({
      name: r.name ?? "Unknown",
      error: r.error ?? "Unknown error",
    })),
  };

  await supabase
    .from("broadcasts")
    .update({ status: "sent", sent_at: new Date().toISOString(), send_summary: summary })
    .eq("id", broadcastId)
    .eq("status", "sending");

  revalidatePath("/broadcasts");
  revalidatePath(`/broadcasts/${broadcastId}`);
  return progress;
}

/**
 * Sends the next batches of a broadcast that is "sending", until every
 * recipient is done or the time budget runs out. Safe to call from several
 * places at once: each recipient is claimed by exactly one caller.
 */
export async function processBroadcast(
  supabase: SupabaseClient,
  broadcastId: string,
  budgetMs: number
): Promise<BroadcastProgress> {
  const deadline = Date.now() + budgetMs - DEADLINE_MARGIN_MS;

  // A recipient left "sending" by a run that was cut off may or may not have
  // received the message; never resend, record it as failed instead.
  await supabase
    .from("broadcast_recipients")
    .update({
      status: "failed",
      error: "Interrupted while sending; it may or may not have been delivered.",
    })
    .eq("broadcast_id", broadcastId)
    .eq("status", "sending")
    .lt("claimed_at", new Date(Date.now() - STALE_SENDING_MS).toISOString());

  const { prepared, error } = await prepareBroadcast(supabase, broadcastId);
  if (!prepared) {
    // E.g. its template was deleted mid-send: the rest can't be sent.
    await supabase
      .from("broadcast_recipients")
      .update({ status: "failed", error: error ?? "Broadcast could not be sent." })
      .eq("broadcast_id", broadcastId)
      .eq("status", "pending");
    return finalizeIfDone(supabase, broadcastId);
  }

  while (Date.now() < deadline) {
    const { data: batch, error: claimError } = await supabase.rpc("claim_broadcast_recipients", {
      p_broadcast_id: broadcastId,
      p_limit: BATCH_SIZE,
    });
    if (claimError) {
      console.error("[broadcast] Could not claim recipients:", claimError.message);
      break;
    }
    const recipients = (batch ?? []) as RecipientRow[];
    if (recipients.length === 0) break;

    const openWindowIds = prepared.metaTemplate
      ? null
      : await contactsWithOpenReplyWindow(
          supabase,
          recipients.map((r) => r.contact_id).filter((id): id is string => Boolean(id))
        );

    for (let i = 0; i < recipients.length; i += CONCURRENCY) {
      await Promise.all(
        recipients
          .slice(i, i + CONCURRENCY)
          .map((r) => sendToRecipient(supabase, prepared, r, openWindowIds))
      );
    }
  }

  return finalizeIfDone(supabase, broadcastId);
}

/** Starts a draft broadcast (if not already started) and sends as much as fits in one request. */
export async function sendBroadcastBatch(
  supabase: SupabaseClient,
  broadcastId: string
): Promise<SendBroadcastResult> {
  if (!broadcastId) return { error: "Broadcast ID is required." };

  const { data: broadcast } = await supabase
    .from("broadcasts")
    .select("status")
    .eq("id", broadcastId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!broadcast) return { error: "Broadcast not found." };
  if (broadcast.status === "sent") return { error: "This broadcast has already been sent." };
  if (broadcast.status === "scheduled") {
    return { error: "This broadcast is scheduled. Edit it to send it now instead." };
  }

  if (broadcast.status === "draft") {
    const started = await startBroadcast(supabase, broadcastId, "draft");
    if (started.error) return { error: started.error };
  }

  const progress = await processBroadcast(supabase, broadcastId, SEND_NOW_BUDGET_MS);
  return { success: true, ...progress };
}

export interface ProcessedBroadcastResult {
  broadcastId: string;
  success: boolean;
  error?: string;
  total?: number;
  sentCount?: number;
  failedCount?: number;
  skippedCount?: number;
  remaining?: number;
}

export interface DispatchDueBroadcastsSummary {
  success: boolean;
  error?: string;
  processedCount: number;
  results: ProcessedBroadcastResult[];
}

/**
 * Scheduler entry point (every 5 minutes): starts broadcasts whose time has
 * come, then continues every broadcast that is still sending.
 */
export async function dispatchDueBroadcasts(): Promise<DispatchDueBroadcastsSummary> {
  const supabase = createServiceRoleClient();
  const runDeadline = Date.now() + SCHEDULER_BUDGET_MS;
  const results: ProcessedBroadcastResult[] = [];

  const { data: dueBroadcasts, error: fetchError } = await supabase
    .from("broadcasts")
    .select("id")
    .eq("status", "scheduled")
    .lte("scheduled_for", new Date().toISOString())
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

  for (const broadcast of dueBroadcasts ?? []) {
    const started = await startBroadcast(supabase, broadcast.id, "scheduled");
    // Errors here happen before anything is sent; the broadcast stays
    // "scheduled" and a later run tries again.
    if (started.error) {
      results.push({ broadcastId: broadcast.id, success: false, error: started.error });
    }
  }

  const { data: sending } = await supabase
    .from("broadcasts")
    .select("id")
    .eq("status", "sending")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  for (const broadcast of sending ?? []) {
    const budget = runDeadline - Date.now();
    if (budget <= DEADLINE_MARGIN_MS) break;
    try {
      const progress = await processBroadcast(supabase, broadcast.id, budget);
      results.push({
        broadcastId: broadcast.id,
        success: true,
        total: progress.total,
        sentCount: progress.sent,
        failedCount: progress.failed,
        skippedCount: progress.skipped,
        remaining: progress.remaining,
      });
    } catch (err: unknown) {
      results.push({
        broadcastId: broadcast.id,
        success: false,
        error: err instanceof Error ? err.message : "Failed to dispatch broadcast",
      });
    }
  }

  return { success: true, processedCount: results.length, results };
}
