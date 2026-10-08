"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { isPublicPath } from "@/lib/public-routes";
import { MESSAGES_CHANGED_EVENT, UNREAD_CHANGED_EVENT } from "@/lib/unread-events";
import { createClient } from "@/src/lib/supabase/client";

/**
 * Listens for WhatsApp message changes pushed by Supabase Realtime and tells
 * the rest of the app, so a message that just arrived shows up within a
 * second or two instead of at the next refresh. It renders nothing. If live
 * updates aren't available (for example the database step hasn't been run),
 * the regular refresh timers keep everything current.
 */
export function RealtimeBridge() {
  const pathname = usePathname();
  const isPublic = isPublicPath(pathname);

  useEffect(() => {
    if (isPublic) return;

    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let timer: number | null = null;

    // Several events can arrive together (a message plus its status); notify once.
    function notify() {
      if (timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        window.dispatchEvent(new Event(MESSAGES_CHANGED_EVENT));
        window.dispatchEvent(new Event(UNREAD_CHANGED_EVENT));
      }, 300);
    }

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled || !data.session) return;
        channel = supabase
          .channel("crm-whatsapp-messages")
          .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_messages" }, notify)
          .subscribe();
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [isPublic]);

  return null;
}
