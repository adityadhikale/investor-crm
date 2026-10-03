// Netlify scheduled function: every night at 3:00 AM India time (21:30 UTC),
// saves a full compressed backup of the CRM to the private "backups" storage
// bucket and removes backups older than 30 days (see lib/backup.ts).
// Scheduled functions only run on the published production deploy.

export default async function dailyBackup() {
  const siteUrl = process.env.URL;
  const secret = process.env.SCHEDULER_SECRET;
  if (!siteUrl || !secret) {
    console.error("[daily-backup] URL or SCHEDULER_SECRET is not set.");
    return;
  }

  const response = await fetch(`${siteUrl}/api/backup/trigger`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
  const summary = await response.text();
  console.log(`[daily-backup] ${response.status} ${summary.slice(0, 500)}`);
}

export const config = {
  // Cron runs in UTC: 21:30 UTC = 3:00 AM IST.
  schedule: "30 21 * * *",
};
