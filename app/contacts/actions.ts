"use server";

import { requireActionAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { generateChatSummary, transcribeVoiceNoteToMeetingNote } from "@/lib/gemini";
import {
  mimeTypeToWhatsAppMediaType,
  normalizeToLocalPhone,
  sendWhatsAppMediaMessage,
  sendWhatsAppMessage,
  sendWhatsAppTemplateMessage,
  uploadWhatsAppMedia,
} from "@/lib/whatsapp";
import {
  createMediaUploadTarget,
  downloadStoredMedia,
  mediaStoragePathFromUrl,
  mediaUrlForPath,
} from "@/lib/supabase-storage";
import { TAG_OPTIONS } from "@/lib/tags";
import { parseExcelBuffer, type ParsedSpreadsheet } from "@/lib/parse-spreadsheet";
import { fetchAllPages } from "@/lib/supabase-pagination";
import { linkUnmatchedMessages } from "@/lib/link-messages";
import { insertOutboundMessage } from "@/lib/message-status";

// The live host (Netlify) rejects requests over about 6MB, so keep these under that.
const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

const DUPLICATE_PHONE_ERROR =
  "This phone number is already associated with another contact.";

// Saved and compared in one canonical form so 919876543210, +91 98765 43210,
// 09876543210 and 9876543210 are all the same number (Indian numbers are kept
// as 10 digits; foreign numbers stay whole).
function normalizePhone(value: string) {
  return normalizeToLocalPhone(value) ?? "";
}

async function fetchAllContactPhones(
  supabase: Awaited<ReturnType<typeof requireActionAuth>>["supabase"],
  options: { excludeId?: string; excludeDeleted?: boolean } = {}
): Promise<string[]> {
  if (!supabase) return [];
  const { excludeId, excludeDeleted = true } = options;

  const rows = await fetchAllPages<{ phone: string }>((from, to) => {
    let query = supabase.from("contacts").select("phone").range(from, to);
    if (excludeDeleted) query = query.is("deleted_at", null);
    if (excludeId) query = query.neq("id", excludeId);
    return query;
  });

  return rows.map((row) => String(row.phone));
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string) {
  return EMAIL_REGEX.test(value);
}

export async function addContact(formData: FormData) {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const name = formData.get("name") as string;
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const emailRaw = String(formData.get("email") ?? "").trim();
  const tagsRaw = formData.get("tags") as string;
  const dateSaved = formData.get("dateSaved") as string;
  const notes = String(formData.get("notes") ?? "").trim();

  let tags: string[] = [];
  try {
    tags = tagsRaw ? JSON.parse(tagsRaw) : [];
  } catch {
    tags = [];
  }

  if (!name || !phone) {
    return { error: "Name and phone are required." };
  }

  if (!/^\d{7,15}$/.test(phone)) {
    return { error: "Phone must contain 7-15 digits." };
  }

  // Email is optional (e.g. saving someone who only messaged on WhatsApp).
  if (emailRaw && !isValidEmail(emailRaw)) {
    return { error: "Please enter a valid email address." };
  }
  const normalizedEmail = emailRaw ? emailRaw.toLowerCase() : null;

  if (dateSaved && !isValidDate(dateSaved)) {
    return { error: "Date must use a valid YYYY-MM-DD date." };
  }

  let existingPhones: string[];
  try {
    existingPhones = await fetchAllContactPhones(supabase);
  } catch {
    return { error: "The contact could not be checked for duplicates." };
  }

  if (existingPhones.some((existingPhone) => normalizePhone(existingPhone) === phone)) {
    return { error: DUPLICATE_PHONE_ERROR };
  }

  const { data: inserted, error } = await supabase
    .from("contacts")
    .insert({
      name,
      phone,
      email: normalizedEmail,
      tags,
      date_saved: dateSaved || null,
      notes: notes || null,
    })
    .select("id, phone")
    .single();

  if (error) {
    console.error("[addContact] insert failed:", error.message);
    return { error: "The contact could not be saved. Please try again." };
  }

  await linkUnmatchedMessages(supabase, [inserted]);

  revalidatePath("/contacts");
  revalidatePath("/unread-messages");
  return { success: true };
}

export async function updateContact(id: string, formData: FormData) {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const name = String(formData.get("name") ?? "").trim();
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const emailRaw = String(formData.get("email") ?? "").trim();
  const tagsRaw = String(formData.get("tags") ?? "");
  const dateSaved = String(formData.get("dateSaved") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  let tags: string[] = [];
  try {
    const parsedTags: unknown = tagsRaw ? JSON.parse(tagsRaw) : [];
    tags = Array.isArray(parsedTags)
      ? parsedTags.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return { error: "Tags could not be processed." };
  }

  if (!name || !phone) {
    return { error: "Name and phone are required." };
  }

  if (!/^\d{7,15}$/.test(phone)) {
    return { error: "Phone must contain 7-15 digits." };
  }

  // Email is optional (e.g. saving someone who only messaged on WhatsApp).
  if (emailRaw && !isValidEmail(emailRaw)) {
    return { error: "Please enter a valid email address." };
  }
  const normalizedEmail = emailRaw ? emailRaw.toLowerCase() : null;

  if (dateSaved && !isValidDate(dateSaved)) {
    return { error: "Date must use a valid YYYY-MM-DD date." };
  }

  const { data: duplicate, error: duplicateError } = await supabase
    .from("contacts")
    .select("id")
    .eq("phone", phone)
    .neq("id", id)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (duplicateError) {
    return { error: "The contact could not be checked for duplicates." };
  }

  if (duplicate) {
    return { error: DUPLICATE_PHONE_ERROR };
  }

  let otherPhones: string[];
  try {
    otherPhones = await fetchAllContactPhones(supabase, { excludeId: id });
  } catch {
    return { error: "The contact could not be checked for duplicates." };
  }

  if (otherPhones.some((otherPhone) => normalizePhone(otherPhone) === phone)) {
    return { error: DUPLICATE_PHONE_ERROR };
  }

  const { error } = await supabase
    .from("contacts")
    .update({
      name,
      phone,
      email: normalizedEmail,
      tags,
      date_saved: dateSaved || null,
      notes: notes || null,
    })
    .eq("id", id);

  if (error) {
    return { error: "The contact could not be updated." };
  }

  // A corrected phone number may match messages that arrived unmatched.
  await linkUnmatchedMessages(supabase, [{ id, phone }]);

  revalidatePath("/contacts");
  return { success: true };
}

const CONTACT_TAG_OPTIONS = TAG_OPTIONS;

export async function addTagToContact(id: string, tag: string) {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const normalizedTag = tag.trim();
  if (!id.trim()) return { error: "The contact could not be found." };
  if (!CONTACT_TAG_OPTIONS.includes(normalizedTag)) return { error: "That tag is not available." };

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id, tags")
    .eq("id", id)
    .maybeSingle();

  if (contactError || !contact) return { error: "The contact could not be found." };

  const tags = Array.isArray(contact.tags) ? contact.tags.filter((value): value is string => typeof value === "string") : [];
  if (tags.some((value) => value.toLowerCase() === normalizedTag.toLowerCase())) {
    return { error: "That tag is already assigned to this contact." };
  }

  const updatedTags = [...tags, normalizedTag];
  const { error } = await supabase.from("contacts").update({ tags: updatedTags }).eq("id", id);
  if (error) return { error: "The tag could not be added." };

  revalidatePath("/contacts");
  return { success: true, tags: updatedTags };
}

/** Removes one tag from a contact; its other tags are kept. */
export async function removeTagFromContact(id: string, tag: string) {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const normalizedTag = tag.trim();
  if (!id.trim() || !normalizedTag) return { error: "The contact could not be found." };

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id, tags")
    .eq("id", id)
    .maybeSingle();
  if (contactError || !contact) return { error: "The contact could not be found." };

  const tags = Array.isArray(contact.tags)
    ? contact.tags.filter((value): value is string => typeof value === "string")
    : [];
  const updatedTags = tags.filter((value) => value.toLowerCase() !== normalizedTag.toLowerCase());
  if (updatedTags.length === tags.length) return { error: "That tag is not on this contact." };

  const { error } = await supabase.from("contacts").update({ tags: updatedTags }).eq("id", id);
  if (error) return { error: "The tag could not be removed." };

  revalidatePath("/contacts");
  revalidatePath("/investors");
  return { success: true, tags: updatedTags };
}

export async function addMeetingNote(contactId: string, note: string) {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const normalizedContactId = contactId.trim();
  const normalizedNote = note.trim();

  if (!normalizedContactId) return { error: "The contact could not be found." };
  if (!normalizedNote) return { error: "Meeting note is required." };

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id")
    .eq("id", normalizedContactId)
    .maybeSingle();

  if (contactError || !contact) return { error: "The contact could not be found." };

  const { error } = await supabase.from("interactions").insert({
    contact_id: normalizedContactId,
    type: "meeting",
    note: normalizedNote,
  });

  if (error) return { error: "The meeting note could not be saved." };

  revalidatePath("/investors");
  revalidatePath(`/investors/${normalizedContactId}`);
  return { success: true };
}

const MAX_VOICE_NOTE_BYTES = 5 * 1024 * 1024; // the live host rejects requests over about 6MB

export type TranscribeVoiceNoteResult =
  | { success: true; transcript: string }
  | { error: string };

/**
 * Transcribes an uploaded voice note recording into a meeting note draft
 * using Gemini's audio understanding. Only returns the drafted text — it is
 * not saved until the user reviews and confirms it via the normal Add
 * Meeting Note dialog. The audio file itself is not stored anywhere.
 */
export async function transcribeVoiceNote(
  contactId: string,
  file: File,
): Promise<TranscribeVoiceNoteResult> {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const normalizedContactId = contactId.trim();
  if (!normalizedContactId) return { error: "The contact could not be found." };

  if (!file || file.size === 0) return { error: "No file selected." };
  if (file.size > MAX_VOICE_NOTE_BYTES) {
    return { error: "File is too large. Please choose a recording under 5MB." };
  }
  if (!file.type.startsWith("audio/")) {
    return { error: `Unsupported file type: ${file.type || "unknown"}. Please upload an audio file.` };
  }

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id")
    .eq("id", normalizedContactId)
    .maybeSingle();

  if (contactError || !contact) return { error: "The contact could not be found." };

  let audioBuffer: Buffer;
  try {
    const arrayBuffer = await file.arrayBuffer();
    audioBuffer = Buffer.from(arrayBuffer);
  } catch {
    return { error: "Could not read the selected file." };
  }

  try {
    const transcript = await transcribeVoiceNoteToMeetingNote(audioBuffer, file.type);
    return { success: true, transcript };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to transcribe the voice note.";
    return { error: msg };
  }
}

export type MeetingNote = {
  id: string;
  note: string;
  created_at: string;
};

export async function getMeetingNotes(contactId: string) {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const normalizedContactId = contactId.trim();
  if (!normalizedContactId) return { error: "The contact could not be found." };

  const { data: notes, error } = await supabase
    .from("interactions")
    .select("id, note, created_at")
    .eq("contact_id", normalizedContactId)
    .eq("type", "meeting")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) return { error: "Meeting notes could not be loaded." };

  return { notes: (notes ?? []) as MeetingNote[] };
}

export type SendWhatsAppReplyResult =
  | { success: true }
  | { error: string };

const REPLY_WINDOW_CLOSED_ERROR =
  "This contact hasn't messaged you in the last 24 hours, so WhatsApp won't deliver a normal message. Send an approved Meta template instead.";

/**
 * Meta only delivers free-form messages within 24 hours of the contact's last
 * message (its "customer service window"). Outside it they are silently dropped.
 */
async function isReplyWindowOpen(
  supabase: NonNullable<Awaited<ReturnType<typeof requireActionAuth>>["supabase"]>,
  contactId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("contact_id", contactId)
    .eq("direction", "in")
    .is("deleted_at", null)
    .gte("sent_at", since);
  // If the check itself fails, don't block the user; Meta stays the final judge.
  if (error) return true;
  return (count ?? 0) > 0;
}

/**
 * Sends a free-form WhatsApp reply to a contact directly from the CRM and
 * logs it in whatsapp_messages as an outbound message. Subject to Meta's
 * 24-hour customer service window: this will fail with a clear error if the
 * contact hasn't messaged in via WhatsApp recently.
 */
export async function sendWhatsAppReply(
  contactId: string,
  message: string,
): Promise<SendWhatsAppReplyResult> {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const normalizedContactId = contactId.trim();
  const normalizedMessage = message.trim();

  if (!normalizedContactId) return { error: "The contact could not be found." };
  if (!normalizedMessage) return { error: "Message cannot be empty." };

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id, phone")
    .eq("id", normalizedContactId)
    .maybeSingle();

  if (contactError || !contact) return { error: "The contact could not be found." };

  if (!(await isReplyWindowOpen(supabase, normalizedContactId))) {
    return { error: REPLY_WINDOW_CLOSED_ERROR };
  }

  let wamid: string | undefined;
  try {
    const response = await sendWhatsAppMessage({
      to: contact.phone,
      message: normalizedMessage,
    });

    if (response.error) {
      return { error: response.error.message || "WhatsApp could not send this message." };
    }
    wamid = response.messages?.[0]?.id;
  } catch (err: unknown) {
    const messageText =
      err instanceof Error ? err.message : "WhatsApp could not send this message.";
    return { error: messageText };
  }

  const { error: insertError } = await insertOutboundMessage(
    supabase,
    { contact_id: normalizedContactId, message_text: normalizedMessage },
    wamid,
  );

  if (insertError) {
    // Message was sent via Meta but failed to log locally; surface this so
    // it isn't silently missing from history.
    return { error: "Message sent, but could not be saved to WhatsApp history." };
  }

  revalidatePath(`/contacts/${normalizedContactId}`);
  revalidatePath(`/investors/${normalizedContactId}`);

  return { success: true };
}

/**
 * Sends a Meta-approved template to one contact. Unlike a plain reply, this
 * works even when the contact hasn't messaged in the last 24 hours.
 * `params` fills the body's {{1}}, {{2}}, ... in order.
 */
export async function sendWhatsAppTemplateToContact(
  contactId: string,
  templateId: string,
  params: string[],
): Promise<SendWhatsAppReplyResult> {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, phone")
    .eq("id", contactId.trim())
    .is("deleted_at", null)
    .maybeSingle();
  if (!contact) return { error: "The contact could not be found." };

  const { data: template } = await supabase
    .from("templates")
    .select("name, language, body_text, meta_template_id, approved_at")
    .eq("id", templateId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!template || !template.meta_template_id) {
    return { error: "The template could not be found. Try \"Sync from Meta\" on the Templates page." };
  }
  if (!template.approved_at) {
    return { error: `Template "${template.name}" is not approved by Meta yet.` };
  }

  const placeholders = Array.from(
    new Set(Array.from((template.body_text as string).matchAll(/\{\{(\d+)\}\}/g), (m) => m[1])),
  ).sort((a, b) => Number(a) - Number(b));
  const values = params.map((value) => (value ?? "").trim());
  if (values.length !== placeholders.length || values.some((value) => !value)) {
    return { error: "Please fill in every variable before sending." };
  }

  let wamid: string | undefined;
  try {
    const response = await sendWhatsAppTemplateMessage({
      to: contact.phone,
      templateName: template.name,
      language: template.language,
      bodyParameters: values,
    });
    wamid = response.messages?.[0]?.id;
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : "WhatsApp could not send this template.",
    };
  }

  let sentText = template.body_text as string;
  placeholders.forEach((ph, index) => {
    sentText = sentText.replaceAll(`{{${ph}}}`, values[index]);
  });

  const { error: insertError } = await insertOutboundMessage(
    supabase,
    { contact_id: contact.id, message_text: sentText },
    wamid,
  );
  if (insertError) {
    return { error: "Template sent, but could not be saved to WhatsApp history." };
  }

  revalidatePath(`/contacts/${contact.id}`);
  revalidatePath(`/investors/${contact.id}`);
  return { success: true };
}

