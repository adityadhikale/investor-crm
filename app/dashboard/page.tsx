import type { Metadata } from "next";
import Link from "next/link";
import {
  Users,
  TrendingUp,
  Clock,
  AlertCircle,
  MessageSquare,
  ArrowUpRight,
  Calendar,
} from "lucide-react";
import { startOfWeek, subWeeks, addDays, format } from "date-fns";
import { requireAuth } from "@/lib/auth";
import { getUserDisplayName } from "@/lib/user";
import { cn } from "@/lib/utils";
import {
  FollowUpTrendChart,
  TagDistributionChart,
  InvestorsGoingQuietList,
  type FollowUpTrendPoint,
  type TagDistributionPoint,
  type QuietInvestorItem,
} from "@/components/dashboard-analytics";
import { TAG_OPTIONS, isInvestorTag } from "@/lib/tags";
import { SendTestReminderButton } from "@/components/send-test-reminder-button";
import { fetchAllPages } from "@/lib/supabase-pagination";

export const metadata: Metadata = {
  title: "Dashboard",
};

type ContactItem = {
  id: string;
  name: string;
  tags?: string[] | null;
};

type FollowUpRecord = {
  id: string;
  contact_id: string;
  due_date: string;
  message: string;
  is_done: boolean;
  created_at: string;
};

type InteractionRecord = {
  id: string;
  contact_id: string;
  type: string;
  note: string;
  created_at: string;
};

type WeekBucket = {
  label: string;
  start: Date;
  end: Date;
  created: number;
  completed: number;
};

function getEightWeekBuckets(now: Date): WeekBucket[] {
  const buckets: WeekBucket[] = [];
  for (let i = 7; i >= 0; i--) {
    const ref = subWeeks(now, i);
    const start = startOfWeek(ref, { weekStartsOn: 1 });
    const safeStart = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
      0,
      0,
      0,
      0
    );
    const safeEnd = addDays(safeStart, 7);
    buckets.push({
      label: format(safeStart, "MMM d"),
      start: safeStart,
      end: safeEnd,
      created: 0,
      completed: 0,
    });
  }
  return buckets;
}

