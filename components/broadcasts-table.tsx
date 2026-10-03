"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteBroadcast,
  deleteBroadcasts,
  sendBroadcastNow,
  type GroupOption,
  type ContactOption,
  type BroadcastData,
} from "@/app/broadcasts/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast-provider";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Clock } from "lucide-react";

function formatBroadcastDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const datePart = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timePart = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${datePart}, ${timePart}`;
}

export interface BroadcastsTableProps {
  broadcasts: BroadcastData[];
  groups?: GroupOption[];
  contacts?: ContactOption[];
}

export function BroadcastsTable({
  broadcasts,
}: BroadcastsTableProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const [deletingBulk, setDeletingBulk] = useState(false);

  const [broadcastToDelete, setBroadcastToDelete] = useState<BroadcastData | null>(null);
  const [deletingSingle, setDeletingSingle] = useState(false);

  const [broadcastToSend, setBroadcastToSend] = useState<BroadcastData | null>(null);
  const [sending, setSending] = useState(false);

  const selectAllRef = useRef<HTMLInputElement>(null);
  const broadcastIds = broadcasts.map((b) => b.id);
  const selectedVisibleCount = broadcastIds.filter((id) => selectedIds.has(id)).length;
  const allSelected = broadcastIds.length > 0 && selectedVisibleCount === broadcastIds.length;
  const someSelected = selectedVisibleCount > 0 && !allSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  function toggleBroadcast(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allSelected) {
        broadcastIds.forEach((id) => next.delete(id));
      } else {
        broadcastIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  async function handleBulkDelete() {
    setDeletingBulk(true);
    const result = await deleteBroadcasts([...selectedIds]);
    setDeletingBulk(false);

    if (result.error) {
      toast(result.error, "error");
      setConfirmingBulkDelete(false);
      return;
    }

    setSelectedIds(new Set());
    setConfirmingBulkDelete(false);
    toast(
      `${result.deleted} broadcast${result.deleted === 1 ? "" : "s"} deleted successfully`
    );
    router.refresh();
  }

  async function handleSingleDelete() {
    if (!broadcastToDelete) return;
    const isScheduled = broadcastToDelete.status === "scheduled";
    setDeletingSingle(true);
    const result = await deleteBroadcast(broadcastToDelete.id);
    setDeletingSingle(false);

    if (result.error) {
      toast(result.error, "error");
      setBroadcastToDelete(null);
      return;
    }

    // Also remove from selectedIds if present
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(broadcastToDelete.id);
      return next;
    });

    setBroadcastToDelete(null);
    toast(
      isScheduled
        ? "Scheduled broadcast cancelled"
        : "Broadcast deleted successfully"
    );
    router.refresh();
  }

  async function handleSendNow() {
    if (!broadcastToSend) return;
    setSending(true);
    const result = await sendBroadcastNow(broadcastToSend.id);
    setSending(false);

    if (result.error) {
      toast(result.error, "error");
      setBroadcastToSend(null);
      return;
    }

    const skipped = (result.results ?? []).filter((r) => r.skipped);
    const skippedNote = skipped.length
      ? ` Not sent to ${skipped.length} (no message from them in the last 24 hours, so plain text can't reach them; use an approved Meta template): ${skipped
          .slice(0, 5)
          .map((r) => r.name)
          .join(", ")}${skipped.length > 5 ? ` and ${skipped.length - 5} more` : ""}.`
      : "";

    if (result.failedCount === 0 && skipped.length === 0) {
      toast(`Sent to ${result.sentCount} of ${result.total} recipients`);
    } else if (result.sentCount === 0) {
      toast(
        `Nothing was sent.${result.failedCount ? ` ${result.failedCount} failed.` : ""}${skippedNote}`,
        "error"
      );
    } else {
      toast(
        `Sent to ${result.sentCount} of ${result.total} recipients.${
          result.failedCount ? ` ${result.failedCount} failed.` : ""
        }${skippedNote}`,
        "error"
      );
    }

    setBroadcastToSend(null);
    router.refresh();
  }

  function getRecipientCountDescription(broadcast: BroadcastData) {
    if (broadcast.target_type === "manual") {
      const count = broadcast.target_ids.length;
      return `${count} contact${count === 1 ? "" : "s"}`;
    }
    if (broadcast.target_type === "group") {
      const count = broadcast.target_ids.length;
      return `${count} group${count === 1 ? "" : "s"}`;
    }
    if (broadcast.target_type === "tag") {
      const count = broadcast.target_ids.length;
      return `${count} tag${count === 1 ? "" : "s"}`;
    }
    return "all target recipients";
  }

  return (
    <>
      {/* Bulk selection action bar */}
      {selectedIds.size > 0 && (
        <div className="mb-3 flex shrink-0 items-center justify-between rounded-lg border bg-background px-4 py-2.5">
          <p className="text-sm font-medium">
            {selectedIds.size} broadcast{selectedIds.size === 1 ? "" : "s"} selected
          </p>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => setConfirmingBulkDelete(true)}
            disabled={deletingBulk}
          >
            Delete
          </Button>
        </div>
      )}

      {/* Main Table */}
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-background">
        <div className="min-w-2xl">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b bg-background text-left text-muted-foreground">
                <th className="w-12 px-5 py-2.5 sm:py-3 font-medium">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all broadcasts"
                    className="size-4 cursor-pointer accent-primary rounded"
                  />
                </th>
                <th className="w-[42%] px-5 py-2.5 sm:py-3 font-medium">Message</th>
                <th className="w-[18%] px-5 py-2.5 sm:py-3 font-medium">Target Type</th>
                <th className="w-[16%] px-5 py-2.5 sm:py-3 font-medium">Status</th>
                <th className="w-[18%] px-5 py-2.5 sm:py-3 font-medium">Date Created</th>
                <th className="w-12 px-3 py-2.5 sm:py-3 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {broadcasts.length ? (
                broadcasts.map((broadcast) => (
                  <tr
                    key={broadcast.id}
                    onClick={() => router.push(`/broadcasts/${broadcast.id}`)}
                    className="border-b last:border-b-0 hover:bg-muted/20 cursor-pointer"
                  >
                    <td
                      className="px-5 py-2.5 sm:py-4"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(broadcast.id)}
                        onChange={() => toggleBroadcast(broadcast.id)}
                        aria-label="Select broadcast"
                        className="size-4 cursor-pointer accent-primary rounded"
                      />
                    </td>
                    <td className="px-5 py-2.5 sm:py-4">
                      <p className="line-clamp-2 max-w-md font-medium text-foreground">
                        {broadcast.message_text}
                      </p>
                    </td>
                    <td className="px-5 py-2.5 sm:py-4">
                      <span className="inline-flex items-center rounded-md border bg-muted/40 px-2 py-0.5 text-xs font-medium capitalize">
                        {broadcast.target_type}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 sm:py-4">
                      <div className="flex flex-col gap-1 items-start">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                            broadcast.status === "sent"
                              ? "bg-green-500/10 text-green-600 dark:text-green-400"
                              : broadcast.status === "scheduled"
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {broadcast.status}
                        </span>
                        {broadcast.status === "scheduled" && broadcast.scheduled_for && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                            <Clock className="size-3 text-blue-500/70" />
                            {formatBroadcastDateTime(broadcast.scheduled_for)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 sm:py-4 text-muted-foreground">
                      {new Date(broadcast.created_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td
                      className="px-3 py-2 text-right"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <DropdownMenu>
                        <DropdownMenuIconTrigger
                          label={`Actions for broadcast ${broadcast.id}`}
                        />
                        <DropdownMenuContent>
                          {broadcast.status === "draft" && (
                            <DropdownMenuItem
                              onClick={() => setBroadcastToSend(broadcast)}
                              className="font-medium text-primary focus:text-primary"
                            >
                              Send Now
                            </DropdownMenuItem>
                          )}
                          {broadcast.status === "draft" || broadcast.status === "scheduled" ? (
                            <DropdownMenuItem
                              onClick={() => router.push(`/broadcasts/${broadcast.id}`)}
                            >
                              Edit
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem disabled className="opacity-50 cursor-not-allowed">
                              Edit
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => setBroadcastToDelete(broadcast)}
                            className="text-destructive focus:text-destructive"
                          >
                            {broadcast.status === "scheduled" ? "Cancel" : "Delete"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-muted-foreground"
                  >
                    No broadcasts yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Send Now Confirmation Dialog */}
      <Dialog
        open={Boolean(broadcastToSend)}
        onOpenChange={(open) => {
          if (!open) setBroadcastToSend(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send this broadcast now?</DialogTitle>
            <DialogDescription>
              {broadcastToSend && (
                <>
                  Send this broadcast to {getRecipientCountDescription(broadcastToSend)} now? This cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={sending} />}>
              Cancel
            </DialogClose>
            <Button
              type="button"
              onClick={handleSendNow}
              disabled={sending}
            >
              {sending ? "Sending..." : "Send Now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single Delete / Cancel Confirmation Dialog */}
      <Dialog
        open={Boolean(broadcastToDelete)}
        onOpenChange={(open) => {
          if (!open) setBroadcastToDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {broadcastToDelete?.status === "scheduled"
                ? "Cancel scheduled broadcast?"
                : "Delete broadcast?"}
            </DialogTitle>
            <DialogDescription>
              {broadcastToDelete?.status === "scheduled"
                ? "This will cancel the scheduled broadcast. It will not be sent."
                : "This will remove this broadcast. This action can be undone by restoring the record."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={handleSingleDelete}
              disabled={deletingSingle}
            >
              {deletingSingle
                ? broadcastToDelete?.status === "scheduled"
                  ? "Cancelling..."
                  : "Deleting..."
                : broadcastToDelete?.status === "scheduled"
                ? "Cancel Broadcast"
                : "Delete Broadcast"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog
        open={confirmingBulkDelete}
        onOpenChange={setConfirmingBulkDelete}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {selectedIds.size} broadcast{selectedIds.size === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>
              This will remove the selected broadcasts. This action can be undone by restoring the records.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={deletingBulk}
            >
              {deletingBulk ? "Deleting..." : "Delete Broadcasts"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
