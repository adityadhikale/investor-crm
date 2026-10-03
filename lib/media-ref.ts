/**
 * The Meta media ID if a stored media_url still points at Meta rather than
 * our own copy: either "meta_media_id:<id>", or one of Meta's lookaside URLs
 * (which only open with our access token). Null for our own stored files.
 */
export function metaMediaIdFrom(mediaUrl: string): string | null {
  if (mediaUrl.startsWith("meta_media_id:")) {
    return mediaUrl.slice("meta_media_id:".length) || null;
  }
  try {
    const url = new URL(mediaUrl);
    if (url.hostname.endsWith("fbsbx.com") || url.hostname.endsWith("whatsapp.net")) {
      return url.searchParams.get("mid");
    }
  } catch {
    // Not a URL.
  }
  return null;
}
