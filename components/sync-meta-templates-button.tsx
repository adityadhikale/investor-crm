"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { syncMetaTemplates } from "@/app/templates/actions";
import { useToast } from "@/components/toast-provider";
import { Button } from "@/components/ui/button";

/** Copies the message templates from WhatsApp Manager into the CRM. */
export function SyncMetaTemplatesButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);

  async function handleClick() {
    setSyncing(true);
    const result = await syncMetaTemplates();
    setSyncing(false);

    if (result.error) {
      toast(result.error, "error");
      return;
    }

    const skipped = result.skipped?.length
      ? ` Skipped (not supported): ${result.skipped.join(", ")}.`
      : "";
    const removed = result.removed?.length
      ? ` Removed (deleted at Meta): ${result.removed.join(", ")}.`
      : "";
    toast(
      `Synced ${result.imported} template${result.imported === 1 ? "" : "s"} from Meta, ${result.approved} approved.${skipped}${removed}`,
      "success",
    );
    router.refresh();
  }

  return (
    <Button variant="outline" onClick={handleClick} disabled={syncing}>
      <RefreshCw className={syncing ? "size-4 animate-spin" : "size-4"} />
      {syncing ? "Syncing…" : "Sync from Meta"}
    </Button>
  );
}
