import type { Metadata } from "next";
import { requireAuthFast } from "@/lib/auth";
import { AddContactDialog } from "@/components/add-contact-dialog";
import type { ContactRow } from "@/components/contact-details-dialog";
import { ImportContactsDialog } from "@/components/import-contacts-dialog";
import { ContactsExplorer } from "@/components/contacts-explorer";
import { getPageRange, getTotalPages, parsePage } from "@/lib/pagination";
import { getUnreadCountsByContact } from "@/lib/unread";
import { ilikeAnyFilter } from "@/lib/postgrest-filter";
import { INVESTOR_TAGS } from "@/lib/tags";

export const metadata: Metadata = {
  title: "Contacts",
};

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; tags?: string; page?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const search = resolvedSearchParams.search?.trim() ?? "";
  const tagsParam = resolvedSearchParams.tags?.trim() ?? "";
  const selectedTags = tagsParam
    ? tagsParam.split(",").map((t) => t.trim()).filter(Boolean)
    : [];
  const requestedPage = parsePage(resolvedSearchParams.page);

  const { supabase } = await requireAuthFast();

  const searchFilter = ilikeAnyFilter(["name", "phone", "email"], search);

  function buildFilteredCountQuery() {
    let query = supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null);

    if (search) query = query.or(searchFilter);
    if (selectedTags.length > 0) query = query.overlaps("tags", selectedTags);

    return query;
  }

  function buildContactsQuery(withLastMessage: boolean) {
    let query = supabase
      .from("contacts")
      .select(
        withLastMessage
          ? "id, name, phone, email, tags, date_saved, notes, last_message_at, last_message_text, last_message_direction, contact_groups(groups(id, name))"
          : "id, name, phone, email, tags, date_saved, notes, contact_groups(groups(id, name))"
      )
      .is("deleted_at", null);

    if (search) query = query.or(searchFilter);
    if (selectedTags.length > 0) query = query.overlaps("tags", selectedTags);

    return query;
  }

  let contacts: ContactRow[] = [];
  let filteredCount = 0;
  let page = requestedPage;
  let totalContacts = 0;
  let investors = 0;
  let taggedContacts = 0;
  let totalGroups = 0;
  let unreadCounts: Record<string, number> = {};
  let loadError: string | null = null;

  try {
    const [filtered, total, investorCount, taggedCount, groupCount, unread] = await Promise.all([
      buildFilteredCountQuery(),
      supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null),
      supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .overlaps("tags", INVESTOR_TAGS),
      supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .neq("tags", "{}"),
      supabase.from("groups").select("id", { count: "exact", head: true }),
      getUnreadCountsByContact(supabase),
    ]);
    unreadCounts = unread;

    const countError = [filtered, total, investorCount, taggedCount, groupCount].find(
      (result) => result.error
    )?.error;
    if (countError) throw new Error(countError.message);

    filteredCount = filtered.count ?? 0;
    totalContacts = total.count ?? 0;
    investors = investorCount.count ?? 0;
    taggedContacts = taggedCount.count ?? 0;
    totalGroups = groupCount.count ?? 0;

    // Clamp so a stale or hand-typed ?page=999 shows the last page instead of erroring.
    page = Math.min(requestedPage, getTotalPages(filteredCount));
    const { from, to } = getPageRange(page);

    // Most recent chat first, like WhatsApp; "id" is a tie-breaker so rows
    // never shuffle between pages. Until the chat-list migration is run the
    // last-message columns don't exist, so fall back to the old order.
    let result = await buildContactsQuery(true)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("date_saved", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to);
    if (result.error && /last_message/i.test(result.error.message)) {
      result = await buildContactsQuery(false)
        .order("date_saved", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);
    }

    if (result.error) throw new Error(result.error.message);
    contacts = (result.data ?? []) as unknown as ContactRow[];
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Contacts could not be loaded.";
  }

  if (loadError) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-semibold">Contacts</h1>
        <p className="mt-2 text-destructive">
          Error loading contacts: {loadError}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Contacts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage and search your contacts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ImportContactsDialog />
          <AddContactDialog />
        </div>
      </div>

      {/* Overview */}
      <div className="mt-3 grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Total Contacts", value: totalContacts },
          { label: "Investors", value: investors },
          { label: "Tagged Contacts", value: taggedContacts },
          { label: "Groups", value: totalGroups },
        ].map((metric) => (
          <div
            key={metric.label}
            className="flex h-18 flex-col justify-center rounded-lg border bg-background px-4 py-3"
          >
            <p className="text-2xl font-semibold tracking-tight">
              {metric.value}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {metric.label}
            </p>
          </div>
        ))}
      </div>

      {/* Search, tag filter, table and paging (instant once all contacts are loaded) */}
      <ContactsExplorer
        // A new address from outside the list (a sidebar tag link, back/forward)
        // restarts it with that search, tags and page.
        key={`${search}|${tagsParam}|${page}`}
        serverContacts={contacts}
        serverFilteredCount={filteredCount}
        unreadCounts={unreadCounts}
        initialSearch={search}
        initialTags={selectedTags}
        initialPage={page}
      />
    </div>
  );
}
