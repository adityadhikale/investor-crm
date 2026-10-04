import { NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { safeEqual } from "@/lib/secure-compare";
import { storeInboundWhatsAppMedia } from "@/lib/inbound-media";
import { applyDeliveryStatus, describeDeliveryError } from "@/lib/message-status";
import { normalizeToLocalPhone } from "@/lib/whatsapp";

// In-memory bounded cache for recently processed Meta message IDs (wamid)
const MAX_CACHE_SIZE = 5000;
const processedMessageIds = new Set<string>();

function markAndCheckDuplicateId(id: string | undefined): boolean {
  if (!id) return false;
  if (processedMessageIds.has(id)) {
    return true;
  }
  if (processedMessageIds.size >= MAX_CACHE_SIZE) {
    const oldestKey = processedMessageIds.values().next().value;
    if (oldestKey) {
      processedMessageIds.delete(oldestKey);
    }
  }
  processedMessageIds.add(id);
  return false;
}

// In-memory bounded cache for recently processed Meta status updates (wamid:status)
const processedStatusKeys = new Set<string>();

export function markAndCheckDuplicateStatus(
  id: string | undefined,
  status: string | undefined
): boolean {
  if (!id || !status) return false;
  const key = `${id}:${status}`;
  if (processedStatusKeys.has(key)) {
    return true;
  }
  if (processedStatusKeys.size >= MAX_CACHE_SIZE) {
    const oldestKey = processedStatusKeys.values().next().value;
    if (oldestKey) {
      processedStatusKeys.delete(oldestKey);
    }
  }
  processedStatusKeys.add(key);
  return false;
}

export interface MetaStatusError {
  code: number;
  title?: string;
  message?: string;
  error_data?: {
    details?: string;
  };
}

export interface MetaStatusUpdate {
  id?: string;
  status?: "sent" | "delivered" | "read" | "failed" | string;
  timestamp?: string | number;
  recipient_id?: string;
  conversation?: {
    id?: string;
    origin?: {
      type?: string;
    };
  };
  pricing?: {
    billable?: boolean;
    pricing_model?: string;
    category?: string;
  };
  errors?: MetaStatusError[];
  [key: string]: unknown;
}

interface MetaMediaData {
  id?: string;
  link?: string;
  url?: string;
  caption?: string;
  filename?: string;
  mime_type?: string;
  sha256?: string;
}

interface MetaMessageBase {
  id?: string;
  from?: string;
  to?: string;
  timestamp?: string | number;
  type?: string;
  is_echo?: boolean;
  text?: { body?: string };
  interactive?: {
    button_reply?: { title?: string; id?: string };
    list_reply?: { title?: string; id?: string };
  };
  button?: { text?: string; payload?: string };
  image?: MetaMediaData;
  video?: MetaMediaData;
  document?: MetaMediaData;
  audio?: MetaMediaData;
  voice?: MetaMediaData;
  sticker?: MetaMediaData;
  [key: string]: unknown;
}

interface MetaChangeValue {
  messaging_product?: string;
  metadata?: {
    display_phone_number?: string;
    phone_number_id?: string;
  };
  contacts?: Array<{
    profile?: { name?: string };
    wa_id?: string;
  }>;
  messages?: MetaMessageBase[];
  message_echoes?: MetaMessageBase[];
  statuses?: MetaStatusUpdate[];
}

interface MetaChange {
  field?: string;
  value?: MetaChangeValue;
}

interface MetaEntry {
  id?: string;
  changes?: MetaChange[];
}

interface MetaWebhookPayload {
  object?: string;
  entry?: MetaEntry[];
}

/**
 * Meta Webhook verification endpoint (GET).
 * Meta sends hub.mode, hub.verify_token, and hub.challenge.
 * Must return hub.challenge with 200 OK when verification succeeds.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token && verifyToken && token === verifyToken) {
    return new Response(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new Response("Forbidden", { status: 403 });
}

/**
 * Meta Webhook event handler (POST).
 * Synchronizes incoming WhatsApp messages and outgoing coexistence echoes into whatsapp_messages.
 */
export async function POST(request: Request) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json(
      { error: "Failed to read request body" },
      { status: 400 },
    );
  }

  // Verify the HMAC-SHA256 signature. Fails closed in production if the app
  // secret is missing; local dev without a secret stays usable.
  const appSecret =
    process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET;
  if (appSecret) {
    const signature = request.headers.get("x-hub-signature-256");
    if (!signature) {
      return NextResponse.json(
        { error: "Missing signature" },
        { status: 401 },
      );
    }
    const expectedSignature = `sha256=${crypto
      .createHmac("sha256", appSecret)
      .update(rawBody)
      .digest("hex")}`;
    if (!safeEqual(signature, expectedSignature)) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 },
      );
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[WhatsApp Webhook] META_APP_SECRET is not set; rejecting request.");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 401 });
  }

  let body: MetaWebhookPayload;
  try {
    body = JSON.parse(rawBody) as MetaWebhookPayload;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 },
    );
  }

  // Gracefully ignore non-WhatsApp events
  if (body?.object !== "whatsapp_business_account") {
    return NextResponse.json(
      { status: "ignored", reason: "Not a whatsapp_business_account event" },
      { status: 200 },
    );
  }

  const entries = Array.isArray(body.entry) ? body.entry : [];
  let processedCount = 0;

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value;
      if (!value || typeof value !== "object") continue;

      // Extract business phone number from metadata if available
      const businessPhone =
        value.metadata?.display_phone_number?.replace(/\D/g, "") || "";

      // 1. Process Incoming Messages
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const msg of messages) {
        try {
          const isEcho =
            msg.is_echo === true ||
            Boolean(
              businessPhone &&
                msg.from &&
                msg.from.replace(/\D/g, "") === businessPhone,
            );

          const direction = isEcho ? ("out" as const) : ("in" as const);
          const targetPhone = isEcho ? msg.to : msg.from;

          // The sender's WhatsApp profile name, used to pre-fill "Save contact".
          const profileName = isEcho
            ? undefined
            : value.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name ??
              value.contacts?.[0]?.profile?.name;

          await processSingleMessage({
            messageId: msg.id,
            phone: targetPhone,
            timestamp: msg.timestamp,
            type: msg.type,
            msgData: msg,
            direction,
            profileName,
          });

          processedCount++;
        } catch (err) {
          // Error isolation: single failure does not crash the entire webhook batch
          console.error("[WhatsApp Webhook] Error processing message:", err);
        }
      }

      // 2. Process Outgoing Coexistence Echoes (smb_message_echoes / value.message_echoes)
      const echoes = Array.isArray(value.message_echoes)
        ? value.message_echoes
        : [];
      for (const echo of echoes) {
        try {
          await processSingleMessage({
            messageId: echo.id,
            phone: echo.to,
            timestamp: echo.timestamp,
            type: echo.type,
            msgData: echo,
            direction: "out",
          });

          processedCount++;
        } catch (err) {
          // Error isolation
          console.error("[WhatsApp Webhook] Error processing echo:", err);
        }
      }

      // 3. Process Outbound Message Delivery Statuses (value.statuses)
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      for (const statusObj of statuses) {
        try {
          await processStatusUpdate(statusObj as MetaStatusUpdate);
          processedCount++;
        } catch (err) {
          // Error isolation: single status failure does not crash the webhook batch
          console.error(
            "[WhatsApp Webhook] Error processing status update:",
            err
          );
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    processed: processedCount,
  });
}

