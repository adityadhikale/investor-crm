// Netlify scheduled function: every day at 10:00 AM India time (04:30 UTC),
// asks the site to email the daily reminder (due follow-ups + unread WhatsApp
// messages). The work happens in the secret-protected /api/follow-ups/trigger
// route, which respects the on/off switch and recipient set on /my-profile.
// Scheduled functions only run on the published production deploy.

export default async function sendDailyReminder() {
  const siteUrl = process.env.URL;
  const secret = process.env.SCHEDULER_SECRET;
  if (!siteUrl || !secret) {
    console.error("[daily-reminder] URL or SCHEDULER_SECRET is not set.");
    return;
  }

  const response = await fetch(`${siteUrl}/api/follow-ups/trigger`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
  const summary = await response.text();
  console.log(`[daily-reminder] ${response.status} ${summary.slice(0, 500)}`);
}

export const config = {
  // Cron runs in UTC: 04:30 UTC = 10:00 IST.
  schedule: "30 4 * * *",
};
