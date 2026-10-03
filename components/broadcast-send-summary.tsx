import type { BroadcastSendSummary } from "@/lib/broadcast-dispatch";

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
