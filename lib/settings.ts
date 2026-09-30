import type { SupabaseClient } from "@supabase/supabase-js";

export type AppSettings = {
  reminderEmailEnabled: boolean;
  /** Overrides the REMINDER_EMAIL_TO env var when set. */
  reminderEmailTo: string | null;
  reminderIncludeFollowUps: boolean;
  reminderIncludeUnread: boolean;
  notifyMessages: boolean;
  notifyFollowUps: boolean;
  notifyBroadcasts: boolean;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  reminderEmailEnabled: true,
  reminderEmailTo: null,
  reminderIncludeFollowUps: true,
  reminderIncludeUnread: true,
  notifyMessages: true,
  notifyFollowUps: true,
  notifyBroadcasts: true,
};

/**
 * Loads the settings row. Falls back to defaults if the row or the table
 * does not exist yet (e.g. the migration has not been applied), so the rest
 * of the app keeps working exactly as before.
 */
export async function getAppSettings(
  supabase: SupabaseClient,
): Promise<AppSettings> {
  const { data, error } = await supabase
    .from("app_settings")
    .select(
      "reminder_email_enabled, reminder_email_to, reminder_include_followups, reminder_include_unread, notify_messages, notify_followups, notify_broadcasts",
    )
    .eq("id", "default")
    .maybeSingle();

  if (error || !data) return DEFAULT_APP_SETTINGS;

  return {
    reminderEmailEnabled: data.reminder_email_enabled ?? true,
    reminderEmailTo: data.reminder_email_to?.trim() || null,
    reminderIncludeFollowUps: data.reminder_include_followups ?? true,
    reminderIncludeUnread: data.reminder_include_unread ?? true,
    notifyMessages: data.notify_messages ?? true,
    notifyFollowUps: data.notify_followups ?? true,
    notifyBroadcasts: data.notify_broadcasts ?? true,
  };
}
