"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, Download, FileText, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/toast-provider";
import { toIndianGrouping } from "@/lib/indian-numbers";
import { createClient as createBrowserSupabase } from "@/src/lib/supabase/client";
import {
  analyzePortfolioUpdateById,
  createPortfolioUpdate,
  createPortfolioUpdateFromText,
  deletePortfolioUpdate,
  listPortfolioUpdates,
  preparePortfolioUpload,
} from "@/app/contacts/portfolio-actions";
import {
  PORTFOLIO_ACCEPTED_EXTENSIONS,
  type PortfolioHolding,
  type PortfolioUpdate,
} from "@/lib/portfolio-types";

const POLL_INTERVAL_MS = 4000;
// An analysis still "pending" this long after upload was cut off (the server gave up or restarted).
const STALE_PENDING_MS = 3 * 60 * 1000;

function withStalePendingFailed(update: PortfolioUpdate): PortfolioUpdate {
  if (update.analysis_status === "pending" && Date.now() - new Date(update.created_at).getTime() > STALE_PENDING_MS) {
    return {
      ...update,
      analysis_status: "failed",
      analysis_error: "The analysis took too long and was stopped.",
    };
  }
  return update;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatPct(value: number | null) {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function pctClass(value: number | null) {
  if (value === null || value === 0) return "text-muted-foreground";
  return value > 0 ? "text-emerald-600" : "text-red-600";
}

function HoldingsTable({ title, holdings }: { title: string; holdings: PortfolioHolding[] }) {
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {holdings.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not available in this update.</p>
      ) : (
        <ul className="divide-y rounded-md border text-sm">
          {holdings.map((holding, index) => (
            <li key={`${holding.name}-${index}`} className="flex items-center justify-between gap-3 px-3 py-1.5">
              <span className="min-w-0">
                <span className="block truncate font-medium">{holding.name}</span>
                {(holding.ticker || holding.detail) && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {toIndianGrouping([holding.ticker, holding.detail].filter(Boolean).join(" · "))}
                  </span>
                )}
              </span>
              <span className={`shrink-0 font-semibold tabular-nums ${pctClass(holding.return_pct)}`}>
                {formatPct(holding.return_pct)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Delta({ value, suffix }: { value: number | null | undefined; suffix: string }) {
  if (value === null || value === undefined) return null;
  return (
    <span className={`ml-2 text-xs font-medium ${pctClass(value)}`}>
      {value > 0 ? "▲" : value < 0 ? "▼" : ""} {Math.abs(value).toFixed(2)}
      {suffix} vs previous
    </span>
  );
}

function AnalysisPanel({ update }: { update: PortfolioUpdate }) {
  const analysis = update.analysis;
  if (update.analysis_status === "pending") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Analysing this update…
      </p>
    );
  }
  if (update.analysis_status === "failed" || !analysis) {
    return (
      <p className="text-sm text-red-600">
        {update.analysis_error || "The analysis failed."} Use Re-analyze to try again.
      </p>
    );
  }
  const changes = analysis.changes_vs_previous;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">AUM</p>
          <p className="mt-1 text-lg font-semibold">{analysis.aum.display ? toIndianGrouping(analysis.aum.display) : "—"}</p>
          <p className="text-xs text-muted-foreground">{analysis.aum.as_of ? `As of ${analysis.aum.as_of}` : ""}</p>
          <Delta value={changes?.aum_delta_pct} suffix="%" />
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Returns</p>
          <p className="mt-1 text-lg font-semibold">
            {analysis.returns.display
              ? toIndianGrouping(analysis.returns.display)
              : analysis.returns.pct !== null
                ? formatPct(analysis.returns.pct)
                : "—"}
          </p>
          <p className="text-xs text-muted-foreground">{analysis.returns.period ?? ""}</p>
          <Delta value={changes?.returns_delta_pct_points} suffix=" pts" />
        </div>
      </div>
      {analysis.summary && <p className="text-sm">{toIndianGrouping(analysis.summary)}</p>}
      {changes?.notes && <p className="text-sm text-muted-foreground">Change: {toIndianGrouping(changes.notes)}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <HoldingsTable title="Top 5 gainers" holdings={analysis.top_gainers} />
        <HoldingsTable title="Bottom 5 losers" holdings={analysis.top_losers} />
      </div>
      {analysis.confidence_notes && (
        <p className="text-xs text-muted-foreground">AI note: {toIndianGrouping(analysis.confidence_notes)}</p>
      )}
    </div>
  );
}

export function PortfolioUpdatesSection({
  contactId,
  initialUpdates,
  error,
}: {
  contactId: string;
  initialUpdates: PortfolioUpdate[];
  error: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [updates, setUpdates] = useState(() => initialUpdates.map(withStalePendingFailed));
  // Updates this page is analysing itself right now; the background refresh leaves these alone.
  const analysingIds = useRef(new Set<string>());
  const hasPending = updates.some((update) => update.analysis_status === "pending");

  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(async () => {
      const result = await listPortfolioUpdates(contactId);
      if (!("updates" in result)) return;
      const fresh = new Map(result.updates.map((update) => [update.id, withStalePendingFailed(update)]));
      setUpdates((current) =>
        current.map((update) =>
          analysingIds.current.has(update.id) ? update : (fresh.get(update.id) ?? withStalePendingFailed(update)),
        ),
      );
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasPending, contactId]);
  const [selectedId, setSelectedId] = useState<string | null>(initialUpdates[0]?.id ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [deleting, setDeleting] = useState<PortfolioUpdate | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const selected = updates.find((update) => update.id === selectedId) ?? updates[0] ?? null;

  function replaceUpdate(next: PortfolioUpdate) {
    setUpdates((current) => current.map((update) => (update.id === next.id ? next : update)));
  }

  async function analyse(id: string) {
    setBusy("Analysing update…");
    analysingIds.current.add(id);
    setUpdates((current) =>
      current.map((update) => (update.id === id ? { ...update, analysis_status: "pending" as const } : update)),
    );
    try {
      const result = await analyzePortfolioUpdateById(id);
      if ("update" in result) {
        replaceUpdate(result.update);
        toast("Update analysed.");
      } else {
        toast(result.error, "error");
        setUpdates((current) =>
          current.map((update) =>
            update.id === id ? { ...update, analysis_status: "failed" as const, analysis_error: result.error } : update,
          ),
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "The analysis failed.";
      toast(message, "error");
      setUpdates((current) =>
        current.map((update) =>
          update.id === id ? { ...update, analysis_status: "failed" as const, analysis_error: message } : update,
        ),
      );
    } finally {
      analysingIds.current.delete(id);
      setBusy(null);
      router.refresh();
    }
  }

  function addCreated(id: string, base: Partial<PortfolioUpdate> & { file_name: string }) {
    const created: PortfolioUpdate = {
      id,
      title: null,
      mime_type: null,
      size_bytes: null,
      source: "file",
      analysis: null,
      analysis_status: "pending",
      analysis_error: null,
      as_of_date: null,
      created_at: new Date().toISOString(),
      ...base,
    };
    setUpdates((current) => [created, ...current]);
    setSelectedId(id);
  }

  async function handleFile(file: File) {
    setBusy("Uploading…");
    try {
      const prepared = await preparePortfolioUpload(contactId, file.name, file.size);
      if ("error" in prepared) {
        toast(prepared.error, "error");
        return;
      }
      // The file goes straight to storage, not through the web server.
      const { error: uploadError } = await createBrowserSupabase()
        .storage.from("portfolio-updates")
        .uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: file.type || undefined });
      if (uploadError) {
        toast("The file could not be uploaded. Please try again.", "error");
        return;
      }
      const created = await createPortfolioUpdate(contactId, prepared.path, file.name, file.type, file.size);
      if ("error" in created) {
        toast(created.error, "error");
        return;
      }
      addCreated(created.id, { file_name: file.name, mime_type: file.type || null, size_bytes: file.size });
      toast("Update attached.");
      await analyse(created.id);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "The upload failed.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function handlePaste() {
    setBusy("Saving…");
    try {
      const created = await createPortfolioUpdateFromText(contactId, pasteText, pasteTitle);
      if ("error" in created) {
        toast(created.error, "error");
        return;
      }
      const title = pasteTitle.trim();
      addCreated(created.id, {
        file_name: `${title || "Pasted update"}.txt`,
        title: title || null,
        mime_type: "text/plain",
        source: "paste",
      });
      setPasteOpen(false);
      setPasteText("");
      setPasteTitle("");
      toast("Update attached.");
      await analyse(created.id);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "The update could not be saved.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleConfirmDelete() {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      const result = await deletePortfolioUpdate(deleting.id);
      if ("error" in result) {
        toast(result.error, "error");
        return;
      }
      setUpdates((current) => current.filter((item) => item.id !== deleting.id));
      if (selectedId === deleting.id) setSelectedId(null);
      toast("Update deleted.");
      setDeleting(null);
      router.refresh();
    } finally {
      setDeletingBusy(false);
    }
  }

  return (
    <section className="rounded-lg border bg-background p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Portfolio Updates</h2>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={PORTFOLIO_ACCEPTED_EXTENSIONS.join(",")}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void handleFile(file);
            }}
          />
          <Button type="button" size="sm" disabled={busy !== null} onClick={() => fileInputRef.current?.click()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {busy ?? "Upload update"}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => setPasteOpen(true)}>
            <ClipboardPaste className="h-4 w-4" /> Paste text
          </Button>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Attach a PDF, Excel or CSV update (or paste text). AI pulls out AUM, returns, and the top and bottom 5 stocks.
      </p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {!error && updates.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">No updates attached yet.</p>
      )}

      {selected && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {selected.title ?? selected.file_name}
              <span className="ml-2 font-normal text-muted-foreground">{formatDate(selected.created_at)}</span>
            </p>
          </div>
          <AnalysisPanel update={selected} />
        </div>
      )}

      {updates.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">History</h3>
          <ul className="divide-y rounded-md border">
            {updates.map((update) => (
              <li
                key={update.id}
                className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm ${
                  update.id === selected?.id ? "bg-muted/50" : ""
                }`}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={() => setSelectedId(update.id)}
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{update.title ?? update.file_name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(update.created_at)}</span>
                  {update.analysis_status === "failed" && <span className="shrink-0 text-xs text-red-600">failed</span>}
                  {update.analysis_status === "pending" && (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                  )}
                </button>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    render={<a href={`/api/portfolio-updates/${update.id}`} aria-label="Download" />}
                    nativeButton={false}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label="Re-analyze"
                    disabled={busy !== null}
                    onClick={() => void analyse(update.id)}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label="Delete"
                    disabled={busy !== null}
                    onClick={() => setDeleting(update)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={pasteOpen} onOpenChange={(next) => !busy && setPasteOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Paste an update</DialogTitle>
            <DialogDescription>Paste the text of an investor or portfolio update, e.g. from an email.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Title (optional), e.g. Sept 2026 update"
              value={pasteTitle}
              onChange={(event) => setPasteTitle(event.target.value)}
              disabled={busy !== null}
            />
            <Textarea
              rows={10}
              placeholder="Paste the update here"
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
              disabled={busy !== null}
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={busy !== null} />}>Cancel</DialogClose>
            <Button type="button" disabled={busy !== null || !pasteText.trim()} onClick={() => void handlePaste()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Attach and analyse
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(next) => {
          if (!next && !deletingBusy) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete portfolio update?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleting?.title ?? deleting?.file_name}&quot;? The file and its
              analysis will be removed. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={deletingBusy} />}>Cancel</DialogClose>
            <Button type="button" variant="destructive" disabled={deletingBusy} onClick={() => void handleConfirmDelete()}>
              {deletingBusy ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