const MAX_WHATSAPP_MEDIA_BYTES = 16 * 1024 * 1024; // 16MB, matches Meta's video/audio limit

export type SendWhatsAppMediaReplyResult =
  | { success: true }
  | { error: string };

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
  mp4: "video/mp4", "3gp": "video/3gpp", mov: "video/quicktime", webm: "video/webm",
  mp3: "audio/mpeg", ogg: "audio/ogg", opus: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac", amr: "audio/amr", wav: "audio/wav",
  pdf: "application/pdf", doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv", txt: "text/plain",
};

/**
 * Sends again a message that WhatsApp reported as not delivered. It goes out as
 * a new message (the failed one stays in the history, marked as resent so it
 * can't be resent twice). Works only while the 24-hour reply window is open;
 * otherwise an approved template is needed.
 */
export async function resendFailedWhatsAppMessage(messageId: string): Promise<SendWhatsAppReplyResult> {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const { data: original, error: loadError } = await supabase
    .from("whatsapp_messages")
    .select("id, contact_id, direction, message_text, media_url, status, status_error, deleted_at")
    .eq("id", messageId)
    .maybeSingle();
  if (loadError || !original || original.deleted_at) return { error: "That message could not be found." };
  if (original.direction !== "out" || original.status !== "failed" || !original.contact_id) {
    return { error: "Only a message that was not delivered can be resent." };
  }
  if (/^Resent\b/.test(original.status_error ?? "")) {
    return { error: "This message has already been resent." };
  }

  const contactId = original.contact_id as string;
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id, phone")
    .eq("id", contactId)
    .maybeSingle();
  if (contactError || !contact) return { error: "The contact could not be found." };

  if (!(await isReplyWindowOpen(supabase, contactId))) {
    return { error: REPLY_WINDOW_CLOSED_ERROR };
  }

  let wamid: string | undefined;
  try {
    if (original.media_url) {
      const path = mediaStoragePathFromUrl(original.media_url);
      if (!path) return { error: "This attachment can't be resent. Please attach the file again." };
      const filename = (path.split("/").pop() ?? "file").replace(/^\d+-/, "");
      const extension = filename.split(".").pop()?.toLowerCase() ?? "";
      const mimeType = MIME_BY_EXTENSION[extension];
      const mediaType = mimeType ? mimeTypeToWhatsAppMediaType(mimeType) : null;
      if (!mimeType || !mediaType) return { error: "This attachment can't be resent. Please attach the file again." };
      const bytes = await downloadStoredMedia(path);
      const mediaId = await uploadWhatsAppMedia(bytes, mimeType, filename);
      const response = await sendWhatsAppMediaMessage({
        to: contact.phone,
        mediaId,
        mediaType,
        filename,
        caption: original.message_text?.trim() || undefined,
      });
      wamid = response.messages?.[0]?.id;
    } else {
      const text = (original.message_text ?? "").trim();
      if (!text) return { error: "There is nothing to resend." };
      const response = await sendWhatsAppMessage({ to: contact.phone, message: text });
      if (response.error) return { error: response.error.message || "WhatsApp could not send this message." };
      wamid = response.messages?.[0]?.id;
    }
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "WhatsApp could not send this message." };
  }

  const { error: insertError } = await insertOutboundMessage(
    supabase,
    { contact_id: contactId, message_text: original.message_text, media_url: original.media_url },
    wamid,
  );
  // Mark the failed one so it can't be resent again (it stays in the history).
  await supabase
    .from("whatsapp_messages")
    .update({ status_error: `Resent. Original problem: ${original.status_error ?? "not delivered"}` })
    .eq("id", original.id)
    .eq("status", "failed");
  if (insertError) return { error: "Message sent, but could not be saved to WhatsApp history." };

  revalidatePath(`/contacts/${contactId}`);
  revalidatePath(`/investors/${contactId}`);
  return { success: true };
}

