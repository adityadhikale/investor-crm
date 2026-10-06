"use server";

import { requireOwnerAction } from "@/lib/auth";
import { BACKUP_BUCKET, saveDailyBackup } from "@/lib/backup";
import { createServiceRoleClient } from "@/lib/supabase-service";

export interface StoredBackup {
  name: string;
  /** YYYY-MM-DD the backup was taken. */
  date: string;
  bytes: number;
}

// The backups bucket is private, so reading it uses the service client, but
// only after the signed-in owner is confirmed (requireOwnerAction).

/** Saved daily backups, newest first. */
export async function listStoredBackups(): Promise<{ backups?: StoredBackup[]; error?: string }> {
  const { error: authError } = await requireOwnerAction();
  if (authError) return { error: "Unauthorized" };

  const { data, error } = await createServiceRoleClient()
    .storage.from(BACKUP_BUCKET)
    .list("", { limit: 100, sortBy: { column: "name", order: "desc" } });
  if (error) {
    // The bucket is created by the first backup.
    return /not found/i.test(error.message) ? { backups: [] } : { error: error.message };
  }

  return {
    backups: (data ?? [])
      .filter((file) => /\d{4}-\d{2}-\d{2}/.test(file.name))
      .map((file) => ({
        name: file.name,
        date: file.name.match(/(\d{4}-\d{2}-\d{2})/)![1],
        bytes: Number(file.metadata?.size ?? 0),
      })),
  };
}

/** A download link for one backup, valid for one minute. */
export async function getBackupDownloadUrl(name: string): Promise<{ url?: string; error?: string }> {
  const { error: authError } = await requireOwnerAction();
  if (authError) return { error: "Unauthorized" };
  if (!/^crest-crm-backup-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(name)) {
    return { error: "Unknown backup." };
  }

  const { data, error } = await createServiceRoleClient()
    .storage.from(BACKUP_BUCKET)
    .createSignedUrl(name, 60, { download: name });
  if (error || !data) return { error: error?.message ?? "Could not create the download link." };
  return { url: data.signedUrl };
}

/** Takes a backup now (same as the nightly one). */
export async function backUpNow(): Promise<{ success?: boolean; error?: string }> {
  const { error: authError } = await requireOwnerAction();
  if (authError) return { error: "Unauthorized" };
  try {
    await saveDailyBackup(createServiceRoleClient());
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Backup failed." };
  }
}
