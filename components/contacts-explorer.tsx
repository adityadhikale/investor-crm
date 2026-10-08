"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import type { ContactRow } from "@/components/contact-details-dialog";
import { ContactsTable } from "@/components/contacts-table";
import { PaginationControls } from "@/components/pagination-controls";
import { TagFilter } from "@/components/tag-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildSearchIndex, searchContacts } from "@/lib/contact-search";
import { getPageRange, getTotalPages, PAGE_SIZE } from "@/lib/pagination";
import { useAllRows } from "@/lib/use-all-rows";

// Kept for the whole browser session, so coming back to Contacts is instant.
const contactsCache: { rows: ContactRow[] | null } = { rows: null };

/**
 * The Contacts list: search box, tag filter, table and paging. Once all
 * contacts are loaded, search/filter/paging run in the browser and update on
 * every keystroke; until then (or if loading fails) the server's page is shown.
 */
export function ContactsExplorer({
  serverContacts,
  serverFilteredCount,
  unreadCounts,
  initialSearch,
  initialTags,
  initialPage,
}: {
  serverContacts: ContactRow[];
  serverFilteredCount: number;
  unreadCounts: Record<string, number>;
  initialSearch: string;
  initialTags: string[];
  initialPage: number;
}) {
  const [search, setSearch] = useState(initialSearch);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [page, setPage] = useState(initialPage);
  const deferredSearch = useDeferredValue(search);

  const allContacts = useAllRows<ContactRow>("/api/contacts/index", "contacts", contactsCache, serverContacts);
  const serverIndex = useMemo(() => buildSearchIndex(serverContacts), [serverContacts]);
  const fullIndex = useMemo(() => (allContacts ? buildSearchIndex(allContacts) : null), [allContacts]);

  const view = useMemo(() => {
    const trimmed = deferredSearch.trim();
    if (fullIndex) {
      const matches = searchContacts(fullIndex, trimmed, tags);
      const totalPages = getTotalPages(matches.length);
      const currentPage = Math.min(page, totalPages);
      const { from, to } = getPageRange(currentPage);
      return { rows: matches.slice(from, to + 1), total: matches.length, page: currentPage };
    }
    // Not loaded yet: filter the page the server sent.
    const unchanged = !trimmed && tags.join(",") === initialTags.join(",");
    if (unchanged) return { rows: serverContacts, total: serverFilteredCount, page: initialPage };
    const matches = searchContacts(serverIndex, trimmed, tags);
    return { rows: matches, total: matches.length, page: 1 };
  }, [deferredSearch, tags, page, fullIndex, serverContacts, serverIndex, serverFilteredCount, initialPage, initialTags]);

  // Keep the address bar in step (so a refresh or shared link shows the same view) without a server round trip.
  useEffect(() => {
    const params = new URLSearchParams();
    if (deferredSearch.trim()) params.set("search", deferredSearch.trim());
    if (tags.length > 0) params.set("tags", tags.join(","));
    if (view.page > 1) params.set("page", String(view.page));
    const query = params.toString();
    window.history.replaceState(window.history.state, "", query ? `?${query}` : window.location.pathname);
  }, [deferredSearch, tags, view.page]);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleTagsChange(next: string[]) {
    setTags(next);
    setPage(1);
  }

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2.5 sm:gap-3">
        <div className="relative w-full max-w-md sm:w-80">
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
        <TagFilter selectedTags={tags} onTagsChange={handleTagsChange} />
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col">
        <ContactsTable
          key={`${deferredSearch.trim()}-${tags.join(",")}-${view.page}`}
          contacts={view.rows}
          unreadCounts={unreadCounts}
          search={deferredSearch.trim()}
        />
        <PaginationControls
          page={view.page}
          totalCount={view.total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      </div>
    </>
  );
}
