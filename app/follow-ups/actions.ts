"use server";

import { requireOwnerAction } from "@/lib/auth";
import { runReminderDispatch } from "@/lib/follow-up-reminders";

/**
 * Authenticated wrapper for manually testing the reminder email from the UI
 * (e.g. a "Send test reminder" button on the dashboard). This is separate
 * from the /api/follow-ups/trigger route, which is for an unattended
 * scheduler call (netlify/functions/send-daily-reminder.mts, 10:00 AM IST).
 */
export async function sendTestFollowUpReminder() {
  const { error: authError } = await requireOwnerAction();
  if (authError) return { error: "Unauthorized" };

  const summary = await runReminderDispatch({ ignoreEnabledSwitch: true });
  if (!summary.success) {
    return { error: summary.error || "Failed to send reminder email." };
  }
  if (!summary.emailed) {
    return {
      success: true,
      message: "No follow-ups are due and no messages are unread — nothing was emailed.",
    };
  }

  const parts: string[] = [];
  if (summary.dueCount > 0) {
    parts.push(`${summary.dueCount} due follow-up${summary.dueCount === 1 ? "" : "s"}`);
  }
  if (summary.unreadCount > 0) {
    parts.push(
      `${summary.unreadCount} unread conversation${summary.unreadCount === 1 ? "" : "s"}`,
    );
  }
  return {
    success: true,
    message: parts.length
      ? `Reminder email sent with ${parts.join(" and ")}.`
      : "Test email sent. Nothing is due right now, so it just confirms email is working.",
  };
}
