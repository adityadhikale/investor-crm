"use server";

import { requireActionAuth } from "@/lib/auth";
import { getAppSettings } from "@/lib/settings";

export type NotificationItem = {
  id: string;
  kind: "message" | "followup" | "broadcast";
  title: string;
  description: string;
  href: string;
  /** ISO timestamp used for the relative time label and ordering. */
  at: string;
  urgent?: boolean;
};

export type NotificationsResult = {
  items: NotificationItem[];
  /** Items that need action: unread conversations + follow-ups due or overdue. */
  badgeCount: number;
};

const MAX_PER_KIND = 10;

// Stand-in for a query that is switched off in Settings.
const EMPTY_RESULT = { data: [], error: null, count: 0 };

function truncate(value: string, max = 80) {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

export async function getNotifications(): Promise<NotificationsResult> {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { items: [], badgeCount: 0 };

  const settings = await getAppSettings(supabase);
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const sevenDaysAgoIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [unreadResult, followUpsResult, broadcastsResult] = await Promise.all([
    settings.notifyMessages
      ? supabase
          .rpc("unread_conversations", {}, { count: "exact" })
          .range(0, MAX_PER_KIND - 1)
      : Promise.resolve(EMPTY_RESULT),
    settings.notifyFollowUps
      ? supabase
          .from("follow_ups")
          .select("id, contact_id, due_date, message", { count: "exact" })
          .eq("is_done", false)
          .is("deleted_at", null)
          .lte("due_date", todayStr)
          .order("due_date", { ascending: true })
          .order("id", { ascending: true })
          .limit(MAX_PER_KIND)
      : Promise.resolve(EMPTY_RESULT),
    settings.notifyBroadcasts
      ? supabase
          .from("broadcasts")
          .select("id, message_text, sent_at")
          .eq("status", "sent")
          .is("deleted_at", null)
          .gte("sent_at", sevenDaysAgoIso)
          .order("sent_at", { ascending: false })
          .limit(MAX_PER_KIND)
      : Promise.resolve(EMPTY_RESULT),
  ]);

  const unreadRows = (unreadResult.error ? [] : unreadResult.data ?? []) as Array<{
    contact_id: string;
    unread_count: number;
    last_message_at: string;
    last_message_text: string | null;
    last_media_url: string | null;
  }>;
  const followUps = followUpsResult.error ? [] : followUpsResult.data ?? [];
  const broadcasts = broadcastsResult.error ? [] : broadcastsResult.data ?? [];

  const contactIds = [
    ...new Set([
      ...unreadRows.map((row) => row.contact_id),
      ...followUps.map((followUp) => followUp.contact_id as string),
    ]),
  ];

  const contactNames = new Map<string, string>();
  if (contactIds.length) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, name")
      .in("id", contactIds);
    for (const contact of contacts ?? []) {
      contactNames.set(contact.id as string, contact.name as string);
    }
  }

  const items: NotificationItem[] = [];

  for (const row of unreadRows) {
    const name = contactNames.get(row.contact_id);
    if (!name) continue;
    const count = Number(row.unread_count);
    const preview =
      row.last_message_text?.trim() || (row.last_media_url ? "[Media message]" : "New message");
    items.push({
      id: `message-${row.contact_id}`,
      kind: "message",
      title: count > 1 ? `${name} sent ${count} messages` : `${name} sent a message`,
      description: truncate(preview),
      href: `/contacts/${row.contact_id}`,
      at: row.last_message_at,
    });
  }

  for (const followUp of followUps) {
    const name = contactNames.get(followUp.contact_id as string);
    if (!name) continue;
    const dueDate = followUp.due_date as string;
    const overdue = dueDate < todayStr;
    items.push({
      id: `followup-${followUp.id}`,
      kind: "followup",
      title: overdue ? `Overdue follow-up: ${name}` : `Follow-up due today: ${name}`,
      description: truncate((followUp.message as string | null) ?? "No details"),
      href: `/contacts/${followUp.contact_id}`,
      at: `${dueDate.slice(0, 10)}T00:00:00`,
      urgent: overdue,
    });
  }

  for (const broadcast of broadcasts) {
    if (!broadcast.sent_at) continue;
    items.push({
      id: `broadcast-${broadcast.id}`,
      kind: "broadcast",
      title: "Broadcast sent",
      description: truncate((broadcast.message_text as string | null) ?? ""),
      href: `/broadcasts/${broadcast.id}`,
      at: broadcast.sent_at as string,
    });
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return {
    items,
    badgeCount: (unreadResult.error ? 0 : unreadResult.count ?? 0) + (followUpsResult.count ?? 0),
  };
}