export async function processStatusUpdate(statusUpdate: MetaStatusUpdate) {
  const { id: messageId, status, recipient_id, errors } = statusUpdate;

  if (!messageId || !status) {
    return { success: false, reason: "Missing messageId or status" };
  }

  // Idempotency: avoid processing identical (messageId, status) events more than once
  if (markAndCheckDuplicateStatus(messageId, status)) {
    return { success: true, duplicate: true };
  }

  const firstError =
    Array.isArray(errors) && errors.length > 0 ? errors[0] : null;
  const errorInfo = firstError
    ? ` code=${firstError.code} title="${firstError.title || firstError.message || ""}"`
    : "";

  console.log(
    `[WhatsApp Webhook] Delivery status update: wamid=${messageId} status=${status}${errorInfo}`
  );

  // Save it on the message so the chat can show ticks and, for a failure, why.
  const reportedAt = statusUpdate.timestamp
    ? new Date(Number(statusUpdate.timestamp) * 1000).toISOString()
    : new Date().toISOString();
  const errorText = firstError
    ? describeDeliveryError(
        firstError.code,
        firstError.title || firstError.message,
        firstError.error_data?.details,
      )
    : null;
  await applyDeliveryStatus(createServiceRoleClient(), messageId, status, errorText, reportedAt);
  return {
    success: true,
    messageId,
    status,
    recipientId: recipient_id,
    errorCode: firstError?.code,
  };
}

interface ProcessMessageArgs {
  messageId?: string;
  phone?: string;
  timestamp?: string | number;
  type?: string;
  msgData: MetaMessageBase;
  direction: "in" | "out";
  profileName?: string;
}