function formatDueDate(dueDate: string) {
  if (!dueDate) return "No date";
  const [year, month, day] = dueDate.split("-").map(Number);
  if (!year || !month || !day) return dueDate;
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatActivityDate(isoString: string) {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getGreeting(name: string, date: Date): string {
  const hour = date.getHours();
  let timeGreeting = "Good morning";
  if (hour >= 12 && hour < 17) {
    timeGreeting = "Good afternoon";
  } else if (hour >= 17) {
    timeGreeting = "Good evening";
  }
  return `${timeGreeting}, ${name}`;
}

function formatBannerDate(d: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const weekday = days[d.getDay()];
  const month = months[d.getMonth()];
  const day = d.getDate();
  return `${weekday}, ${month} ${day}`;
}

export default async function DashboardPage() {
  const { supabase, user } = await requireAuth();
  const now = new Date();
  const displayName = getUserDisplayName(user);
  const greeting = getGreeting(displayName, now);
  const bannerDate = formatBannerDate(now);

  const todayStr = now.toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();

  // 8-week date calculation for trend queries
  const weekBuckets = getEightWeekBuckets(now);
  const eightWeeksAgoIso = weekBuckets[0].start.toISOString();

  let contacts: ContactItem[] = [];
  let pendingFollowUps: FollowUpRecord[] = [];
  let interactions: InteractionRecord[] = [];
  let createdTrend: Array<{ id: string; created_at: string }> = [];
  let completedTrend: Array<{ id: string; created_at: string }> = [];
  let allInteractions: Array<{ contact_id: string; created_at: string }> = [];
  let pendingCount = 0;
  let overdueCount = 0;
  let recentInteractionsCount = 0;
  let dashboardError: string | null = null;

  try {
    [
      contacts,
      pendingFollowUps,
      interactions,
      createdTrend,
      completedTrend,
      allInteractions,
    ] = await Promise.all([
      fetchAllPages<ContactItem>((from, to) =>
        supabase.from("contacts").select("id, name, tags").is("deleted_at", null).range(from, to)
      ),
      fetchAllPages<FollowUpRecord>((from, to) =>
        supabase
          .from("follow_ups")
          .select("id, contact_id, due_date, message, is_done, created_at")
          .eq("is_done", false)
          .is("deleted_at", null)
          .order("due_date", { ascending: true })
          .range(from, to)
      ),
      fetchAllPages<InteractionRecord>((from, to) =>
        supabase
          .from("interactions")
          .select("id, contact_id, type, note, created_at")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .range(from, to)
      ).then((rows) => rows.slice(0, 30)),
      fetchAllPages<{ id: string; created_at: string }>((from, to) =>
        supabase
          .from("follow_ups")
          .select("id, created_at")
          .is("deleted_at", null)
          .gte("created_at", eightWeeksAgoIso)
          .range(from, to)
      ),
      fetchAllPages<{ id: string; created_at: string }>((from, to) =>
        supabase
          .from("interactions")
          .select("id, created_at")
          .eq("type", "follow_up")
          .is("deleted_at", null)
          .gte("created_at", eightWeeksAgoIso)
          .range(from, to)
      ),
      fetchAllPages<{ contact_id: string; created_at: string }>((from, to) =>
        supabase
          .from("interactions")
          .select("contact_id, created_at")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .range(from, to)
      ),
    ]);

    const [pendingCountResult, overdueCountResult, recentInteractionsCountResult] =
      await Promise.all([
        supabase
          .from("follow_ups")
          .select("id", { count: "exact", head: true })
          .eq("is_done", false)
          .is("deleted_at", null),
        supabase
          .from("follow_ups")
          .select("id", { count: "exact", head: true })
          .eq("is_done", false)
          .is("deleted_at", null)
          .lt("due_date", todayStr),
        supabase
          .from("interactions")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .gte("created_at", thirtyDaysAgoIso),
      ]);

    if (pendingCountResult.error) throw new Error(pendingCountResult.error.message);
    if (overdueCountResult.error) throw new Error(overdueCountResult.error.message);
    if (recentInteractionsCountResult.error) throw new Error(recentInteractionsCountResult.error.message);

    pendingCount = pendingCountResult.count ?? 0;
    overdueCount = overdueCountResult.count ?? 0;
    recentInteractionsCount = recentInteractionsCountResult.count ?? 0;
  } catch (err) {
    dashboardError = err instanceof Error ? err.message : "Dashboard data could not be loaded.";
  }

  if (dashboardError) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-2 text-destructive">
          Error loading dashboard data: {dashboardError}
        </p>
      </div>
    );
  }

  // Lookup map for contacts
  const contactsMap = new Map<
    string,
    { id: string; name: string; isInvestor: boolean }
  >();

  let investorCount = 0;
  for (const contact of contacts) {
    const isInvestor = Boolean(
      Array.isArray(contact.tags) &&
        contact.tags.some((tag: string) => isInvestorTag(tag))
    );
    if (isInvestor) {
      investorCount++;
    }
    contactsMap.set(contact.id, {
      id: contact.id,
      name: contact.name,
      isInvestor,
    });
  }

  const totalContacts = contacts.length;

  const summaryCards = [
    {
      label: "Total Contacts",
      value: totalContacts,
      subtext: "In CRM database",
      icon: Users,
      highlight: false,
    },
    {
      label: "Investors",
      value: investorCount,
      subtext: `${totalContacts ? Math.round((investorCount / totalContacts) * 100) : 0}% of contact base`,
      icon: TrendingUp,
      highlight: false,
    },
    {
      label: "Pending Follow-ups",
      value: pendingCount,
      subtext: "Awaiting completion",
      icon: Clock,
      highlight: false,
    },
    {
      label: "Overdue Follow-ups",
      value: overdueCount,
      subtext: overdueCount > 0 ? "Requires attention" : "All caught up",
      icon: AlertCircle,
      highlight: overdueCount > 0,
    },
    {
      label: "Recent Interactions",
      value: recentInteractionsCount,
      subtext: "Last 30 days",
      icon: MessageSquare,
      highlight: false,
    },
  ];

  // Upcoming follow-ups (next 8)
  const upcomingFollowUps = pendingFollowUps.slice(0, 8);

  // Latest interactions (next 8)
  const latestInteractions = interactions.slice(0, 8);

  // --- Analytics: Widget 1: Follow-up Completion Trend ---
  for (const item of createdTrend) {
    const time = new Date(item.created_at).getTime();
    for (const b of weekBuckets) {
      if (time >= b.start.getTime() && time < b.end.getTime()) {
        b.created++;
        break;
      }
    }
  }

  for (const item of completedTrend) {
    const time = new Date(item.created_at).getTime();
    for (const b of weekBuckets) {
      if (time >= b.start.getTime() && time < b.end.getTime()) {
        b.completed++;
        break;
      }
    }
  }

  const followUpTrendData: FollowUpTrendPoint[] = weekBuckets.map((b) => ({
    week: b.label,
    created: b.created,
    completed: b.completed,
  }));

  // --- Analytics: Widget 2: Tag Distribution ---
  const STANDARD_TAGS = TAG_OPTIONS;
  const tagCounts: Record<string, number> = Object.fromEntries(
    TAG_OPTIONS.map((tag) => [tag, 0])
  );

  for (const contact of contacts) {
    if (Array.isArray(contact.tags)) {
      for (const tag of contact.tags) {
        if (typeof tag === "string") {
          const normalized = tag.trim().toLowerCase();
          const matched = STANDARD_TAGS.find(
            (t) => t.toLowerCase() === normalized
          );
          if (matched) {
            tagCounts[matched]++;
          }
        }
      }
    }
  }

  const tagDistributionData: TagDistributionPoint[] = STANDARD_TAGS.map(
    (name) => ({
      name,
      count: tagCounts[name] || 0,
    })
  );

  // --- Analytics: Widget 3: Investors Going Quiet ---
  const latestInteractionByContact = new Map<string, string>();
  for (const item of allInteractions) {
    if (!latestInteractionByContact.has(item.contact_id)) {
      latestInteractionByContact.set(item.contact_id, item.created_at);
    }
  }

  const quietInvestors: QuietInvestorItem[] = contacts
    .filter((contact) =>
      Boolean(
        Array.isArray(contact.tags) &&
          contact.tags.some((tag: string) => isInvestorTag(tag))
      )
    )
    .map((investor) => {
      const lastContactIso = latestInteractionByContact.get(investor.id) ?? null;
      let daysAgo: number | null = null;
      if (lastContactIso) {
        const lastDate = new Date(lastContactIso);
        if (!isNaN(lastDate.getTime())) {
          const diffMs = now.getTime() - lastDate.getTime();
          daysAgo = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
        }
      }
      return {
        id: investor.id,
        name: investor.name,
        daysAgo,
        lastContactIso,
      };
    });

  return (
    <div className="flex min-h-0 flex-col p-4 sm:p-6 lg:p-8">
      {/* Greeting Banner */}
      <div className="rounded-xl border bg-card p-5 shadow-sm sm:flex sm:items-center sm:justify-between sm:p-6">
        <div>
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Dashboard
          </span>
          <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">
            {greeting}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Overview of your investor pipeline and latest follow-ups.
          </p>
        </div>
        <div className="mt-4 flex items-center gap-3 sm:mt-0">
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <Calendar className="size-3.5" />
            <span>{bannerDate}</span>
          </div>
          <Link
            href="/investors"
            className="inline-flex h-8 items-center justify-center rounded-lg border border-input bg-background px-3 text-xs font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            View All Investors
          </Link>
          <SendTestReminderButton />
        </div>
      </div>

      {/* 5 Summary Cards */}
      <div className="mt-6 grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={cn(
                "flex flex-col justify-between rounded-lg border bg-background p-4 shadow-sm transition-colors",
                card.highlight && "border-destructive/40 bg-destructive/5"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  {card.label}
                </span>
                <Icon
                  className={cn(
                    "h-4 w-4 text-muted-foreground",
                    card.highlight && "text-destructive"
                  )}
                />
              </div>
              <div className="mt-2">
                <p
                  className={cn(
                    "text-2xl font-semibold tracking-tight",
                    card.highlight && "text-destructive"
                  )}
                >
                  {card.value}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {card.subtext}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Sections: Upcoming Follow-ups & Recent Activity */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Section 1: Upcoming Follow-ups */}
        <div className="flex flex-col rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between border-b pb-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-card-foreground">
                Upcoming Follow-ups
              </h2>
            </div>
            <Link
              href="/investors"
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Manage &rarr;
            </Link>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            {upcomingFollowUps.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No pending follow-ups scheduled.
              </div>
            ) : (
              upcomingFollowUps.map((item) => {
                const contact = contactsMap.get(item.contact_id);
                const contactName = contact?.name ?? "Unknown Contact";
                const isInvestor = contact?.isInvestor ?? false;
                const isOverdue = item.due_date && item.due_date < todayStr;
                const isToday = item.due_date === todayStr;

                const CardContent = (
                  <div
                    className={cn(
                      "flex flex-col gap-1.5 rounded-lg border bg-background p-3.5 transition-colors",
                      isInvestor &&
                        "cursor-pointer hover:border-foreground/20 hover:bg-muted/30",
                      isOverdue && "border-destructive/30"
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate font-medium text-sm text-foreground">
                          {contactName}
                        </span>
                        {isInvestor && (
                          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                            Investor
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-medium",
                            isOverdue && "bg-destructive/10 text-destructive",
                            isToday &&
                              "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                            !isOverdue &&
                              !isToday &&
                              "bg-secondary text-secondary-foreground"
                          )}
                        >
                          {isOverdue
                            ? `Overdue (${formatDueDate(item.due_date)})`
                            : isToday
                              ? "Due Today"
                              : formatDueDate(item.due_date)}
                        </span>
                        {isInvestor && (
                          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {item.message || "No follow-up message provided."}
                    </p>
                  </div>
                );

                return isInvestor ? (
                  <Link
                    key={item.id}
                    href={`/investors/${item.contact_id}`}
                    className="block focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-lg"
                  >
                    {CardContent}
                  </Link>
                ) : (
                  <div key={item.id}>{CardContent}</div>
                );
              })
            )}
          </div>
        </div>

        {/* Section 2: Recent Activity */}
        <div className="flex flex-col rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between border-b pb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-card-foreground">
                Recent Activity
              </h2>
            </div>
            <span className="text-xs text-muted-foreground">
              Latest touchpoints
            </span>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            {latestInteractions.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No activity recorded yet.
              </div>
            ) : (
              latestInteractions.map((interaction) => {
                const contact = contactsMap.get(interaction.contact_id);
                const contactName = contact?.name ?? "Unknown Contact";
                const isInvestor = contact?.isInvestor ?? false;
                const isMeeting = interaction.type === "meeting";

                return (
                  <div
                    key={interaction.id}
                    className="flex flex-col gap-1.5 rounded-lg border bg-background p-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {isInvestor ? (
                          <Link
                            href={`/investors/${interaction.contact_id}`}
                            className="truncate font-medium text-sm text-foreground hover:underline"
                          >
                            {contactName}
                          </Link>
                        ) : (
                          <span className="truncate font-medium text-sm text-foreground">
                            {contactName}
                          </span>
                        )}

                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                            isMeeting
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          )}
                        >
                          {isMeeting ? "Meeting" : "Follow-up Completed"}
                        </span>
                      </div>

                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatActivityDate(interaction.created_at)}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground whitespace-pre-line line-clamp-3">
                      {interaction.note || "No note recorded."}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Section 3: Analytics */}
      <div className="mt-8 flex flex-col gap-4">
        <div className="flex flex-col gap-1 border-t pt-6">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Analytics
          </span>
          <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            Pipeline & Engagement Insights
          </h2>
          <p className="text-xs text-muted-foreground">
            Follow-up completion trends, contact tag segmentation, and investor engagement health.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {/* Widget 1: Follow-up Completion Trend */}
          <div className="min-w-0 rounded-xl border bg-card p-5 shadow-sm">
            <FollowUpTrendChart data={followUpTrendData} />
          </div>

          {/* Widget 2: Tag Distribution */}
          <div className="min-w-0 rounded-xl border bg-card p-5 shadow-sm">
            <TagDistributionChart data={tagDistributionData} />
          </div>

          {/* Widget 3: Investors Going Quiet */}
          <div className="min-w-0 rounded-xl border bg-card p-5 shadow-sm lg:col-span-2 xl:col-span-1">
            <InvestorsGoingQuietList investors={quietInvestors} />
          </div>
        </div>
      </div>
    </div>
  );
}
