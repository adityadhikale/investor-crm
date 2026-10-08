import type { Metadata } from "next";
import { requireAuthFast } from "@/lib/auth";
import { InvestorsExplorer } from "@/components/investors-explorer";
import type { ContactRow } from "@/components/contact-details-dialog";
import type { InvestorTrackingRow } from "@/components/investor-tracking-table";
import { INVESTOR_TAGS } from "@/lib/tags";
import { fetchAllPages } from "@/lib/supabase-pagination";
import { getPageRange, getTotalPages, parsePage } from "@/lib/pagination";
import { ilikeAnyFilter } from "@/lib/postgrest-filter";
import { getUnreadCountsByContact } from "@/lib/unread";

export const metadata: Metadata = {
  title: "Investors",
};

type InteractionRow = {
  contact_id: string;
  created_at: string;
};

type FollowUpRow = {
  contact_id: string;
  due_date: string;
};

export default async function InvestorsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const search = resolvedSearchParams.search?.trim() ?? "";
  const requestedPage = parsePage(resolvedSearchParams.page);

  const { supabase } = await requireAuthFast();

  let contacts: ContactRow[] = [];
  let interactions: InteractionRow[] = [];
  let followUps: FollowUpRow[] = [];
  let unreadCounts: Record<string, number> = {};
  let totalCount = 0;
  let page = requestedPage;
  let loadError: string | null = null;

  try {
    const searchFilter = ilikeAnyFilter(["name", "phone", "email"], search);

    let countQuery = supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .overlaps("tags", INVESTOR_TAGS)
      .is("deleted_at", null);
    if (search) countQuery = countQuery.or(searchFilter);

    const { count, error: countError } = await countQuery;
    if (countError) throw new Error(countError.message);

    totalCount = count ?? 0;
    // Clamp so a stale or hand-typed ?page=999 shows the last page instead of erroring.
    page = Math.min(requestedPage, getTotalPages(totalCount));
    const { from, to } = getPageRange(page);

    const buildContactsQuery = () => {
      let query = supabase
        .from("contacts")
        .select("id, name, phone, email, tags, date_saved, notes, contact_groups(groups(id, name))")
        .overlaps("tags", INVESTOR_TAGS)
        .is("deleted_at", null);
      if (search) query = query.or(searchFilter);
      return query;
    };

    // Most recent chat first, like WhatsApp; then A to Z. "id" is a tie-breaker so
    // rows don't shuffle between pages. Until the chat-list migration is run the
    // last-message column doesn't exist, so fall back to A to Z.
    let result = await buildContactsQuery()
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
    if (result.error && /last_message/i.test(result.error.message)) {
      result = await buildContactsQuery()
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
    }
    if (result.error) throw new Error(result.error.message);
    contacts = (result.data ?? []) as unknown as ContactRow[];

    const contactIds = contacts.map((contact) => contact.id);

    if (contactIds.length) {
      [interactions, followUps, unreadCounts] = await Promise.all([
        fetchAllPages<InteractionRow>((from, to) =>
          supabase
            .from("interactions")
            .select("contact_id, created_at")
            .in("contact_id", contactIds)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .range(from, to)
        ),
        fetchAllPages<FollowUpRow>((from, to) =>
          supabase
            .from("follow_ups")
            .select("contact_id, due_date")
            .in("contact_id", contactIds)
            .eq("is_done", false)
            .is("deleted_at", null)
            .order("due_date", { ascending: true })
            .range(from, to)
        ),
        getUnreadCountsByContact(supabase),
      ]);
    }
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Investor tracking data could not be loaded.";
  }

  if (loadError) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-semibold">Investors</h1>
        <p className="mt-2 text-destructive">
          Error loading investors: {loadError}
        </p>
      </div>
    );
  }

  const latestInteractionByContact = new Map<string, InteractionRow>();
  for (const interaction of interactions) {
    if (!latestInteractionByContact.has(interaction.contact_id)) {
      latestInteractionByContact.set(interaction.contact_id, interaction);
    }
  }

  const nextFollowUpByContact = new Map<string, FollowUpRow>();
  for (const followUp of followUps) {
    if (!nextFollowUpByContact.has(followUp.contact_id)) {
      nextFollowUpByContact.set(followUp.contact_id, followUp);
    }
  }

  const rows: InvestorTrackingRow[] = contacts.map((contact) => ({
    ...contact,
    lastInteraction: latestInteractionByContact.get(contact.id)?.created_at ?? null,
    nextFollowUp: nextFollowUpByContact.get(contact.id)?.due_date ?? null,
  }));

  return (
    <div className="flex min-h-0 flex-col p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold">Investor Tracking</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Monitor investor interactions and upcoming follow-ups.
        </p>
      </div>

      {/* Search, table and paging (instant once all investors are loaded) */}
      <InvestorsExplorer
        // A new address from outside the list (back/forward) restarts it with that search and page.
        key={`${search}|${page}`}
        serverRows={rows}
        serverTotal={totalCount}
        unreadCounts={unreadCounts}
        initialSearch={search}
        initialPage={page}
      />
    </div>
  );
}
