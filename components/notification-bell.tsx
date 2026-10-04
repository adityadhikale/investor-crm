"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Bell, CalendarClock, Megaphone, MessageCircle, X } from "lucide-react";

import {
  getNotifications,
  type NotificationItem,
} from "@/app/notifications/actions";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { UNREAD_CHANGED_EVENT } from "@/lib/unread-events";
import { startVisibleInterval } from "@/lib/visible-interval";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 60_000;

const KIND_ICONS = {
  message: MessageCircle,
  followup: CalendarClock,
  broadcast: Megaphone,
} as const;

const DISMISSED_KEY = "crm:dismissed-notifications";
const MAX_REMEMBERED = 300;

/**
 * Dismissals are remembered on this device. The key includes the item's last
 * activity time, so a new message from the same person shows up again.
 */
function dismissKey(item: NotificationItem) {
  return `${item.id}@${item.at}`;
}

function loadDismissed(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DISMISSED_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function saveDismissed(keys: string[]) {
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(keys.slice(-MAX_REMEMBERED)));
  } catch {
    // Storage can be unavailable (private window); dismissals then last until reload.
  }
}

function formatTime(at: string) {
  const date = new Date(at);
  if (isNaN(date.getTime())) return "";
  return formatDistanceToNow(date, { addSuffix: true });
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [badgeCount, setBadgeCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  // Nothing is shown until the first fetch, so reading storage here is safe.
  const [dismissed, setDismissed] = useState<string[]>(() =>
    typeof window === "undefined" ? [] : loadDismissed()
  );

  function dismiss(keys: string[]) {
    setDismissed((current) => {
      const next = [...new Set([...current, ...keys])];
      saveDismissed(next);
      return next;
    });
  }

  const visibleItems = items.filter((item) => !dismissed.includes(dismissKey(item)));
  // Dismissed items that counted towards the red number (broadcasts never do).
  const dismissedCounted = items.filter(
    (item) => item.kind !== "broadcast" && dismissed.includes(dismissKey(item))
  ).length;
  const shownBadge = Math.max(0, badgeCount - dismissedCounted);

  const refresh = useCallback(() => {
    getNotifications()
      .then((result) => {
        setItems(result.items);
        setBadgeCount(result.badgeCount);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    refresh();
    const stopPolling = startVisibleInterval(refresh, POLL_INTERVAL_MS);
    window.addEventListener(UNREAD_CHANGED_EVENT, refresh);

    return () => {
      stopPolling();
      window.removeEventListener(UNREAD_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) refresh();
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={
              shownBadge > 0
                ? `Notifications, ${shownBadge} need attention`
                : "Notifications"
            }
            className="relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          />
        }
      >
        <Bell className="h-4 w-4" />
        {shownBadge > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white">
            {shownBadge > 99 ? "99+" : shownBadge}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] gap-0 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">Notifications</span>
          <div className="flex items-center gap-3">
            {shownBadge > 0 && (
              <span className="text-xs text-muted-foreground">
                {shownBadge} need{shownBadge === 1 ? "s" : ""} attention
              </span>
            )}
            {visibleItems.length > 0 && (
              <button
                type="button"
                onClick={() => dismiss(visibleItems.map(dismissKey))}
                className="cursor-pointer text-xs font-medium text-primary hover:underline"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {visibleItems.length ? (
            <ul>
              {visibleItems.map((item) => {
                const Icon = KIND_ICONS[item.kind];
                return (
                  <li key={item.id} className="group relative border-b last:border-b-0">
                    <Link
                      href={item.href}
                      onClick={() => {
                        // Opening a notification clears it.
                        dismiss([dismissKey(item)]);
                        setOpen(false);
                      }}
                      className="flex gap-3 px-4 py-3 pr-9 transition-colors hover:bg-muted/50"
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground",
                          item.urgent && "bg-destructive/10 text-destructive"
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {item.title}
                        </span>
                        <span className="line-clamp-2 break-words text-xs text-muted-foreground">
                          {item.description}
                        </span>
                        <span className="mt-1 block text-[11px] text-muted-foreground/80">
                          {formatTime(item.at)}
                        </span>
                      </span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => dismiss([dismissKey(item)])}
                      aria-label="Dismiss notification"
                      title="Dismiss"
                      className="absolute right-2 top-2.5 flex size-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              {loaded ? "You're all caught up." : "Loading..."}
            </p>
          )}
        </div>

        <div className="border-t px-4 py-2.5">
          <Link
            href="/unread-messages"
            onClick={() => setOpen(false)}
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            View all unread messages
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
