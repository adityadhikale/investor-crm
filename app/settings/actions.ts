"use server";

import { revalidatePath } from "next/cache";
import { requireActionAuth } from "@/lib/auth";
import type { AppSettings } from "@/lib/settings";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function saveAppSettings(settings: AppSettings) {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const reminderEmailTo = settings.reminderEmailTo?.trim() || null;
  if (reminderEmailTo && !EMAIL_PATTERN.test(reminderEmailTo)) {
    return { error: "Enter a valid email address for the reminder." };
  }

  const { error } = await supabase.from("app_settings").upsert({
    id: "default",
    reminder_email_enabled: Boolean(settings.reminderEmailEnabled),
    reminder_email_to: reminderEmailTo,
    reminder_include_followups: Boolean(settings.reminderIncludeFollowUps),
    reminder_include_unread: Boolean(settings.reminderIncludeUnread),
    notify_messages: Boolean(settings.notifyMessages),
    notify_followups: Boolean(settings.notifyFollowUps),
    notify_broadcasts: Boolean(settings.notifyBroadcasts),
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return {
      error:
        "Settings could not be saved. If you have not yet run the app_settings migration in Supabase, run it first.",
    };
  }

  revalidatePath("/my-profile");
  return { success: true as const };
}
