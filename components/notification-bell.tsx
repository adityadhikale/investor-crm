"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Bell, CalendarClock, Megaphone, MessageCircle } from "lucide-react";

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
              badgeCount > 0
                ? `Notifications, ${badgeCount} need attention`
                : "Notifications"
            }
            className="relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          />
        }
      >
        <Bell className="h-4 w-4" />
        {badgeCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white">
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] gap-0 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">Notifications</span>
          {badgeCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {badgeCount} need{badgeCount === 1 ? "s" : ""} attention
            </span>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {items.length ? (
            <ul>
              {items.map((item) => {
                const Icon = KIND_ICONS[item.kind];
                return (
                  <li key={item.id} className="border-b last:border-b-0">
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
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
