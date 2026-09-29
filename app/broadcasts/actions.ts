"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireActionAuth } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase-service";
import {
  normalizePhoneForWhatsApp,
  sendWhatsAppMessage,
} from "@/lib/whatsapp";
import { fetchAllPages } from "@/lib/supabase-pagination";

export type TargetType = "group" | "tag" | "manual";

export interface GroupOption {
  id: string;
  name: string;
}

export interface ContactOption {
  id: string;
  name: string;
  phone: string;
}

export interface TemplateOption {
  id: string;
  name: string;
  category: string | null;
  body_text: string;
  variables: Record<string, string>;
  approved_at?: string | null;
}

export interface BroadcastData {
  id: string;
  message_text: string;
  target_type: TargetType;
  target_ids: string[];
  status: "draft" | "scheduled" | "sent";
  created_at: string;
  scheduled_for?: string | null;
  sent_at?: string | null;
  template_id?: string | null;
  variable_mappings?: Record<string, unknown> | null;
}

export interface CreateBroadcastDraftInput {
  message_text: string;
  target_type: TargetType;
  target_ids: string[];
  template_id?: string | null;
  variable_mappings?: Record<string, unknown> | null;
}

export interface UpdateBroadcastInput {
  message_text: string;
  target_type: TargetType;
  target_ids: string[];
  scheduled_for?: string;
  template_id?: string | null;
  variable_mappings?: Record<string, unknown> | null;
}

export interface CreateScheduledBroadcastInput {
  message_text: string;
  target_type: TargetType;
  target_ids: string[];
  scheduled_for: string;
  template_id?: string | null;
  variable_mappings?: Record<string, unknown> | null;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateTemplatePayload(data?: {
  template_id?: string | null;
  variable_mappings?: Record<string, unknown> | null;
}): {
  error: string | null;
  templateId: string | null;
  variableMappings: Record<string, unknown>;
} {
  let templateId: string | null = null;
  if (data?.template_id !== undefined && data?.template_id !== null) {
    const trimmed = String(data.template_id).trim();
    if (trimmed) {
      if (!UUID_REGEX.test(trimmed)) {
        return {
          error: "Invalid template ID format.",
          templateId: null,
          variableMappings: {},
        };
      }
      templateId = trimmed;
    }
  }

  let variableMappings: Record<string, unknown> = {};
  if (
    data?.variable_mappings !== undefined &&
    data?.variable_mappings !== null
  ) {
    if (
      typeof data.variable_mappings !== "object" ||
      Array.isArray(data.variable_mappings)
    ) {
      return {
        error: "Variable mappings must be an object.",
        templateId: null,
        variableMappings: {},
      };
    }
    variableMappings = data.variable_mappings;
  }

  return { error: null, templateId, variableMappings };
}

export async function createBroadcastDraft(data: CreateBroadcastDraftInput) {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) {
    return { error: "Unauthorized" };
  }

  const messageText = (data?.message_text ?? "").trim();
  if (!messageText) {
    return { error: "Message text is required." };
  }

  const validTargetTypes: TargetType[] = ["group", "tag", "manual"];
  if (!validTargetTypes.includes(data?.target_type)) {
    return { error: "Target type must be 'group', 'tag', or 'manual'." };
  }

  if (!Array.isArray(data?.target_ids) || data.target_ids.length === 0) {
    return { error: "Please select at least one recipient target." };
  }

  // Filter out any empty strings or invalid entries
  const normalizedTargetIds = data.target_ids
    .map((id) => String(id).trim())
    .filter(Boolean);

  if (normalizedTargetIds.length === 0) {
    return { error: "Please select at least one recipient target." };
  }

  const { error: templateError, templateId, variableMappings } =
    validateTemplatePayload(data);
  if (templateError) {
    return { error: templateError };
  }

  const { error } = await supabase.from("broadcasts").insert({
    message_text: messageText,
    target_type: data.target_type,
    target_ids: normalizedTargetIds,
    status: "draft",
    template_id: templateId,
    variable_mappings: variableMappings,
  });

  if (error) {
    return { error: error.message || "Failed to create broadcast draft." };
  }

  revalidatePath("/broadcasts");
  return { success: true };
}

