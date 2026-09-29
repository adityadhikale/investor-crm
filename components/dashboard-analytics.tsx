"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { ArrowUpRight, ArrowUpDown, Clock, Tag as TagIcon, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { TAG_COLORS } from "@/lib/tags";

const emptySubscribe = () => () => {};

function useIsMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

// --- Types ---

export type FollowUpTrendPoint = {
  week: string;
  created: number;
  completed: number;
};

export type TagDistributionPoint = {
  name: string;
  count: number;
};

export type QuietInvestorItem = {
  id: string;
  name: string;
  daysAgo: number | null;
  lastContactIso: string | null;
};

// --- Custom Tooltip for Trend Chart ---

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border bg-popover p-2.5 text-xs shadow-md text-popover-foreground">
      <p className="font-semibold text-foreground mb-1">Week of {label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center justify-between gap-3 py-0.5">
          <div className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}:</span>
          </div>
          <span className="font-medium text-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

// --- Custom Tooltip for Tag Distribution ---

function TagTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { name: string; count: number } }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0];

  return (
    <div className="rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-md text-popover-foreground">
      <span className="font-semibold text-foreground">{data.name}: </span>
      <span className="text-muted-foreground">{data.value} contacts</span>
    </div>
  );
}

// --- WIDGET 1: Follow-up Completion Trend Chart ---