/**
 * Step 1 of sending a file: checks it and returns a one-time upload address so
 * the browser can send the file straight to storage. Going around the web
 * server avoids its request-size cap, so files up to Meta's 16 MB limit work.
 */
export async function prepareWhatsAppMediaUpload(
  contactId: string,
  filename: string,
  mimeType: string,
  size: number,
): Promise<{ path: string; token: string } | { error: string }> {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const normalizedContactId = contactId.trim();
  if (!normalizedContactId) return { error: "The contact could not be found." };
  if (!size) return { error: "No file selected." };
  if (size > MAX_WHATSAPP_MEDIA_BYTES) {
    return { error: "File is too large. Please choose a file under 16MB." };
  }
  if (!mimeTypeToWhatsAppMediaType(mimeType)) {
    return { error: `Unsupported file type: ${mimeType || "unknown"}.` };
  }

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id")
    .eq("id", normalizedContactId)
    .maybeSingle();
  if (contactError || !contact) return { error: "The contact could not be found." };

  if (!(await isReplyWindowOpen(supabase, normalizedContactId))) {
    return { error: REPLY_WINDOW_CLOSED_ERROR };
  }

  try {
    return await createMediaUploadTarget(normalizedContactId, filename);
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Could not prepare the upload." };
  }
}

/**
 * Step 2: the file is already in storage (uploaded by the browser). Reads it,
 * hands it to WhatsApp, sends it and records it in the chat history.
 */
