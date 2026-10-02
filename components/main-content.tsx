"use client";

import { usePathname } from "next/navigation";
import { type ReactNode } from "react";

import { isPublicPath } from "@/lib/public-routes";

export function MainContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = isPublicPath(pathname);

  if (isLoginPage) {
    return (
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>
    );
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex min-h-full flex-1 flex-col">
        {children}
        {/* In-flow spacer ensuring ~24px visible blank area below the last card before scroll container ends on mobile */}
        <div className="h-6 shrink-0 sm:hidden" aria-hidden="true" />
      </div>
    </main>
  );
}
