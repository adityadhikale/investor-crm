"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getTotalPages, PAGE_SIZE } from "@/lib/pagination";

export function PaginationControls({
  page,
  totalCount,
  pageSize = PAGE_SIZE,
  itemLabel = "contacts",
  onPageChange,
}: {
  page: number;
  totalCount: number;
  pageSize?: number;
  itemLabel?: string;
  /** When given, paging happens in the page itself instead of through the URL. */
  onPageChange?: (page: number) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const totalPages = getTotalPages(totalCount, pageSize);
  const firstItem = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalCount);

  function goToPage(nextPage: number) {
    if (onPageChange) {
      onPageChange(Math.max(1, nextPage));
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(nextPage));
    }

    const queryString = params.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname, {
      scroll: false,
    });
  }

  return (
    <div className="mt-3 flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Showing {firstItem.toLocaleString("en-IN")}–{lastItem.toLocaleString("en-IN")} of{" "}
        {totalCount.toLocaleString("en-IN")} {itemLabel}
      </p>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => goToPage(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="size-4" />
          Previous
        </Button>
        <span className="min-w-24 text-center text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => goToPage(page + 1)}
          disabled={page >= totalPages}
        >
          Next
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
