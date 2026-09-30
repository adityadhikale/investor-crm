"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, User } from "lucide-react";
import { createClient } from "@/src/lib/supabase/client";
import { NotificationBell } from "@/components/notification-bell";
import { useSidebar } from "@/components/sidebar-provider";
import { cn } from "@/lib/utils";

import { getUserDisplayName, getUserInitials } from "@/lib/user";

function getInitialsFromUser(user: {
  email?: string;
  user_metadata?: Record<string, unknown>;
} | null): string {
  if (!user) return "";
  const displayName = getUserDisplayName(user);
  return getUserInitials(displayName);
}

export function TopNav() {
  const pathname = usePathname();
  const [initials, setInitials] = useState<string | null>(null);
  const { toggle } = useSidebar();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setInitials(getInitialsFromUser(data.user));
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setInitials(getInitialsFromUser(session.user));
      } else {
        setInitials(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (pathname === "/login") {
    return null;
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background text-foreground transition-colors hover:bg-accent hover:text-accent-foreground lg:hidden cursor-pointer"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span
          className="text-3xl text-foreground tracking-wide select-none"
          style={{ fontFamily: "var(--font-maharlika), var(--font-playfair), 'Playfair Display', Georgia, serif", fontWeight: 400 }}
        >
          CREST
        </span>
      </div>
      <div className="flex items-center gap-2">
        <NotificationBell />
        <Link
          href="/my-profile"
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
            initials
              ? "bg-primary/10 text-xs font-semibold text-primary hover:bg-accent hover:text-accent-foreground"
              : "bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
          title="My Profile"
        >
          {initials ? initials : <User className="h-4 w-4" />}
        </Link>
      </div>
    </header>
  );
}