export async function sendWhatsAppMediaFromStorage(
  contactId: string,
  path: string,
  mimeType: string,
  filename: string,
  caption?: string,
): Promise<SendWhatsAppMediaReplyResult> {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const normalizedContactId = contactId.trim();
  if (!normalizedContactId) return { error: "The contact could not be found." };
  // Only files uploaded for this contact by step 1 can be sent.
  if (!path.startsWith(`${normalizedContactId}/`) || path.includes("..")) {
    return { error: "That file isn't available for this contact." };
  }

  const mediaType = mimeTypeToWhatsAppMediaType(mimeType);
  if (!mediaType) return { error: `Unsupported file type: ${mimeType || "unknown"}.` };

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id, phone")
    .eq("id", normalizedContactId)
    .maybeSingle();
  if (contactError || !contact) return { error: "The contact could not be found." };

  if (!(await isReplyWindowOpen(supabase, normalizedContactId))) {
    return { error: REPLY_WINDOW_CLOSED_ERROR };
  }

  let fileBuffer: Buffer;
  try {
    fileBuffer = await downloadStoredMedia(path);
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Could not read the uploaded file." };
  }
  if (fileBuffer.length === 0 || fileBuffer.length > MAX_WHATSAPP_MEDIA_BYTES) {
    return { error: "File is too large. Please choose a file under 16MB." };
  }

  let wamid: string | undefined;
  try {
    const mediaId = await uploadWhatsAppMedia(fileBuffer, mimeType, filename);
    const response = await sendWhatsAppMediaMessage({
      to: contact.phone,
      mediaId,
      mediaType,
      filename,
      caption: caption?.trim() || undefined,
    });
    wamid = response.messages?.[0]?.id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "WhatsApp could not send this file.";
    return { error: msg };
  }

  const { error: insertError } = await insertOutboundMessage(
    supabase,
    {
      contact_id: normalizedContactId,
      message_text: caption?.trim() || null,
      media_url: mediaUrlForPath(path),
    },
    wamid,
  );

  if (insertError) {
    return { error: "File sent, but could not be saved to WhatsApp history." };
  }

  revalidatePath(`/contacts/${normalizedContactId}`);
  revalidatePath(`/investors/${normalizedContactId}`);

  return { success: true };
}

