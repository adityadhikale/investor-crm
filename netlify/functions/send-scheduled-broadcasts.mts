// Netlify scheduled function: every 5 minutes, asks the site to send any
// scheduled broadcasts that are now due. The sending itself happens in the
// secret-protected /api/broadcasts/trigger route (lib/broadcast-dispatch.ts).
// Scheduled functions only run on the published production deploy.

export default async function sendScheduledBroadcasts() {
  const siteUrl = process.env.URL;
  const secret = process.env.SCHEDULER_SECRET;
  if (!siteUrl || !secret) {
    console.error("[scheduled-broadcasts] URL or SCHEDULER_SECRET is not set.");
    return;
  }

  const response = await fetch(`${siteUrl}/api/broadcasts/trigger`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
  const summary = await response.text();
  console.log(`[scheduled-broadcasts] ${response.status} ${summary.slice(0, 500)}`);
}

export const config = {
  schedule: "*/5 * * * *",
};
