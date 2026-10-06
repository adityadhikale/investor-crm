"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Folder,
  TrendingUp,
  Megaphone,
  FileText,
  Tag as TagIcon,
  ChevronDown,
  MessageCircle,
} from "lucide-react";
import { useSidebar } from "@/components/sidebar-provider";
import { TAG_OPTIONS } from "@/lib/tags";
import { getUnreadConversationCount } from "@/app/unread-messages/actions";
import { UNREAD_CHANGED_EVENT } from "@/lib/unread-events";
import { startVisibleInterval } from "@/lib/visible-interval";
import { isPublicPath } from "@/lib/public-routes";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/unread-messages", label: "Unread Messages", icon: MessageCircle },
  { href: "/groups", label: "Groups", icon: Folder },
  { href: "/investors", label: "Investors", icon: TrendingUp },
  { href: "/broadcasts", label: "Broadcasts", icon: Megaphone },
  { href: "/templates", label: "Templates", icon: FileText },
];

function tagHref(tag: string) {
  return `/contacts?tags=${encodeURIComponent(tag)}`;
}

export function AppSidebar() {
  const pathname = usePathname();
  const { isOpen, setIsOpen, close } = useSidebar();
  const [tagsOpen, setTagsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (isPublicPath(pathname)) return;

    let cancelled = false;
    function refreshUnreadCount() {
      getUnreadConversationCount()
        .then((count) => {
          if (!cancelled) setUnreadCount(count);
        })
        .catch(() => {});
    }

    refreshUnreadCount();
    const stopPolling = startVisibleInterval(refreshUnreadCount, 60_000);
    window.addEventListener(UNREAD_CHANGED_EVENT, refreshUnreadCount);

    return () => {
      cancelled = true;
      stopPolling();
      window.removeEventListener(UNREAD_CHANGED_EVENT, refreshUnreadCount);
    };
  }, [pathname]);

  useEffect(() => {
    close();
  }, [pathname, close]);

  useEffect(() => {
    function handleResize() {
      if (window.innerWidth >= 1024) {
        close();
      }
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [close]);

  if (isPublicPath(pathname)) {
    return null;
  }

  const renderNavLinks = (isMobile = false) => (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={isMobile ? close : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {item.href === "/unread-messages" && unreadCount > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
        );
      })}

      <button
        type="button"
        onClick={() => setTagsOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <TagIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-left">Tags</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform",
            tagsOpen && "rotate-180"
          )}
        />
      </button>

      {tagsOpen && (
        <div className="ml-3 flex flex-col gap-1 border-l pl-3">
          {TAG_OPTIONS.map((tag) => {
            const isActive = false;
            return (
              <Link
                key={tag}
                href={tagHref(tag)}
                onClick={isMobile ? close : undefined}
                className={cn(
                  "truncate rounded-md px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {tag}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar (1024px and above) */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col overflow-y-auto border-r bg-card p-4">
        <div className="mb-4 text-lg font-semibold font-heading">Investor CRM</div>
        {renderNavLinks(false)}
        <div className="flex-1" />
      </aside>

      {/* Tablet & Mobile Drawer (below 1024px) */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side="left" className="flex w-72 flex-col overflow-y-auto p-4">
          <SheetHeader className="p-0 text-left">
            <SheetTitle className="text-lg font-semibold font-heading">Investor CRM</SheetTitle>
            <SheetDescription className="sr-only">Main navigation menu</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {renderNavLinks(true)}
          </div>
          <div className="flex-1" />
        </SheetContent>
      </Sheet>
    </>
  );
}
