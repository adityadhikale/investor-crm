import { createServiceRoleClient } from "@/lib/supabase-service";
import { sendEmail } from "@/lib/resend";
import { getAppSettings } from "@/lib/settings";

export interface DueFollowUpRow {
  id: string;
  due_date: string;
  message: string;
  contact_id: string;
  contact_name: string;
}

export interface UnreadMessageRow {
  contact_id: string;
  contact_name: string;
  contact_phone: string;
  unread_count: number;
  last_message_at: string;
  last_message_text: string;
}

/** Max rows listed per section; the rest are summarised as "and N more". */
const MAX_ROWS_PER_SECTION = 25;

function todayAsISODate() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncate(value: string, max = 120) {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function formatReceived(value: string) {
  const date = new Date(value);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

const CELL = "padding:8px 12px;border-bottom:1px solid #e5e7eb;";
const HEAD = "text-align:left;padding:8px 12px;border-bottom:2px solid #d1d5db;";

function moreRow(hidden: number, columns: number) {
  if (hidden <= 0) return "";
  return `
        <tr>
          <td colspan="${columns}" style="padding:8px 12px;color:#6b7280;">…and ${hidden} more. Open the CRM to see all.</td>
        </tr>`;
}

function buildReminderEmailHtml(
  followUps: DueFollowUpRow[],
  unread: UnreadMessageRow[],
  today: string,
) {
  const overdue = followUps.filter((r) => r.due_date < today);
  const dueToday = followUps.filter((r) => r.due_date === today);

  const followUpSection = (title: string, list: DueFollowUpRow[]) => {
    if (list.length === 0) return "";
    const rows = list
      .slice(0, MAX_ROWS_PER_SECTION)
      .map(
        (r) => `
        <tr>
          <td style="${CELL}">${escapeHtml(r.contact_name)}</td>
          <td style="${CELL}">${escapeHtml(r.due_date)}</td>
          <td style="${CELL}">${escapeHtml(r.message)}</td>
        </tr>`,
      )
      .join("");
    return `
      <h2 style="font-size:16px;margin:24px 0 8px;">${escapeHtml(title)} (${list.length})</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr>
            <th style="${HEAD}">Investor</th>
            <th style="${HEAD}">Due date</th>
            <th style="${HEAD}">Follow-up</th>
          </tr>
        </thead>
        <tbody>${rows}${moreRow(list.length - MAX_ROWS_PER_SECTION, 3)}</tbody>
      </table>`;
  };

  const unreadSection = () => {
    if (unread.length === 0) return "";
    const rows = unread
      .slice(0, MAX_ROWS_PER_SECTION)
      .map(
        (r) => `
        <tr>
          <td style="${CELL}">${escapeHtml(r.contact_name)}<br><span style="color:#6b7280;font-size:12px;">${escapeHtml(r.contact_phone)}</span></td>
          <td style="${CELL}">${escapeHtml(truncate(r.last_message_text))}</td>
          <td style="${CELL}text-align:center;">${r.unread_count}</td>
          <td style="${CELL}white-space:nowrap;">${escapeHtml(formatReceived(r.last_message_at))}</td>
        </tr>`,
      )
      .join("");
    return `
      <h2 style="font-size:16px;margin:24px 0 8px;">Unread WhatsApp messages (${unread.length})</h2>
      <p style="font-size:13px;color:#6b7280;margin:0 0 8px;">These contacts have written to you and are still waiting for a reply.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr>
            <th style="${HEAD}">Contact</th>
            <th style="${HEAD}">Last message</th>
            <th style="${HEAD}text-align:center;">Unread</th>
            <th style="${HEAD}">Received (IST)</th>
          </tr>
        </thead>
        <tbody>${rows}${moreRow(unread.length - MAX_ROWS_PER_SECTION, 4)}</tbody>
      </table>`;
  };

  return `
    <div style="font-family:sans-serif;color:#111827;max-width:640px;">
      <h1 style="font-size:18px;">CREST CRM — Daily Reminder</h1>
      <p style="font-size:14px;color:#4b5563;">Here is what needs your attention as of ${escapeHtml(today)}.</p>
      ${followUpSection("Overdue follow-ups", overdue)}
      ${followUpSection("Follow-ups due today", dueToday)}
      ${unreadSection()}
    </div>`;
}

function buildSubject(followUpCount: number, unreadCount: number) {
  const parts: string[] = [];
  if (followUpCount > 0) {
    parts.push(`${followUpCount} follow-up${followUpCount === 1 ? "" : "s"} due`);
  }
  if (unreadCount > 0) {
    parts.push(`${unreadCount} unread message${unreadCount === 1 ? "" : "s"}`);
  }
  return `CREST CRM: ${parts.join(", ")}`;
}

export interface DispatchFollowUpRemindersSummary {
  success: boolean;
  dueCount: number;
  unreadCount: number;
  emailed: boolean;
  /** Set when nothing was sent on purpose, e.g. the reminder email is switched off. */
  skippedReason?: string;
  error?: string;
}

/**
 * Finds all pending follow-ups due today or earlier, plus WhatsApp
 * conversations still waiting for a reply, and emails a single digest to the
 * configured reminder recipient. Intended to be called once a day (manually
 * for now; see /api/follow-ups/trigger for the protected endpoint used once a
 * scheduler is wired up). Respects the settings saved on /my-profile.
 */
export async function dispatchDueFollowUpReminders(): Promise<DispatchFollowUpRemindersSummary> {
  return runReminderDispatch({ ignoreEnabledSwitch: false });
}

// Lives in lib/ (not a "use server" file) so it is never exposed as a browser-callable action.
export async function runReminderDispatch({
  ignoreEnabledSwitch,
}: {
  ignoreEnabledSwitch: boolean;
}): Promise<DispatchFollowUpRemindersSummary> {
  const supabase = createServiceRoleClient();
  const today = todayAsISODate();
  const settings = await getAppSettings(supabase);

  if (!settings.reminderEmailEnabled && !ignoreEnabledSwitch) {
    return {
      success: true,
      dueCount: 0,
      unreadCount: 0,
      emailed: false,
      skippedReason: "The reminder email is switched off in Settings.",
    };
  }

  const [followUpsResult, unreadResult] = await Promise.all([
    settings.reminderIncludeFollowUps
      ? supabase
          .from("follow_ups")
          .select("id, due_date, message, contact_id, contacts(name)")
          .eq("is_done", false)
          .is("deleted_at", null)
          .lte("due_date", today)
          .order("due_date", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    settings.reminderIncludeUnread
      ? supabase.rpc("unread_conversations")
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (followUpsResult.error) {
    return {
      success: false,
      dueCount: 0,
      unreadCount: 0,
      emailed: false,
      error: followUpsResult.error.message || "Failed to fetch due follow-ups.",
    };
  }

  const followUps: DueFollowUpRow[] = (followUpsResult.data ?? []).map((row) => {
    const contact = row.contacts as unknown as { name: string } | { name: string }[] | null;
    const contactName = Array.isArray(contact) ? contact[0]?.name : contact?.name;
    return {
      id: row.id,
      due_date: row.due_date,
      message: row.message,
      contact_id: row.contact_id,
      contact_name: contactName || "Unknown investor",
    };
  });

  // If the unread_conversations() migration has not been applied, or the
  // lookup fails, still send the follow-up digest rather than nothing.
  const unreadRaw = (unreadResult.error ? [] : unreadResult.data ?? []) as Array<{
    contact_id: string;
    unread_count: number;
    last_message_at: string;
    last_message_text: string | null;
    last_media_url: string | null;
  }>;

  const unread: UnreadMessageRow[] = [];
  if (unreadRaw.length > 0) {
    const contactInfo = new Map<string, { name: string; phone: string }>();
    for (let i = 0; i < unreadRaw.length; i += 100) {
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, name, phone")
        .in(
          "id",
          unreadRaw.slice(i, i + 100).map((row) => row.contact_id),
        );
      for (const contact of contacts ?? []) {
        contactInfo.set(contact.id as string, {
          name: contact.name as string,
          phone: contact.phone as string,
        });
      }
    }

    for (const row of unreadRaw) {
      const info = contactInfo.get(row.contact_id);
      if (!info) continue;
      unread.push({
        contact_id: row.contact_id,
        contact_name: info.name,
        contact_phone: info.phone,
        unread_count: Number(row.unread_count),
        last_message_at: row.last_message_at,
        last_message_text:
          row.last_message_text?.trim() || (row.last_media_url ? "[Media message]" : "No text"),
      });
    }
  }

  if (followUps.length === 0 && unread.length === 0) {
    return { success: true, dueCount: 0, unreadCount: 0, emailed: false };
  }

  const recipient = settings.reminderEmailTo || process.env.REMINDER_EMAIL_TO;
  if (!recipient) {
    return {
      success: false,
      dueCount: followUps.length,
      unreadCount: unread.length,
      emailed: false,
      error: "No reminder email address is set. Add one in Settings.",
    };
  }

  try {
    await sendEmail({
      to: recipient,
      subject: buildSubject(followUps.length, unread.length),
      html: buildReminderEmailHtml(followUps, unread, today),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to send reminder email.";
    return {
      success: false,
      dueCount: followUps.length,
      unreadCount: unread.length,
      emailed: false,
      error: message,
    };
  }

  return { success: true, dueCount: followUps.length, unreadCount: unread.length, emailed: true };
}
