import type { Metadata } from "next";
import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import type { BroadcastData } from "@/app/broadcasts/actions";
import { BroadcastsTable } from "@/components/broadcasts-table";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { getPageRange, getTotalPages, parsePage } from "@/lib/pagination";

export const metadata: Metadata = {
  title: "Broadcasts",
};

export default async function BroadcastsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const requestedPage = parsePage((await searchParams).page);
  const { supabase } = await requireAuth();

  const { count, error: countError } = await supabase
    .from("broadcasts")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);

  const totalCount = count ?? 0;
  // Clamp so a stale or hand-typed ?page=999 shows the last page instead of erroring.
  const page = Math.min(requestedPage, getTotalPages(totalCount));
  const { from, to } = getPageRange(page);

  const broadcastsResult = countError
    ? { data: null, error: countError }
    : await supabase
        .from("broadcasts")
        .select(
          "*"
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);

  if (broadcastsResult.error) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-semibold">Broadcasts</h1>
        <p className="mt-2 text-destructive">Unable to load broadcasts.</p>
      </div>
    );
  }

  const broadcasts = (broadcastsResult.data ?? []) as BroadcastData[];

  return (
    <div className="flex min-h-0 flex-col p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Broadcasts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Compose and track message broadcasts.
          </p>
        </div>
        <Link href="/broadcasts/new">
          <Button className="h-9 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm">
            + New Broadcast
          </Button>
        </Link>
      </div>

      <div className="mt-6 flex min-h-0 flex-1 flex-col">
        <BroadcastsTable key={page} broadcasts={broadcasts} />
        <PaginationControls page={page} totalCount={totalCount} itemLabel="broadcasts" />
      </div>
    </div>
  );
}