export async function updateMeetingNote(
  noteId: string,
  contactId: string,
  note: string,
) {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const normalizedNoteId = noteId.trim();
  const normalizedContactId = contactId.trim();
  const normalizedNote = note.trim();

  if (!normalizedNoteId) return { error: "Invalid note ID." };
  if (!normalizedContactId) return { error: "The contact could not be found." };
  if (!normalizedNote) return { error: "Meeting note is required." };

  // Verify contact exists
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id")
    .eq("id", normalizedContactId)
    .maybeSingle();

  if (contactError || !contact) return { error: "The contact could not be found." };

  // Verify interaction exists, belongs to contact, and is strictly of type 'meeting'
  const { data: interaction, error: interactionError } = await supabase
    .from("interactions")
    .select("id, contact_id, type")
    .eq("id", normalizedNoteId)
    .maybeSingle();

  if (interactionError || !interaction) return { error: "Meeting note not found." };
  if (interaction.contact_id !== normalizedContactId) {
    return { error: "Meeting note does not belong to this contact." };
  }
  if (interaction.type !== "meeting") {
    return { error: "Only meeting notes can be edited." };
  }

  // Update only the note text. Preserves created_at, contact_id, type, id.
  const { error: updateError } = await supabase
    .from("interactions")
    .update({ note: normalizedNote })
    .eq("id", normalizedNoteId)
    .eq("contact_id", normalizedContactId)
    .eq("type", "meeting");

  if (updateError) return { error: "The meeting note could not be updated." };

  revalidatePath("/investors");
  revalidatePath(`/investors/${normalizedContactId}`);
  return { success: true };
}

