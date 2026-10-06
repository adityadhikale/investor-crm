"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";

import { retryFailedBroadcast } from "@/app/broadcasts/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast-provider";

/** Sends again to the people whose send failed. Shown on a finished broadcast. */
export function RetryFailedBroadcastButton({ broadcastId, failedCount }: { broadcastId: string; failedCount: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [retrying, setRetrying] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  async function handleRetry() {
    setRetrying(true);
    let result = await retryFailedBroadcast(broadcastId);
    // Large retries go out in batches: keep going until done.
    while (result.success && !result.done) {
      setProgress(`${result.total - result.remaining} of ${result.total} done`);
      result = await retryFailedBroadcast(broadcastId);
    }
    setRetrying(false);
    setProgress(null);

    if (!result.success) {
      toast(result.error, "error");
    } else if (result.failed > 0) {
      toast(`Retried. ${result.failed} still failed; see the list for the reasons.`, "error");
    } else {
      toast("Retried. Everyone was sent the message.");
    }
    router.refresh();
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border bg-background p-4 text-sm">
      <p className="flex-1 text-muted-foreground">
        {failedCount} recipient{failedCount === 1 ? "" : "s"} could not be sent the message. You can try those
        again. Invalid numbers, and sends that were cut off part-way (they may already have arrived),
        are skipped so nobody gets it twice.
      </p>
      <Button type="button" variant="outline" onClick={handleRetry} disabled={retrying}>
        <RotateCw className={retrying ? "size-4 animate-spin" : "size-4"} />
        {retrying ? (progress ? `Retrying… ${progress}` : "Retrying…") : "Retry failed"}
      </Button>
    </div>
  );
}
