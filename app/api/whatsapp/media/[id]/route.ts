import { NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";
import { storeInboundWhatsAppMedia } from "@/lib/inbound-media";
import { metaMediaIdFrom } from "@/lib/media-ref";
import { createSignedMediaUrl, mediaStoragePathFromUrl } from "@/lib/supabase-storage";

/** Our own stored file: a short-lived signed link. Anything else: the address as saved. */
async function openStoredUrl(mediaUrl: string) {
  const path = mediaStoragePathFromUrl(mediaUrl);
  const signed = path ? await createSignedMediaUrl(path) : null;
  return NextResponse.redirect(signed ?? mediaUrl);
}

export const dynamic = "force-dynamic";

/**
 * Opens the file attached to a WhatsApp message. Files received before the
 * CRM stored incoming media (saved as "meta_media_id:...") are downloaded from
 * Meta on first open, saved, and the message is updated to point at the copy.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Row-level security limits this to the CRM owner's data.
  const { data: message } = await supabase
    .from("whatsapp_messages")
    .select("id, media_url")
    .eq("id", id)
    .maybeSingle();

  const mediaUrl = message?.media_url as string | null | undefined;
  if (!mediaUrl) {
    return new NextResponse("This message has no attachment.", { status: 404 });
  }

  const mediaId = metaMediaIdFrom(mediaUrl);
  if (!mediaId) {
    return openStoredUrl(mediaUrl);
  }

  try {
    const storedUrl = await storeInboundWhatsAppMedia(mediaId);
    await supabase.from("whatsapp_messages").update({ media_url: storedUrl }).eq("id", id);
    return openStoredUrl(storedUrl);
  } catch {
    return new NextResponse(
      "This file is no longer available. WhatsApp keeps received files for about 30 days.",
      { status: 410, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }
}