export async function createScheduledBroadcast(
  data: CreateScheduledBroadcastInput
) {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) {
    return { error: "Unauthorized" };
  }

  const messageText = (data?.message_text ?? "").trim();
  if (!messageText) {
    return { error: "Message text is required." };
  }

  const validTargetTypes: TargetType[] = ["group", "tag", "manual"];
  if (!validTargetTypes.includes(data?.target_type)) {
    return { error: "Target type must be 'group', 'tag', or 'manual'." };
  }

  if (!Array.isArray(data?.target_ids) || data.target_ids.length === 0) {
    return { error: "Please select at least one recipient target." };
  }

  const normalizedTargetIds = data.target_ids
    .map((id) => String(id).trim())
    .filter(Boolean);

  if (normalizedTargetIds.length === 0) {
    return { error: "Please select at least one recipient target." };
  }

  if (!data?.scheduled_for) {
    return { error: "Scheduled date and time is required." };
  }

  const scheduledDate = new Date(data.scheduled_for);
  if (isNaN(scheduledDate.getTime())) {
    return { error: "Invalid scheduled date and time." };
  }

  if (scheduledDate.getTime() <= Date.now()) {
    return { error: "Scheduled time must be in the future." };
  }

  const { error: templateError, templateId, variableMappings } =
    validateTemplatePayload(data);
  if (templateError) {
    return { error: templateError };
  }

  const { error } = await supabase.from("broadcasts").insert({
    message_text: messageText,
    target_type: data.target_type,
    target_ids: normalizedTargetIds,
    status: "scheduled",
    scheduled_for: scheduledDate.toISOString(),
    template_id: templateId,
    variable_mappings: variableMappings,
  });

  if (error) {
    return { error: error.message || "Failed to create scheduled broadcast." };
  }

  revalidatePath("/broadcasts");
  return { success: true };
}

export async function updateBroadcast(id: string, data: UpdateBroadcastInput) {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) {
    return { error: "Unauthorized" };
  }

  if (!id) {
    return { error: "Broadcast ID is required." };
  }

  const messageText = (data?.message_text ?? "").trim();
  if (!messageText) {
    return { error: "Message text is required." };
  }

  const validTargetTypes: TargetType[] = ["group", "tag", "manual"];
  if (!validTargetTypes.includes(data?.target_type)) {
    return { error: "Target type must be 'group', 'tag', or 'manual'." };
  }

  if (!Array.isArray(data?.target_ids) || data.target_ids.length === 0) {
    return { error: "Please select at least one recipient target." };
  }

  const normalizedTargetIds = data.target_ids
    .map((item) => String(item).trim())
    .filter(Boolean);

  if (normalizedTargetIds.length === 0) {
    return { error: "Please select at least one recipient target." };
  }

  // Verify status is draft or scheduled
  const { data: existing, error: fetchError } = await supabase
    .from("broadcasts")
    .select("status")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError || !existing) {
    return { error: "Broadcast not found." };
  }

  if (existing.status === "sent") {
    return { error: "Sent broadcasts cannot be edited." };
  }

  if (existing.status !== "draft" && existing.status !== "scheduled") {
    return { error: "Only draft or scheduled broadcasts can be edited." };
  }

  const updatePayload: {
    message_text: string;
    target_type: TargetType;
    target_ids: string[];
    scheduled_for?: string;
    template_id?: string | null;
    variable_mappings?: Record<string, unknown>;
  } = {
    message_text: messageText,
    target_type: data.target_type,
    target_ids: normalizedTargetIds,
  };

  if (data?.template_id !== undefined) {
    if (data.template_id === null || String(data.template_id).trim() === "") {
      updatePayload.template_id = null;
      if (data.variable_mappings === undefined) {
        updatePayload.variable_mappings = {};
      }
    } else {
      const trimmed = String(data.template_id).trim();
      if (!UUID_REGEX.test(trimmed)) {
        return { error: "Invalid template ID format." };
      }
      updatePayload.template_id = trimmed;
    }
  }

  if (data?.variable_mappings !== undefined) {
    if (data.variable_mappings === null) {
      updatePayload.variable_mappings = {};
    } else if (
      typeof data.variable_mappings !== "object" ||
      Array.isArray(data.variable_mappings)
    ) {
      return { error: "Variable mappings must be an object." };
    } else {
      updatePayload.variable_mappings = data.variable_mappings;
    }
  }

  if (existing.status === "scheduled") {
    if (!data?.scheduled_for) {
      return { error: "Scheduled date and time is required." };
    }
    const scheduledDate = new Date(data.scheduled_for);
    if (isNaN(scheduledDate.getTime())) {
      return { error: "Invalid scheduled date and time." };
    }
    if (scheduledDate.getTime() <= Date.now()) {
      return { error: "Scheduled time must be in the future." };
    }
    updatePayload.scheduled_for = scheduledDate.toISOString();
  }

  const { error } = await supabase
    .from("broadcasts")
    .update(updatePayload)
    .eq("id", id);

  if (error) {
    return { error: error.message || "Failed to update broadcast." };
  }

  revalidatePath("/broadcasts");
  return { success: true };
}