async function processSingleMessage({
  messageId,
  phone,
  timestamp,
  type,
  msgData,
  direction,
  profileName,
}: ProcessMessageArgs) {
  // Application-level deduplication: check in-memory cache of recent wamid
  if (messageId && markAndCheckDuplicateId(messageId)) {
    return;
  }

  // The webhook has no signed-in user, so it needs the server-only service
  // client. With the public anon key, row-level security hides every contact
  // (so no message could be matched to one) and would have to be loosened for
  // anyone on the internet to read the chat history.
  const supabase = createServiceRoleClient();

  // Extract message content & media info safely without assuming text
  let messageText: string | null = null;
  let mediaUrl: string | null = null;

  if (type === "text") {
    messageText = msgData.text?.body ?? null;
  } else if (type === "interactive") {
    messageText =
      msgData.interactive?.button_reply?.title ||
      msgData.interactive?.list_reply?.title ||
      null;
  } else if (type === "button") {
    messageText = msgData.button?.text ?? null;
  } else if (
    type === "image" ||
    type === "video" ||
    type === "document" ||
    type === "audio" ||
    type === "voice" ||
    type === "sticker"
  ) {
    const mediaObj = msgData[type] as MetaMediaData | undefined;

    messageText = mediaObj?.caption ?? null;
    // Meta's own `url` only works with our access token, so it can't be shown
    // in the browser. Download the file by its media ID and keep our own
    // copy; if that fails, keep the ID so it can be fetched when opened.
    mediaUrl = mediaObj?.link || null;
    if (!mediaUrl && mediaObj?.id) {
      try {
        mediaUrl = await storeInboundWhatsAppMedia(mediaObj.id, mediaObj.filename);
      } catch (err) {
        console.error("[WhatsApp Webhook] Could not store incoming media:", err);
        mediaUrl = `meta_media_id:${mediaObj.id}`;
      }
    }
  }

  // Parse timestamp
  let sentAt: string;
  if (timestamp) {
    const parsedSec =
      typeof timestamp === "number"
        ? timestamp
        : parseInt(String(timestamp), 10);
    if (!isNaN(parsedSec) && parsedSec > 0) {
      sentAt = new Date(parsedSec * 1000).toISOString();
    } else {
      sentAt = new Date().toISOString();
    }
  } else {
    sentAt = new Date().toISOString();
  }

  // Match contact by phone
  let contactId: string | null = null;

  if (phone) {
    const localPhone = normalizeToLocalPhone(String(phone));
    const rawDigits = String(phone).replace(/\D/g, "");

    const candidates = Array.from(
      new Set([localPhone, rawDigits].filter(Boolean) as string[]),
    );

    if (candidates.length > 0) {
      const orFilter = candidates.map((p) => `phone.eq.${p}`).join(",");
      const { data: contacts, error: contactLookupError } = await supabase
        .from("contacts")
        .select("id, phone")
        .is("deleted_at", null)
        .or(orFilter)
        .limit(1);

      if (!contactLookupError && contacts && contacts.length > 0) {
        contactId = contacts[0].id;
      }
    }
  }

  // Database-level deduplication: check if identical record already exists
  let dupeQuery = supabase
    .from("whatsapp_messages")
    .select("id")
    .eq("direction", direction)
    .eq("sent_at", sentAt)
    .is("deleted_at", null);

  if (contactId) {
    dupeQuery = dupeQuery.eq("contact_id", contactId);
  } else {
    dupeQuery = dupeQuery.is("contact_id", null);
  }

  if (messageText !== null) {
    dupeQuery = dupeQuery.eq("message_text", messageText);
  } else {
    dupeQuery = dupeQuery.is("message_text", null);
  }

  if (mediaUrl !== null) {
    dupeQuery = dupeQuery.eq("media_url", mediaUrl);
  } else {
    dupeQuery = dupeQuery.is("media_url", null);
  }

  const { data: existingRecords, error: dupeError } =
    await dupeQuery.limit(1);

  if (!dupeError && existingRecords && existingRecords.length > 0) {
    // Already inserted previously
    return;
  }

  // Insert into whatsapp_messages. The number is kept so a message from an
  // unknown number can be linked once that number is saved as a contact.
  const row = {
    contact_id: contactId,
    direction,
    message_text: messageText,
    media_url: mediaUrl,
    sent_at: sentAt,
    deleted_at: null,
    phone: phone ? normalizeToLocalPhone(String(phone)) : null,
    profile_name: profileName?.trim() || null,
  };
  let { error: insertError } = await supabase.from("whatsapp_messages").insert(row);

  // Until the add_phone_to_whatsapp_messages migration is applied these
  // columns may not exist; drop only the missing one rather than losing the message.
  if (insertError && /profile_name/i.test(insertError.message)) {
    const { profile_name: _profileName, ...rowWithoutName } = row;
    void _profileName;
    ({ error: insertError } = await supabase.from("whatsapp_messages").insert(rowWithoutName));
  }
  if (insertError && /phone/i.test(insertError.message)) {
    const { phone: _phone, profile_name: _profileName, ...rowWithoutNew } = row;
    void _phone;
    void _profileName;
    ({ error: insertError } = await supabase.from("whatsapp_messages").insert(rowWithoutNew));
  }

  if (insertError) {
    console.error(
      "[WhatsApp Webhook] Failed to insert message row:",
      insertError.message,
    );
  }
}
