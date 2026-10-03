import { gzipSync } from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/supabase-pagination";

// Each table is paged in a stable order so no rows are skipped or repeated.
const BACKUP_TABLES: Array<{ table: string; orderBy: string[]; optional?: boolean }> = [
  { table: "contacts", orderBy: ["id"] },
  { table: "groups", orderBy: ["id"] },
  { table: "contact_groups", orderBy: ["contact_id", "group_id"] },
  { table: "interactions", orderBy: ["id"] },
  { table: "follow_ups", orderBy: ["id"] },
  { table: "templates", orderBy: ["id"] },
  { table: "broadcasts", orderBy: ["id"] },
  { table: "broadcast_recipients", orderBy: ["id"], optional: true },
  { table: "whatsapp_messages", orderBy: ["id"] },
  { table: "app_settings", orderBy: ["id"], optional: true },
];

export const BACKUP_BUCKET = "backups";
/** Daily backups older than this are deleted. */
export const BACKUP_RETENTION_DAYS = 30;

export interface CrmBackup {
  exportedAt: string;
  counts: Record<string, number>;
  data: Record<string, unknown[]>;
}

/** Every CRM table, including soft-deleted rows. Throws if a required table fails. */
export async function buildCrmBackup(supabase: SupabaseClient): Promise<CrmBackup> {
  const data: Record<string, unknown[]> = {};
  for (const { table, orderBy, optional } of BACKUP_TABLES) {
    try {
      data[table] = await fetchAllPages<Record<string, unknown>>((from, to) => {
        let query = supabase.from(table).select("*");
        for (const column of orderBy) {
          query = query.order(column, { ascending: true });
        }
        return query.range(from, to);
      });
    } catch (err) {
      if (!optional) throw err;
    }
  }
  return {
    exportedAt: new Date().toISOString(),
    counts: Object.fromEntries(Object.entries(data).map(([table, rows]) => [table, rows.length])),
    data,
  };
}

/**
 * Saves today's compressed backup to the private "backups" storage bucket
 * (created on first use) and deletes backups older than the retention period.
 * Needs the service-role client.
 */
export async function saveDailyBackup(supabase: SupabaseClient): Promise<{
  path: string;
  bytes: number;
  counts: Record<string, number>;
  removed: number;
}> {
  // Private bucket: backups hold all CRM data, so never public.
  const { data: bucket } = await supabase.storage.getBucket(BACKUP_BUCKET);
  if (!bucket) {
    const { error } = await supabase.storage.createBucket(BACKUP_BUCKET, { public: false });
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(`Could not create the backups bucket: ${error.message}`);
    }
  } else if (bucket.public) {
    throw new Error('The "backups" storage bucket is public. Make it private in Supabase first.');
  }

  const backup = await buildCrmBackup(supabase);
  const compressed = gzipSync(Buffer.from(JSON.stringify(backup)));
  const path = `crest-crm-backup-${backup.exportedAt.slice(0, 10)}.json.gz`;

  const { error: uploadError } = await supabase.storage
    .from(BACKUP_BUCKET)
    .upload(path, compressed, { contentType: "application/gzip", upsert: true });
  if (uploadError) throw new Error(`Could not save the backup: ${uploadError.message}`);

  // Remove backups past the retention period.
  const { data: files } = await supabase.storage.from(BACKUP_BUCKET).list("", { limit: 1000 });
  const cutoff = new Date(Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const expired = (files ?? [])
    .map((file) => file.name)
    .filter((name) => {
      const date = name.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
      return date !== undefined && date < cutoff;
    });
  if (expired.length) {
    await supabase.storage.from(BACKUP_BUCKET).remove(expired);
  }

  return { path, bytes: compressed.length, counts: backup.counts, removed: expired.length };
}
