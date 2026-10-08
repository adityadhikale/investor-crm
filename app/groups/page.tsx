import type { Metadata } from "next";
import { AddGroupDialog } from "@/components/add-group-dialog";
import { GroupRow } from "@/components/group-details-dialog";
import { GroupsTable } from "@/components/groups-table";
import { LiveSearchInput } from "@/components/live-search-input";
import { PaginationControls } from "@/components/pagination-controls";
import { normalizeGroupMembers, type GroupContactRelation } from "@/lib/group-members";
import { requireAuthFast } from "@/lib/auth";
import { getPageRange, getTotalPages, parsePage } from "@/lib/pagination";

export const metadata: Metadata = {
  title: "Groups",
};

export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ search?: string; page?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const search = resolvedSearchParams.search?.trim() ?? "";
  const requestedPage = parsePage(resolvedSearchParams.page);
  const { supabase } = await requireAuthFast();

  let countQuery = supabase.from("groups").select("id", { count: "exact", head: true });
  if (search) countQuery = countQuery.ilike("name", `%${search}%`);
  const { count, error: countError } = await countQuery;

  if (countError) {
    return <div className="p-4 sm:p-6 lg:p-8"><h1 className="text-2xl font-semibold">Groups</h1><p className="mt-2 text-destructive">Unable to load groups.</p></div>;
  }

  const totalCount = count ?? 0;
  // Clamp so a stale or hand-typed ?page=999 shows the last page instead of erroring.
  const page = Math.min(requestedPage, getTotalPages(totalCount));
  const { from, to } = getPageRange(page);

  let groupsQuery = supabase.from("groups").select("id, name, created_at, contact_groups(contact_id, contacts(id, name, phone, deleted_at))");
  if (search) groupsQuery = groupsQuery.ilike("name", `%${search}%`);
  const { data, error } = await groupsQuery
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, to);

  if (error) {
    return <div className="p-4 sm:p-6 lg:p-8"><h1 className="text-2xl font-semibold">Groups</h1><p className="mt-2 text-destructive">Unable to load groups.</p></div>;
  }

  const groups = (data ?? []).map((group) => ({
    ...group,
    contact_groups: normalizeGroupMembers(
      group.contact_groups as GroupContactRelation[],
    ),
  })) as GroupRow[];
  return (
    <div className="flex min-h-0 flex-col p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-semibold">Groups</h1><p className="mt-1 text-sm text-muted-foreground">Organize contacts into groups.</p></div><AddGroupDialog /></div>
      <LiveSearchInput paramName="search" placeholder="Search by group name..." />
      <div className="mt-3 flex min-h-0 flex-1 flex-col">
        <GroupsTable key={`${search}-${page}`} groups={groups} search={search} />
        <PaginationControls page={page} totalCount={totalCount} itemLabel="groups" />
      </div>
    </div>
  );
}
