import type { Metadata } from "next";
import Link from "next/link";
import { requireAuthFast } from "@/lib/auth";
import type { TemplateData } from "@/app/templates/actions";
import { PaginationControls } from "@/components/pagination-controls";
import { TemplatesTable } from "@/components/templates-table";
import { SyncMetaTemplatesButton } from "@/components/sync-meta-templates-button";
import { Button } from "@/components/ui/button";
import { getPageRange, getTotalPages, parsePage } from "@/lib/pagination";

export const metadata: Metadata = {
  title: "Templates",
};

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const requestedPage = parsePage((await searchParams).page);
  const { supabase } = await requireAuthFast();

  const { count, error: countError } = await supabase
    .from("templates")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);

  const totalCount = count ?? 0;
  // Clamp so a stale or hand-typed ?page=999 shows the last page instead of erroring.
  const page = Math.min(requestedPage, getTotalPages(totalCount));
  const { from, to } = getPageRange(page);

  const { data: templatesResult, error } = countError
    ? { data: null, error: countError }
    : await supabase
        .from("templates")
        .select("id, name, meta_template_id, variables, category, body_text, approved_at, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);

  if (error) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <h1 className="text-2xl font-semibold">Templates</h1>
        <p className="mt-2 text-destructive">Unable to load templates.</p>
      </div>
    );
  }

  const templates = (templatesResult ?? []) as TemplateData[];

  return (
    <div className="flex min-h-0 flex-col p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create, view, and manage WhatsApp message templates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SyncMetaTemplatesButton />
          <Link href="/templates/new">
            <Button className="h-9 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm">
              + New Template
            </Button>
          </Link>
        </div>
      </div>

      <div className="mt-6 flex min-h-0 flex-1 flex-col">
        <TemplatesTable key={page} templates={templates} />
        <PaginationControls page={page} totalCount={totalCount} itemLabel="templates" />
      </div>
    </div>
  );
}
