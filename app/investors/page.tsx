import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth";
import { LiveSearchInput } from "@/components/live-search-input";
import type { ContactRow } from "@/components/contact-details-dialog";
import {
  InvestorTrackingTable,
  type InvestorTrackingRow,
} from "@/components/investor-tracking-table";
import { INVESTOR_TAG } from "@/lib/tags";
import { PaginationControls } from "@/components/pagination-controls";
import { fetchAllPages } from "@/lib/supabase-pagination";
import { getPageRange, getTotalPages, parsePage } from "@/lib/pagination";

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

  const { supabase } = await requireAuth();

  let contacts: ContactRow[] = [];
  let interactions: InteractionRow[] = [];
  let followUps: FollowUpRow[] = [];
  let totalCount = 0;
  let page = requestedPage;
  let loadError: string | null = null;

  try {
    const searchFilter = `name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`;

    let countQuery = supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .contains("tags", [INVESTOR_TAG])
      .is("deleted_at", null);
    if (search) countQuery = countQuery.or(searchFilter);

    const { count, error: countError } = await countQuery;
    if (countError) throw new Error(countError.message);

    totalCount = count ?? 0;
    // Clamp so a stale or hand-typed ?page=999 shows the last page instead of erroring.
    page = Math.min(requestedPage, getTotalPages(totalCount));
    const { from, to } = getPageRange(page);

    let contactsQuery = supabase
      .from("contacts")
      .select("id, name, phone, email, tags, date_saved, notes, contact_groups(groups(id, name))")
      .contains("tags", [INVESTOR_TAG])
      .is("deleted_at", null);
    if (search) contactsQuery = contactsQuery.or(searchFilter);

    // "id" is a tie-breaker so rows sharing a name don't shuffle between pages.
    const { data, error } = await contactsQuery
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw new Error(error.message);
    contacts = (data ?? []) as unknown as ContactRow[];

    const contactIds = contacts.map((contact) => contact.id);

    if (contactIds.length) {
      [interactions, followUps] = await Promise.all([
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

      <LiveSearchInput
        paramName="search"
        placeholder="Search by name, phone, or email..."
      />

      <div className="mt-3 flex min-h-0 flex-1 flex-col">
        <InvestorTrackingTable investors={rows} />
        <PaginationControls page={page} totalCount={totalCount} itemLabel="investors" />
      </div>
    </div>
  );
}