export function FollowUpTrendChart({ data }: { data: FollowUpTrendPoint[] }) {
  const mounted = useIsMounted();

  if (!mounted) {
    return <div className="h-64 w-full animate-pulse rounded-lg bg-muted/20" />;
  }

  const hasData = data.some((d) => d.created > 0 || d.completed > 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-card-foreground">
            Follow-up Trend
          </h2>
        </div>
        <span className="text-xs text-muted-foreground">Last 8 weeks</span>
      </div>

      <div className="mt-4 flex-1">
        {!hasData ? (
          <div className="flex h-60 flex-col items-center justify-center text-center text-xs text-muted-foreground">
            No follow-ups recorded in the past 8 weeks.
          </div>
        ) : (
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                barGap={4}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--border)"
                  opacity={0.5}
                />
                <XAxis
                  dataKey="week"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                />
                <Tooltip content={<TrendTooltip />} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{
                    fontSize: "11px",
                    paddingBottom: "10px",
                  }}
                />
                <Bar
                  dataKey="created"
                  name="Created"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={22}
                />
                <Bar
                  dataKey="completed"
                  name="Completed"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={22}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

// --- WIDGET 2: Tag Distribution Chart ---


export function TagDistributionChart({ data }: { data: TagDistributionPoint[] }) {
  const mounted = useIsMounted();

  const totalContacts = data.reduce((sum, item) => sum + item.count, 0);

  if (!mounted) {
    return <div className="h-64 w-full animate-pulse rounded-lg bg-muted/20" />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <TagIcon className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-card-foreground">
            Tag Distribution
          </h2>
        </div>
        <span className="text-xs text-muted-foreground">Standard tags</span>
      </div>

      <div className="mt-4 flex-1">
        {totalContacts === 0 ? (
          <div className="flex h-60 flex-col items-center justify-center text-center text-xs text-muted-foreground">
            No contacts tagged with standard categories.
          </div>
        ) : (
          <div className="flex min-h-60 flex-col sm:flex-row xl:flex-col items-center justify-between gap-4">
            <div className="h-48 w-48 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip content={<TagTooltip />} />
                  <Pie
                    data={data.filter((d) => d.count > 0)}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={46}
                    outerRadius={70}
                    paddingAngle={3}
                    cornerRadius={4}
                  >
                    {data
                      .filter((d) => d.count > 0)
                      .map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={TAG_COLORS[entry.name] || "#94a3b8"}
                        />
                      ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 w-full">
              {data.map((item) => {
                const color = TAG_COLORS[item.name] || "#94a3b8";
                const percentage = totalContacts
                  ? Math.round((item.count / totalContacts) * 100)
                  : 0;
                return (
                  <div
                    key={item.name}
                    className="flex items-center justify-between gap-2 text-xs rounded-md px-2 py-1 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex min-w-[4.5rem] items-center gap-2">
                      <span
                        className="size-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="truncate font-medium text-foreground">
                        {item.name}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 whitespace-nowrap text-muted-foreground">
                      <span>{item.count}</span>
                      <span className="w-8 text-right text-[11px] opacity-70">
                        {percentage}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- WIDGET 3: Investors Going Quiet (Sortable List) ---

function formatQuietDate(isoString: string | null): string {
  if (!isoString) return "Never contacted";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function InvestorsGoingQuietList({
  investors,
}: {
  investors: QuietInvestorItem[];
}) {
  // Sort order: 'longest' (default) vs 'shortest'
  const [sortOrder, setSortOrder] = useState<"longest" | "shortest">("longest");

  const sortedInvestors = [...investors].sort((a, b) => {
    if (sortOrder === "longest") {
      // No interactions (null) first
      if (a.daysAgo === null && b.daysAgo === null) return a.name.localeCompare(b.name);
      if (a.daysAgo === null) return -1;
      if (b.daysAgo === null) return 1;
      if (b.daysAgo !== a.daysAgo) return b.daysAgo - a.daysAgo;
      return a.name.localeCompare(b.name);
    } else {
      // Shortest first, null at the end
      if (a.daysAgo === null && b.daysAgo === null) return a.name.localeCompare(b.name);
      if (a.daysAgo === null) return 1;
      if (b.daysAgo === null) return -1;
      if (a.daysAgo !== b.daysAgo) return a.daysAgo - b.daysAgo;
      return a.name.localeCompare(b.name);
    }
  });

  const top5 = sortedInvestors.slice(0, 5);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-card-foreground">
            Investors Going Quiet
          </h2>
        </div>
        <button
          type="button"
          onClick={() =>
            setSortOrder((prev) => (prev === "longest" ? "shortest" : "longest"))
          }
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          title="Click to toggle sorting"
        >
          <ArrowUpDown className="size-3" />
          <span>{sortOrder === "longest" ? "Longest first" : "Shortest first"}</span>
        </button>
      </div>

      <div className="mt-4 flex flex-1 flex-col gap-2.5">
        {top5.length === 0 ? (
          <div className="flex h-60 flex-col items-center justify-center py-12 text-center text-xs text-muted-foreground">
            No tagged investors found in database.
          </div>
        ) : (
          top5.map((investor) => {
            const hasInteractions = investor.daysAgo !== null;
            const days = investor.daysAgo;
            const isQuietOver30 = days !== null && days >= 30;

            const badgeText =
              days === null
                ? "No interactions yet"
                : days === 0
                ? "Contacted today"
                : days === 1
                ? "1 day ago"
                : `${days} days ago`;

            return (
              <Link
                key={investor.id}
                href={`/investors/${investor.id}`}
                className="group block rounded-lg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <div
                  className={cn(
                    "flex flex-col gap-1 rounded-lg border bg-background p-3 transition-colors group-hover:border-foreground/20 group-hover:bg-muted/30",
                    days === null && "border-amber-500/20 bg-amber-500/[0.02]",
                    isQuietOver30 && "border-destructive/30"
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate font-medium text-sm text-foreground">
                        {investor.name}
                      </span>
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        Investor
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-medium",
                          days === null &&
                            "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                          isQuietOver30 &&
                            "bg-destructive/10 text-destructive",
                          hasInteractions &&
                            !isQuietOver30 &&
                            "bg-secondary text-secondary-foreground"
                        )}
                      >
                        {badgeText}
                      </span>
                      <ArrowUpRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    {hasInteractions
                      ? `Last contact: ${formatQuietDate(investor.lastContactIso)}`
                      : "Never contacted — needs outreach"}
                  </p>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
