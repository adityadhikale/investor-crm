"use server";

import { revalidatePath } from "next/cache";
import { requireActionAuth } from "@/lib/auth";
import {
  sendBroadcastBatch,
  type BroadcastSendSummary,
  type SendBroadcastResult,
} from "@/lib/broadcast-dispatch";

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
  /** Set when the template was synced from Meta and is sent as a real WhatsApp template. */
  meta_template_id?: string | null;
}

export interface BroadcastData {
  id: string;
  message_text: string;
  target_type: TargetType;
  target_ids: string[];
  /** "sending": a large broadcast going out in batches. */
  status: "draft" | "scheduled" | "sending" | "sent";
  created_at: string;
  scheduled_for?: string | null;
  sent_at?: string | null;
  template_id?: string | null;
  variable_mappings?: Record<string, unknown> | null;
  /** Who it reached, was skipped or failed; set once sent (see lib/broadcast-dispatch). */
  send_summary?: BroadcastSendSummary | null;
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

/**
 * Starts a draft broadcast and sends as much as fits in one request (large
 * broadcasts go out in batches). While the result says `done: false`, call it
 * again to continue; if the page is closed, the 5-minute scheduler finishes it.
 */
export async function sendBroadcastNow(
  broadcastId: string
): Promise<SendBroadcastResult> {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) {
    return { error: "Unauthorized" };
  }

  return sendBroadcastBatch(supabase, broadcastId);
}