export async function deleteMeetingNote(noteId: string, contactId: string) {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const normalizedNoteId = noteId.trim();
  const normalizedContactId = contactId.trim();

  if (!normalizedNoteId) return { error: "Invalid note ID." };
  if (!normalizedContactId) return { error: "The contact could not be found." };

  // Verify contact exists
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id")
    .eq("id", normalizedContactId)
    .maybeSingle();

  if (contactError || !contact) return { error: "The contact could not be found." };

  // Verify interaction exists, belongs to contact, and is strictly of type 'meeting'
  const { data: interaction, error: interactionError } = await supabase
    .from("interactions")
    .select("id, contact_id, type")
    .eq("id", normalizedNoteId)
    .maybeSingle();

  if (interactionError || !interaction) return { error: "Meeting note not found." };
  if (interaction.contact_id !== normalizedContactId) {
    return { error: "Meeting note does not belong to this contact." };
  }
  if (interaction.type !== "meeting") {
    return { error: "Only meeting notes can be deleted." };
  }

  // Strictly soft-delete where id = noteId, contact_id = contactId, and type = 'meeting'
  // NEVER allow deleting type = 'follow_up'
  const { error: deleteError } = await supabase
    .from("interactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", normalizedNoteId)
    .eq("contact_id", normalizedContactId)
    .eq("type", "meeting");

  if (deleteError) return { error: "The meeting note could not be deleted." };

  revalidatePath("/investors");
  revalidatePath(`/investors/${normalizedContactId}`);
  return { success: true };
}

export type ContactGroupOption = { id: string; name: string };

export async function getContactGroupOptions(contactId: string) {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  if (!contactId.trim()) return { error: "The contact could not be found." };

  const [{ data: contact, error: contactError }, { data: groups, error: groupsError }, { data: memberships, error: membershipsError }] = await Promise.all([
    supabase.from("contacts").select("id").eq("id", contactId).maybeSingle(),
    supabase.from("groups").select("id, name").order("name", { ascending: true }),
    supabase.from("contact_groups").select("group_id").eq("contact_id", contactId),
  ]);

  if (contactError || !contact) return { error: "The contact could not be found." };
  if (groupsError || membershipsError) return { error: "Groups could not be loaded." };

  const memberIds = new Set((memberships ?? []).map((membership) => membership.group_id));
  return {
    groups: (groups ?? []).filter((group) => !memberIds.has(group.id)) as ContactGroupOption[],
  };
}

