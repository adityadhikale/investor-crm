"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import { InvestorTrackingTable, type InvestorTrackingRow } from "@/components/investor-tracking-table";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildSearchIndex, searchContacts } from "@/lib/contact-search";
import { getPageRange, getTotalPages, PAGE_SIZE } from "@/lib/pagination";
import { useAllRows } from "@/lib/use-all-rows";

// Kept for the whole browser session, so coming back to Investors is instant.
const investorsCache: { rows: InvestorTrackingRow[] | null } = { rows: null };

/**
 * The Investors list: search box, table and paging. Once all investors are
 * loaded, search and paging run in the browser and update on every keystroke;
 * until then (or if loading fails) the server's page is shown.
 */
export function InvestorsExplorer({
  serverRows,
  serverTotal,
  unreadCounts,
  initialSearch,
  initialPage,
}: {
  serverRows: InvestorTrackingRow[];
  serverTotal: number;
  unreadCounts: Record<string, number>;
  initialSearch: string;
  initialPage: number;
}) {
  const [search, setSearch] = useState(initialSearch);
  const [page, setPage] = useState(initialPage);
  const deferredSearch = useDeferredValue(search);

  const allRows = useAllRows<InvestorTrackingRow>("/api/investors/index", "investors", investorsCache, serverRows);
  const serverIndex = useMemo(() => buildSearchIndex(serverRows), [serverRows]);
  const fullIndex = useMemo(() => (allRows ? buildSearchIndex(allRows) : null), [allRows]);

  const view = useMemo(() => {
    const trimmed = deferredSearch.trim();
    if (fullIndex) {
      const matches = searchContacts(fullIndex, trimmed, [], "name");
      const totalPages = getTotalPages(matches.length);
      const currentPage = Math.min(page, totalPages);
      const { from, to } = getPageRange(currentPage);
      return { rows: matches.slice(from, to + 1), total: matches.length, page: currentPage };
    }
    // Not loaded yet: filter the page the server sent.
    if (!trimmed) return { rows: serverRows, total: serverTotal, page: initialPage };
    const matches = searchContacts(serverIndex, trimmed, [], "name");
    return { rows: matches, total: matches.length, page: 1 };
  }, [deferredSearch, page, fullIndex, serverRows, serverIndex, serverTotal, initialPage]);

  // Keep the address bar in step without a server round trip.
  useEffect(() => {
    const params = new URLSearchParams();
    if (deferredSearch.trim()) params.set("search", deferredSearch.trim());
    if (view.page > 1) params.set("page", String(view.page));
    const query = params.toString();
    window.history.replaceState(window.history.state, "", query ? `?${query}` : window.location.pathname);
  }, [deferredSearch, view.page]);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  return (
    <>
      <div className="relative mt-3 max-w-md">
        <Input
          value={search}
          onChange={(event) => handleSearchChange(event.target.value)}
          placeholder="Search by name, phone, or email..."
          aria-label="Search by name, phone, or email"
          className="h-10 pr-9"
        />
        {search && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => handleSearchChange("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col">
        <InvestorTrackingTable investors={view.rows} unreadCounts={unreadCounts} />
        <PaginationControls
          page={view.page}
          totalCount={view.total}
          pageSize={PAGE_SIZE}
          itemLabel="investors"
          onPageChange={setPage}
        />
      </div>
    </>
  );
}