export async function deleteBroadcast(id: string) {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) {
    return { error: "Unauthorized" };
  }

  if (!id) {
    return { error: "Broadcast ID is required." };
  }

  const { error } = await supabase
    .from("broadcasts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return { error: error.message || "Failed to delete broadcast." };
  }

  revalidatePath("/broadcasts");
  return { success: true };
}

export async function deleteBroadcasts(ids: string[]) {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) {
    return { error: "Unauthorized" };
  }

  const broadcastIds = [...new Set(ids.filter(Boolean))];
  if (!broadcastIds.length) {
    return { error: "No broadcasts were selected." };
  }

  const { error } = await supabase
    .from("broadcasts")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", broadcastIds);

  if (error) {
    return { error: error.message || "Failed to delete broadcasts." };
  }

  revalidatePath("/broadcasts");
  return { success: true, deleted: broadcastIds.length };
}

export interface BroadcastSendResult {
  contactId: string;
  name: string;
  phone: string;
  success: boolean;
  error?: string;
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
}): { message: string | null; error: string | null } {
  const placeholders = extractNumericPlaceholders(templateBody);
  let resolved = templateBody;

  for (const ph of placeholders) {
    const mapping = mappings[ph];
    if (!mapping) {
      return {
        message: null,
        error: `Missing mapping for placeholder {{${ph}}}`,
      };
    }

    if (mapping.type === "static") {
      resolved = resolved.replaceAll(`{{${ph}}}`, mapping.value);
    } else if (mapping.type === "contact_field") {
      const fieldVal = resolveContactField(contact, mapping.field);
      let finalVal: string | null = fieldVal;

      if (!finalVal) {
        if (mapping.fallback) {
          finalVal = mapping.fallback;
        } else {
          return {
            message: null,
            error: `Contact is missing "${mapping.field}" with no fallback provided for {{${ph}}}`,
          };
        }
      }

      resolved = resolved.replaceAll(`{{${ph}}}`, finalVal);
    }
  }

  return { message: resolved, error: null };
}

export type SendBroadcastResult =
  | {
      success: true;
      total: number;
      sentCount: number;
      failedCount: number;
      results: BroadcastSendResult[];
      error?: undefined;
    }
  | {
      success?: false;
      error: string;
      total?: undefined;
      sentCount?: undefined;
      failedCount?: undefined;
      results?: undefined;
    };

async function dispatchBroadcast(
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

  if (broadcast.template_id) {
    const { data: tmpl, error: tmplError } = await supabase
      .from("templates")
      .select("id, body_text, deleted_at")
      .eq("id", broadcast.template_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (tmplError || !tmpl || !tmpl.body_text) {
      return { error: "Referenced template not found or is inactive." };
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

  for (const contact of targetContacts) {
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
    } else {
      messageToSend = broadcast.message_text;
    }

    try {
      await sendWhatsAppMessage({
        to: normalizedPhone,
        message: messageToSend,
      });

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
  const failedCount = results.filter((r) => !r.success).length;

  // 5. Update broadcast row status and timestamp
  await supabase
    .from("broadcasts")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
    })
    .eq("id", broadcastId);

  revalidatePath("/broadcasts");

  return {
    success: true,
    total: results.length,
    sentCount,
    failedCount,
    results,
  };
}

export async function sendBroadcastNow(
  broadcastId: string
): Promise<SendBroadcastResult> {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) {
    return { error: "Unauthorized" };
  }

  return dispatchBroadcast(broadcastId, supabase);
}

export interface ProcessedBroadcastResult {
  broadcastId: string;
  success: boolean;
  error?: string;
  total?: number;
  sentCount?: number;
  failedCount?: number;
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
    try {
      const res = await dispatchBroadcast(broadcast.id, supabase);
      if ("error" in res && res.error) {
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

