import { createServiceRoleClient } from "@/lib/supabase-service";

const WHATSAPP_MEDIA_BUCKET = "whatsapp-media";
/** Bigger files stay as a Meta reference (opened on demand) to keep the webhook fast. */
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "application/pdf": "pdf",
  "text/plain": "txt",
};

function extensionFor(mimeType: string, filename?: string): string {
  const fromName = filename?.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1];
  if (fromName) return fromName.toLowerCase();
  const base = mimeType.split(";")[0].trim().toLowerCase();
  return EXTENSION_BY_MIME[base] ?? "bin";
}

/**
 * Downloads a file a contact sent on WhatsApp (by Meta media ID) and stores
 * it in the whatsapp-media bucket, returning its URL. The storage path is
 * fixed per media ID, so receiving the same webhook twice doesn't duplicate it.
 * Meta keeps media for about 30 days; after that this throws.
 */
export async function storeInboundWhatsAppMedia(
  mediaId: string,
  filename?: string,
): Promise<string> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN is not configured.");

  // 1. Ask Meta where the file is (a short-lived, authenticated URL).
  const infoResponse = await fetch(`https://graph.facebook.com/v25.0/${encodeURIComponent(mediaId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const info = await infoResponse.json();
  if (!infoResponse.ok || info.error || !info.url) {
    throw new Error(info.error?.message || "WhatsApp no longer has this file.");
  }
  if (Number(info.file_size) > MAX_DOWNLOAD_BYTES) {
    throw new Error("File is too large to store automatically.");
  }

  // 2. Download it (Meta requires the same token).
  const fileResponse = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` } });
  if (!fileResponse.ok) {
    throw new Error(`Could not download the file from WhatsApp (HTTP ${fileResponse.status}).`);
  }
  const bytes = Buffer.from(await fileResponse.arrayBuffer());

  // 3. Store it under a path derived from the media ID.
  const mimeType = String(info.mime_type || "application/octet-stream");
  const safeId = mediaId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const path = `inbound/${safeId}.${extensionFor(mimeType, filename)}`;

  const supabase = createServiceRoleClient();
  const { error } = await supabase.storage
    .from(WHATSAPP_MEDIA_BUCKET)
    .upload(path, bytes, { contentType: mimeType.split(";")[0].trim(), upsert: true });
  if (error) throw new Error(`Failed to store media file: ${error.message}`);

  return supabase.storage.from(WHATSAPP_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}
