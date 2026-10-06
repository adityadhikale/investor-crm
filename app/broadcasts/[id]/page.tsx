import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { BroadcastEditor } from "@/components/broadcast-editor";
import {
  BroadcastDeliveryResultsPanel,
  BroadcastSendReport,
  broadcastStatusDisplay,
} from "@/components/broadcast-send-summary";
import { getBroadcastDeliveryResults } from "@/lib/broadcast-delivery";
import type {
  GroupOption,
  ContactOption,
  TemplateOption,
  BroadcastData,
} from "@/app/broadcasts/actions";

export const metadata: Metadata = {
  title: "Broadcast Details",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BroadcastDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { supabase } = await requireAuth();

  const [broadcastResult, groupsResult, contactsResult, templatesResult] = await Promise.all([
    supabase
      .from("broadcasts")
      .select(
        "*"
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("groups")
      .select("id, name")
      .order("name", { ascending: true }),
    supabase
      .from("contacts")
      .select("id, name, phone")
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("templates")
      .select("id, name, category, body_text, variables, approved_at, meta_template_id")
      .is("deleted_at", null)
      .order("name", { ascending: true }),
  ]);

  if (broadcastResult.error || !broadcastResult.data) {
    notFound();
  }

  const broadcast = broadcastResult.data as BroadcastData;
  const groups = (groupsResult.data ?? []) as GroupOption[];
  const contacts = (contactsResult.data ?? []) as ContactOption[];
  const templates = (templatesResult.data ?? []) as TemplateOption[];

  const isSent = broadcast.status === "sent";
  const isScheduled = broadcast.status === "scheduled";
  const isSending = broadcast.status === "sending";

  const deliveryResults = isSent ? await getBroadcastDeliveryResults(supabase, id) : null;

  // Progress of a broadcast that is going out in batches.
  let sendingProgress: { done: number; total: number } | null = null;
  if (isSending) {
    const countWhere = (statuses: string[]) =>
      supabase
        .from("broadcast_recipients")
        .select("id", { count: "exact", head: true })
        .eq("broadcast_id", id)
        .in("status", statuses);
    const [{ count: doneCount }, { count: totalCount }] = await Promise.all([
      countWhere(["sent", "skipped", "failed"]),
      countWhere(["pending", "sending", "sent", "skipped", "failed"]),
    ]);
    sendingProgress = { done: doneCount ?? 0, total: totalCount ?? 0 };
  }

  return (
    <div className="flex min-h-0 flex-col p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3">
        <div>
          <Link
            href="/broadcasts"
            className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to Broadcasts
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">
              {isSent || isSending
                ? "Broadcast Details"
                : isScheduled
                ? "Edit Scheduled Broadcast"
                : "Edit Broadcast"}
            </h1>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium capitalize text-muted-foreground">
              {broadcastStatusDisplay(broadcast.status, broadcast.send_summary).label}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSent || isSending
              ? "View sent broadcast message and recipient target audience."
              : isScheduled
              ? "Modify your scheduled broadcast message, recipient targets, and send time."
              : "Modify your draft broadcast message and recipient targets."}
          </p>
        </div>
      </div>

      <div className="mt-6 max-w-4xl">
        {isSent && <BroadcastSendReport summary={broadcast.send_summary} />}
        {isSent && <BroadcastDeliveryResultsPanel results={deliveryResults} />}
        {sendingProgress && (
          <section className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-5 text-sm">
            <h2 className="text-base font-semibold">Sending in batches</h2>
            <p className="mt-1 text-muted-foreground">
              {sendingProgress.done} of {sendingProgress.total} recipients done. It continues
              automatically every few minutes; refresh to see progress. The delivery report
              appears here when it finishes.
            </p>
          </section>
        )}
        <BroadcastEditor
          mode="edit"
          existingBroadcast={broadcast}
          groups={groups}
          contacts={contacts}
          templates={templates}
        />
      </div>
    </div>
  );
}
