"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";

import {
  backUpNow,
  getBackupDownloadUrl,
  listStoredBackups,
  type StoredBackup,
} from "@/app/settings/backup-actions";
import { useToast } from "@/components/toast-provider";
import { Button } from "@/components/ui/button";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Automatic nightly backups kept in private storage, with download links. */
export function StoredBackups() {
  const { toast } = useToast();
  const [backups, setBackups] = useState<StoredBackup[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await listStoredBackups();
    if (result.error) {
      toast(result.error, "error");
      setBackups([]);
      return;
    }
    setBackups(result.backups ?? []);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    listStoredBackups().then((result) => {
      if (!cancelled) setBackups(result.backups ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleBackUpNow() {
    setBusy(true);
    const result = await backUpNow();
    setBusy(false);
    if (result.error) {
      toast(result.error, "error");
      return;
    }
    toast("Backup saved.");
    await load();
  }

  async function handleDownload(name: string) {
    setDownloading(name);
    const result = await getBackupDownloadUrl(name);
    setDownloading(null);
    if (!result.url) {
      toast(result.error ?? "Could not download the backup.", "error");
      return;
    }
    window.location.assign(result.url);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">Automatic backups</p>
          <p className="text-xs text-muted-foreground">
            A full backup is saved every night at 3:00 AM and kept for 30 days, in private
            storage. Download one now and then to keep a copy outside the CRM.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleBackUpNow} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {busy ? "Backing up…" : "Back up now"}
        </Button>
      </div>

      {backups === null ? (
        <p className="text-xs text-muted-foreground">Loading backups…</p>
      ) : backups.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No automatic backups yet. The first one is saved tonight, or click &quot;Back up now&quot;.
        </p>
      ) : (
        <ul className="max-h-56 divide-y overflow-y-auto rounded-md border">
          {backups.map((backup) => (
            <li key={backup.name} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span>
                {formatDate(backup.date)}
                <span className="ml-2 text-xs text-muted-foreground">{formatSize(backup.bytes)}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDownload(backup.name)}
                disabled={downloading === backup.name}
              >
                <Download className="size-4" />
                Download
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
