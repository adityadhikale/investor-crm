import type { BroadcastSendSummary } from "@/lib/broadcast-dispatch";

/**
 * What to show as a broadcast's status. A broadcast is stored as "sent" once
 * every recipient has been handled, even if nobody was reached, so the label
 * says so instead of a green "sent".
 */
export function broadcastStatusDisplay(
  status: string,
  summary?: BroadcastSendSummary | null,
): { label: string; className: string } {
  if (status === "sent" && summary && summary.total > 0) {
    if (summary.sent === 0) {
      return {
        label: summary.failed > 0 ? "Not delivered" : "Nobody reached",
        className: "bg-red-500/10 text-red-600 dark:text-red-400",
      };
    }
    if (summary.failed > 0) {
      return { label: "Partly sent", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" };
    }
  }
  if (status === "sent") return { label: "sent", className: "bg-green-500/10 text-green-600 dark:text-green-400" };
  if (status === "scheduled") return { label: status, className: "bg-blue-500/10 text-blue-600 dark:text-blue-400" };
  if (status === "sending") return { label: status, className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" };
  return { label: status, className: "bg-muted text-muted-foreground" };
}

/** One-line counts for the Broadcasts list, e.g. "4 sent · 1 skipped". */
export function BroadcastSendCounts({ summary }: { summary?: BroadcastSendSummary | null }) {
  if (!summary) return null;
  return (
    <span className="text-xs text-muted-foreground whitespace-nowrap">
      {summary.sent} sent
      {summary.skipped > 0 && (
        <span className="text-amber-600 dark:text-amber-400"> · {summary.skipped} skipped</span>
      )}
      {summary.failed > 0 && <span className="text-destructive"> · {summary.failed} failed</span>}
    </span>
  );
}

/** Full delivery report shown on a sent broadcast's page. */
export function BroadcastSendReport({ summary }: { summary?: BroadcastSendSummary | null }) {
  if (!summary) return null;

  return (
    <section className="mb-6 rounded-lg border bg-background p-5 text-sm">
      <h2 className="text-base font-semibold">Delivery</h2>
      {summary.total > 0 && summary.sent === 0 && (
        <p className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 font-medium text-red-700 dark:text-red-300">
          This broadcast did not reach anyone. See the skipped and failed lists below.
        </p>
      )}
      <p className="mt-1 text-muted-foreground">
        Sent to {summary.sent} of {summary.total} recipient{summary.total === 1 ? "" : "s"}
        {summary.skipped > 0 && `, ${summary.skipped} skipped`}
        {summary.failed > 0 && `, ${summary.failed} failed`}.
      </p>

      {summary.skipped > 0 && (
        <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="font-medium text-amber-700 dark:text-amber-400">
            Skipped ({summary.skipped}): reply window closed
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            They hadn&apos;t messaged you in the last 24 hours, so a plain message can&apos;t
            reach them. Send them an approved Meta template instead.
          </p>
          <p className="mt-2">
            {summary.skipped_names.join(", ")}
            {summary.skipped > summary.skipped_names.length &&
              ` and ${summary.skipped - summary.skipped_names.length} more`}
          </p>
        </div>
      )}

      {summary.failed > 0 && (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="font-medium text-destructive">Failed ({summary.failed})</p>
          <ul className="mt-2 space-y-1">
            {summary.failures.map((failure, index) => (
              <li key={index}>
                <span className="font-medium">{failure.name}</span>
                <span className="text-muted-foreground">: {failure.error}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