export async function addContactToGroups(contactId: string, groupIds: string[]) {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const normalizedGroupIds = [...new Set(groupIds.filter((id) => typeof id === "string" && id.trim()))];
  if (!contactId.trim()) return { error: "The contact could not be found." };
  if (!normalizedGroupIds.length) return { error: "No groups were selected." };

  const [{ data: contact, error: contactError }, { data: groups, error: groupsError }, { data: memberships, error: membershipsError }] = await Promise.all([
    supabase.from("contacts").select("id").eq("id", contactId).maybeSingle(),
    supabase.from("groups").select("id, name").in("id", normalizedGroupIds),
    supabase.from("contact_groups").select("group_id").eq("contact_id", contactId).in("group_id", normalizedGroupIds),
  ]);

  if (contactError || !contact) return { error: "The contact could not be found." };
  if (groupsError || groups?.length !== normalizedGroupIds.length) return { error: "One or more selected groups could not be found." };
  if (membershipsError) return { error: "Group memberships could not be checked." };

  const existingIds = new Set((memberships ?? []).map((membership) => membership.group_id));
  const newGroupIds = normalizedGroupIds.filter((id) => !existingIds.has(id));
  if (newGroupIds.length) {
    const { error } = await supabase.from("contact_groups").insert(newGroupIds.map((groupId) => ({ contact_id: contactId, group_id: groupId })));
    if (error) return { error: "The contact could not be added to the groups." };
  }

  const { data: updatedMemberships, error: updatedMembershipsError } = await supabase
    .from("contact_groups")
    .select("groups(id, name)")
    .eq("contact_id", contactId);
  if (updatedMembershipsError) return { error: "The contact groups could not be refreshed." };

  revalidatePath("/contacts");
  revalidatePath("/groups");
  return {
    success: true,
    added: newGroupIds.length,
    groups: updatedMemberships ?? [],
  };
}

export async function deleteContact(id: string) {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("contacts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return { error: "The contact could not be deleted." };
  }

  revalidatePath("/contacts");
  return { success: true };
}

export async function deleteContacts(ids: string[]) {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const contactIds = [...new Set(ids.filter(Boolean))];

  if (!contactIds.length) {
    return { error: "No contacts were selected." };
  }

  // Soft delete, like single delete: the contacts are hidden everywhere
  // (groups skip deleted members), but their notes, follow-ups, messages and
  // group memberships stay in the database. There is no restore action yet.
  const deletedAt = new Date().toISOString();
  const { error } = await supabase
    .from("contacts")
    .update({ deleted_at: deletedAt })
    .in("id", contactIds)
    .is("deleted_at", null);

  if (error) {
    return { error: "The selected contacts could not be deleted." };
  }

  revalidatePath("/contacts");
  return { success: true, deleted: contactIds.length };
}

