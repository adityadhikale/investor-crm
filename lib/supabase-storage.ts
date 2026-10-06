import { createServiceRoleClient } from "@/lib/supabase-service";

export const WHATSAPP_MEDIA_BUCKET = "whatsapp-media";

/**
 * The storage path inside the whatsapp-media bucket for a stored file's URL
 * (public or signed form), or null if the URL isn't one of our stored files.
 */
export function mediaStoragePathFromUrl(mediaUrl: string): string | null {
  const marker = `/storage/v1/object/`;
  const at = mediaUrl.indexOf(marker);
  if (at === -1) return null;
  const rest = mediaUrl.slice(at + marker.length).split("?")[0]; // public/<bucket>/<path> or sign/<bucket>/<path>
  const match = rest.match(/^(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
  if (!match || match[1] !== WHATSAPP_MEDIA_BUCKET) return null;
  try {
    return decodeURIComponent(match[2]);
  } catch {
    return null;
  }
}

/**
 * A short-lived link to a stored file. The bucket can be private: files are
 * only reachable through the signed-in CRM, never by a guessable public link.
 */
export async function createSignedMediaUrl(path: string, seconds = 3600): Promise<string | null> {
  const { data, error } = await createServiceRoleClient()
    .storage.from(WHATSAPP_MEDIA_BUCKET)
    .createSignedUrl(path, seconds);
  return error || !data ? null : data.signedUrl;
}

/** The address recorded on a message for a file in the bucket (kept in this form for all stored files). */
export function mediaUrlForPath(path: string): string {
  return createServiceRoleClient().storage.from(WHATSAPP_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Lets the browser upload a file straight to storage, so a big attachment
 * doesn't have to pass through the web server (which caps request size).
 */
export async function createMediaUploadTarget(
  contactId: string,
  filename: string,
): Promise<{ path: string; token: string }> {
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${contactId}/${Date.now()}-${safeFilename}`;
  const { data, error } = await createServiceRoleClient()
    .storage.from(WHATSAPP_MEDIA_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Could not prepare the upload: ${error?.message ?? "unknown error"}`);
  return { path, token: data.token };
}

/** Downloads a stored file's bytes (server to storage; not limited by the web request size). */
export async function downloadStoredMedia(path: string): Promise<Buffer> {
  const { data, error } = await createServiceRoleClient()
    .storage.from(WHATSAPP_MEDIA_BUCKET)
    .download(path);
  if (error || !data) throw new Error(`Could not read the uploaded file: ${error?.message ?? "unknown error"}`);
  return Buffer.from(await data.arrayBuffer());
}