export type ImportContactRow = {
  name: string;
  phone: string;
  email?: string | null;
  tag: string;
  dateSaved: string;
  notes: string;
};

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00Z`);
  return (
    date.getUTCFullYear() === Number(value.slice(0, 4)) &&
    date.getUTCMonth() + 1 === Number(value.slice(5, 7)) &&
    date.getUTCDate() === Number(value.slice(8, 10))
  );
}

function validateImportRow(row: ImportContactRow) {
  if (!row.name || !row.phone) {
    return "Name and phone are required.";
  }

  if (!/^\d{7,15}$/.test(row.phone)) {
    return "Phone must contain 7-15 digits.";
  }

  if (row.email && !isValidEmail(row.email)) {
    return "Please enter a valid email address.";
  }

  if (row.dateSaved && !isValidDate(row.dateSaved)) {
    return "Date Saved must use a valid YYYY-MM-DD date.";
  }

  return null;
}

export type ImportDuplicateRow = {
  name: string;
  phone: string;
  email: string | null;
  reason: string;
};

export type ImportContactsResult =
  | {
      success: true;
      imported: number;
      duplicates: number;
      rejected: number;
      duplicateRows: ImportDuplicateRow[];
    }
  | { error: string };

// Insert in batches rather than one giant array so a single failure only
// stops the rows after it (already-inserted batches stay committed) and so
// we can report exactly how far an import got if something does fail.
const IMPORT_INSERT_BATCH_SIZE = 300;

export async function importContacts(rowsRaw: string): Promise<ImportContactsResult> {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  let rows: ImportContactRow[];

  try {
    const parsedRows: unknown = JSON.parse(rowsRaw);
    if (!Array.isArray(parsedRows)) throw new Error("Invalid rows");
    rows = parsedRows.map((row) => {
      const rowObj = row as ImportContactRow;
      const emailRaw = rowObj.email !== undefined && rowObj.email !== null
        ? String(rowObj.email).trim()
        : "";
      return {
        name: String(rowObj.name ?? "").trim(),
        phone: String(rowObj.phone ?? "").trim(),
        email: emailRaw || null,
        tag: String(rowObj.tag ?? "").trim(),
        dateSaved: String(rowObj.dateSaved ?? "").trim(),
        notes: String(rowObj.notes ?? "").trim(),
      };
    });
  } catch {
    return { error: "The CSV data could not be processed." };
  }

  if (!rows.length) {
    return { error: "The CSV file does not contain any rows." };
  }

  const validRows = rows.filter((row) => !validateImportRow(row));
  const rejected = rows.length - validRows.length;

  let existingPhonesList: string[];
  try {
    // Matches the original behavior of this lookup: existing AND
    // soft-deleted contacts both count as "already taken" phone numbers.
    existingPhonesList = await fetchAllContactPhones(supabase, { excludeDeleted: false });
  } catch {
    return { error: "Contacts could not be checked for duplicates." };
  }

  const existingPhones = new Set(existingPhonesList.map((phone) => normalizePhone(phone)));
  const seenPhones = new Map<string, string>();
  const rowsToInsert: ImportContactRow[] = [];
  const duplicateRows: ImportDuplicateRow[] = [];

  for (const row of validRows) {
    const normalizedPhone = normalizePhone(row.phone);

    if (existingPhones.has(normalizedPhone)) {
      duplicateRows.push({
        name: row.name,
        phone: row.phone,
        email: row.email ?? null,
        reason: "Phone already exists in the CRM",
      });
      continue;
    }

    const firstSeenName = seenPhones.get(normalizedPhone);
    if (firstSeenName) {
      duplicateRows.push({
        name: row.name,
        phone: row.phone,
        email: row.email ?? null,
        reason: `Duplicate phone number within this file (same as "${firstSeenName}")`,
      });
      continue;
    }

    seenPhones.set(normalizedPhone, row.name);
    rowsToInsert.push(row);
  }

  for (let i = 0; i < rowsToInsert.length; i += IMPORT_INSERT_BATCH_SIZE) {
    const batch = rowsToInsert.slice(i, i + IMPORT_INSERT_BATCH_SIZE).map((row) => ({
      name: row.name,
      phone: normalizePhone(row.phone),
      email: row.email ? row.email.toLowerCase() : null,
      tags: row.tag ? [row.tag] : [],
      date_saved: row.dateSaved || null,
      notes: row.notes || null,
    }));

    const { data: insertedRows, error: insertError } = await supabase
      .from("contacts")
      .insert(batch)
      .select("id, phone");

    if (!insertError && insertedRows) {
      await linkUnmatchedMessages(supabase, insertedRows);
    }

    if (insertError) {
      revalidatePath("/contacts");
      return {
        error: `Import stopped after ${i} of ${rowsToInsert.length} new contacts. The ${i} contacts already inserted were saved — try again to import the rest.`,
      };
    }
  }

  revalidatePath("/contacts");
  return {
    success: true,
    imported: rowsToInsert.length,
    duplicates: duplicateRows.length,
    rejected,
    duplicateRows,
  };
}

export type ParseExcelFileResult = ParsedSpreadsheet | { error: string };

/**
 * Parses an uploaded Excel (.xlsx/.xls) file into the same
 * { headers, rows } shape the client already uses for CSV, so it can reuse
 * the existing column-mapping and validation UI.
 */
export async function parseExcelFile(file: File): Promise<ParseExcelFileResult> {
  const { error: authError } = await requireActionAuth();
  if (authError) return { error: "Unauthorized" };

  if (!file || file.size === 0) return { error: "No file selected." };
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return { error: "File is too large. Please choose a file under 5MB." };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    return await parseExcelBuffer(buffer);
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : "The Excel file could not be read.",
    };
  }
}

export type GenerateWhatsAppSummaryResult =
  | {
      success: true;
      summary: string;
      generatedAt: string;
    }
  | {
      error: string;
    };

export async function generateWhatsAppSummary(
  contactId: string
): Promise<GenerateWhatsAppSummaryResult> {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const normalizedContactId = contactId.trim();
  if (!normalizedContactId) return { error: "The contact could not be found." };

  try {
    const { data: messages, error: messagesError } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("contact_id", normalizedContactId)
      .is("deleted_at", null)
      .order("sent_at", { ascending: true });

    if (messagesError) {
      return { error: "WhatsApp messages could not be loaded." };
    }

    if (!messages || messages.length === 0) {
      return { error: "No WhatsApp messages found to summarize." };
    }

    const summary = await generateChatSummary(messages);
    const nowIso = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("contacts")
      .update({
        whatsapp_summary: summary,
        whatsapp_summary_generated_at: nowIso,
      })
      .eq("id", normalizedContactId);

    if (updateError) {
      return { error: "Failed to save the WhatsApp summary." };
    }

    revalidatePath(`/contacts/${normalizedContactId}`);
    revalidatePath(`/investors/${normalizedContactId}`);

    return {
      success: true,
      summary,
      generatedAt: nowIso,
    };
  } catch (err: unknown) {
    const errMsg =
      err instanceof Error ? err.message : "Failed to generate WhatsApp summary.";
    return { error: errMsg };
  }
}
