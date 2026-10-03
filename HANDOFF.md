# CREST CRM — HANDOFF / CONTEXT
## Updated: 3 October 2026 (evening)

You are continuing development of an internal single-user Investor CRM for CREST Capital Management. This document is the source of truth for context — read it fully before suggesting any changes.

**CURRENT PHASE:** the security/performance pass (old §10) is **done**, and a large batch of WhatsApp, broadcast, email and backup features was added on 3 Oct (see §4). Next: finish the open items in §9, then **step-wise testing** from a list Aditya will provide (§11).

IMPORTANT:
- The project is substantially built. DO NOT rebuild existing functionality.
- Work incrementally, one scoped feature at a time. Build, then verify (type-check, lint, `npm run build`, and a safe real test where possible) before reporting.
- The user (Aditya) is non-technical — he copy-pastes prompts into an AI coding assistant and screenshots Meta/Netlify/Supabase screens when stuck. He does not write code. Keep instructions as short numbered steps with exact click paths.
- **Commit/push policy:** only when Aditya asks. "Commit and push" means **both remotes** (§1). Confirm before any destructive git operation.
- **Database changes:** migrations are not auto-applied. Write a migration file and ask Aditya to paste it into the Supabase SQL Editor. Make code tolerate the column/table being missing until he has, or tell him to run the SQL **before** deploying.
- **Secrets:** never ask Aditya to paste tokens/keys/passwords into chat and never repeat them. He has pasted some anyway (a temporary token, the Meta app secret in a screenshot — since reset — and the CRM login password on 3 Oct, which he should change). Keys go straight into `.env.local` and Netlify environment variables.
- **Never send real WhatsApp messages or emails to people while testing** unless Aditya asks. Safe tests: contacts with no 24-hour window (plain text is skipped), invalid 8-digit phone numbers, made-up numbers through the signed local webhook. Clean up test rows afterwards.
- **Read `node_modules/next/dist/docs/`** before writing Next.js code (see `AGENTS.md`) — Next.js 16 with breaking changes.
- **Privacy:** Aditya does not want his name/email shown to CRM users. Code uses neutral examples ("Rahul Sharma", rahul@example.com). The only remaining place is the public privacy page (§9).

---

# 1. PROJECT & HOSTING

- Live site: **https://investor-crm.netlify.app** (Netlify, free plan). Local repo: `A:\CREST\CRM\investor-crm`.
- GitHub (org): `https://github.com/crest-capital-management/investor-crm` — remote `origin`.
- GitHub (personal copy): `https://github.com/adityadhikale/investor-crm` — remote `personal`. **Netlify builds from this copy** (Vercel Hobby can't deploy org repos).
- Branch `master`. After every commit: `git push origin master` and `git push personal master`; check both heads match before telling Aditya to redeploy (Netlify → Deploys → Trigger deploy → Deploy site).
- Restore point before the 3 Oct work: tag `pre-optimization-2026-10-03` (on both remotes).
- Supabase project ref: `fyesxkvfgwurejqsobdq` (free plan: 500 MB database, 1 GB storage, **no downloadable backups** — hence §4 backups).
- Windows machine; no Python (use `node`). Repo files use CRLF. **Bash heredocs in this environment mangle backslashes and can break on apostrophes** — write scripts/long code to a scratch file with the Write tool and run/append with `node`.
- Dev server: `investor-crm-dev` in `.claude/launch.json` (port 3000). It sometimes stops (e.g. after network drops or package changes) — restart it.
- The in-app browser pane can log in to **localhost** but **cannot log in to the live site** (it blocks `*.supabase.co`). Aditya tests the live site in his own browser and sends screenshots.

---

# 2. TECH STACK

- Next.js **16.3.8** (patched for GHSA-vcvr-r3jv-pc5j), App Router, TypeScript, Turbopack; React 19.2.8.
- Supabase Postgres + Auth + Storage. Buckets: `whatsapp-media` (**public**; outgoing files and `inbound/<mediaId>.<ext>` incoming files) and `backups` (**private**, created by the first backup).
- shadcn/ui on Base UI (all dropdowns use the app's `Select`; no native `<select>` left), Tailwind v4, date-fns, react-day-picker, recharts.
- Meta WhatsApp Cloud API (direct). Graph API v25.0 in code.
- Google Gemini (`gemini-3.6-flash`, fallback `gemini-flash-lite-latest`) for AI summary, follow-up suggestion, voice-note transcription.
- **Resend** for email (configured 3 Oct). `exceljs` for imports.
- `proxy.ts` protects routes; every private page also calls `requireAuth()`; every server action calls `requireActionAuth()`.
- Security headers in `next.config.ts` (nosniff, Referrer-Policy, X-Frame-Options DENY, Permissions-Policy). No CSP yet.
- Font `public/fonts/Maharlika-Regular.ttf` for the logo (licence for commercial use **unconfirmed**). Geist Mono and Playfair are not preloaded.

---

# 3. DATABASE & SECURITY

**Tables:** `contacts`, `groups`, `contact_groups`, `interactions`, `follow_ups`, `whatsapp_messages`, `broadcasts`, `broadcast_recipients`, `templates`, `app_settings`.

Notable columns / rules:
- `contacts`: soft delete (`deleted_at`) for **both** single and bulk delete (bulk was hard delete until 3 Oct). Email is **optional**. Phones stored as digits; Indian numbers as 10 digits, `+91` added at send time; foreign numbers kept whole (e.g. a UAE `971…` contact exists).
- `whatsapp_messages`: + `phone` (sender's number, local form) and `profile_name` (sender's WhatsApp name) — used for unknown numbers. `media_url` is our own stored copy; old/failed ones may be `meta_media_id:<id>` or a Meta lookaside URL (see `lib/media-ref.ts`).
- `broadcasts`: status `draft | scheduled | sending | sent` (check constraint), `template_id`, `variable_mappings`, `send_summary` jsonb (counts + skipped names + failures).
- `broadcast_recipients`: one row per recipient (`pending → sending → sent | skipped | failed`), unique `(broadcast_id, contact_id)`; claimed in batches by SQL function `claim_broadcast_recipients(p_broadcast_id, p_limit)` (FOR UPDATE SKIP LOCKED).
- `templates`: `meta_template_id`, `approved_at`, `language`, `variables` (sample values). Rows with `meta_template_id` are Meta templates (view-only in the CRM); without it, CRM-only templates.
- `app_settings` (single row `default`): reminder email on/off, recipient, include follow-ups/unread; bell preferences.
- `unread_conversations()` SQL function: contacts with inbound messages newer than `last_read_at` and our last outbound.

**Migrations — all applied by Aditya as of 3 Oct 2026:**
`20260929000000_add_notes_to_contacts`, `20260930000000_add_unread_messages`, `20260930010000_add_app_settings`, `20261002000000_lock_down_to_owner`, `20261003000000_add_performance_indexes`, `20261003010000_add_phone_to_whatsapp_messages` (phone + profile_name), `20261003020000_add_send_summary_to_broadcasts`, `20261003030000_add_broadcast_recipients` (table, `sending` status, claim function).

**Row-level security:** every table (including `broadcast_recipients`) has one policy "Owner only" → `public.is_crm_owner()` (user id `ff04929a-ae33-454b-8f18-0c81a4059022`, login `test@example.com`). **Supabase public sign-up is disabled** — keep it off. The service-role key (`lib/supabase-service.ts`) bypasses RLS and is used by the webhook, scheduled jobs and backup/storage code. Never use the anon key server-side without a session.

**Env vars** (both `.env.local` and Netlify): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET`, `SCHEDULER_SECRET`, `GEMINI_API_KEY`, `REMINDER_EMAIL_TO`, `RESEND_API_KEY` (sending-only key), `RESEND_FROM_EMAIL` (= `CREST CRM <onboarding@resend.dev>` until the domain is verified). `netlify.toml` omits expected secrets-scan hits (public Supabase keys, `REMINDER_EMAIL_TO`, the Turbopack cache, and `HANDOFF.md` which names WhatsApp IDs).

**Current data (3 Oct):** 5 contacts (Aditya Dhikale, Aditya Dhikale (UAE), Ali, Atharva Sirsalewala, Vedant), a few test broadcasts, 2 templates (`crm_welcome` CRM-only; `investor_invitation` Meta, pending), 1 follow-up. Aditya's ~1518 contacts still need re-importing (§9).

---

# 4. WHAT'S BUILT

Earlier: contacts (CSV/Excel import), notes, investor pipeline, meeting notes + follow-ups, groups, broadcasts + templates, WhatsApp history with AI summary/reply/media, AI follow-up suggestions, voice-note transcription, dashboard, tags + sidebar, pagination (100/page), Unread Messages + badge, notification bell, settings/dark mode, privacy policy page, CSV and JSON downloads.

## Added 3 Oct 2026
1. **Security/performance pass** (old §10): Next patch; scheduler-only functions moved out of `"use server"` files (`lib/follow-up-reminders.ts`, `lib/broadcast-dispatch.ts`); webhook signature check constant-time and **fails closed in production**; trigger routes compare `SCHEDULER_SECRET` in constant time; PostgREST search filters quoted (`lib/postgrest-filter.ts`); security headers; `shadcn` moved to devDependencies; polling pauses when the tab is hidden (`lib/visible-interval.ts`); dashboard fetches only the 8 rows it shows; performance indexes; fonts not preloaded.
2. **Unread badges** on Contacts/Investors lists and a "N new" badge on WhatsApp History (`components/unread-badge.tsx`, `lib/unread.ts`).
3. **Scheduled broadcasts work**: Netlify scheduled function every 5 min (`netlify/functions/send-scheduled-broadcasts.mts`) → `/api/broadcasts/trigger`.
4. **Batched broadcast sending** (`lib/broadcast-dispatch.ts`): start = claim status → `sending` + insert recipient rows; process = claim 20 at a time, send 5 in parallel, within a time budget (Send Now 40 s/request, scheduler 22 s/run); stale `sending` rows (>10 min) → `failed` "interrupted", never resent; when all done → status `sent` + `send_summary`. Send Now loops in the browser with a progress line; closing the page is fine (scheduler continues). Tested with 300 dummy recipients and two concurrent runs: no duplicates.
5. **Delivery report**: count under "Sent" in the list and a Delivery box on the broadcast page (skipped names, failures with reasons).
6. **24-hour reply window enforced**: plain text / CRM-template broadcasts **skip** contacts who haven't written in 24 h (reported as skipped). In chat, normal replies/files are hidden and refused server-side when the window is closed; only approved Meta templates can be sent.
7. **Meta templates**: Templates → "Sync from Meta" imports templates (body variables only; skips media headers, variable URLs, `hello_world`, auth templates). Approved ones are sent as real WhatsApp templates in broadcasts (incl. scheduled) and from chat. Unapproved ones are disabled in pickers. CRM "+ New Template" creates **CRM-only** templates (plain text, 24-hour window) — this split is intentional (Aditya creates Meta templates in WhatsApp Manager).
8. **Chat redesign** (`components/whatsapp-history.tsx`): WhatsApp-style bubbles, day separators, compact header with countdown ("Xh Ym left to reply"), refresh every 30 s while open, scroll to newest, bigger "View Full History" button. **Send template** picker (`components/send-template-form.tsx`) with Meta and CRM groups and a confirmation step.
9. **Unknown numbers**: webhook stores sender phone + WhatsApp name; Unread Messages has an "Unknown numbers" section with **Save contact** (pre-filled Add Contact); adding/editing/importing a contact links earlier messages (`lib/link-messages.ts`); bell, badge and reminder email include them.
10. **Incoming media**: webhook downloads every photo/voice/audio/video/document by media ID and stores our copy (`lib/inbound-media.ts`); never stores Meta's `url` (it needs our token). `/api/whatsapp/media/[id]` fetches on first open for old references. Chat shows photos inline, audio/video players, file links.
11. **Daily reminder email** at 10:00 AM IST (`netlify/functions/send-daily-reminder.mts` → `/api/follow-ups/trigger`): due/overdue follow-ups, unread conversations, unknown numbers; skipped when nothing to report. "Send test reminder email" always sends. Verified delivered to Aditya's inbox.
12. **Nightly backups** at 3:00 AM IST (`netlify/functions/daily-backup.mts` → `/api/backup/trigger`, `lib/backup.ts`): all tables incl. soft-deleted rows, gzipped, private `backups` bucket, 30-day retention. My Profile lists them (signed download links) with "Back up now". No in-app Restore — restore manually from a backup if ever needed.
13. **Follow-ups for every contact** (investor-only rule removed). **Email optional** for contacts. **Bulk delete is soft.** Neutral sample contact in the broadcast preview.

---

# 5. META / WHATSAPP SETUP

- App `CREST-CRM` (ID `973294598468351`), **Live**, portfolio `1385596579928121` ("CREST Capital Management", **not business-verified** → low limits, roughly 250 new business-initiated conversations/day).
- WhatsApp Business Account "Crest Investment Management" `1092796546468247`. Number **+91 91374 09245**, Phone Number ID `1352056234657893`, CONNECTED/GREEN.
- `WHATSAPP_ACCESS_TOKEN`: System User token, never expires, can send messages and read/manage templates. After any app-secret reset, regenerate it and update `.env.local` + Netlify, then redeploy.
- Webhook: `https://investor-crm.netlify.app/api/whatsapp/webhook`, field `messages`, verify token `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, signature checked with `META_APP_SECRET`.
- Templates: `investor_invitation` (Marketing, `en`, `{{1}}` = first name, quick replies "Yes, tell me more" / "Not now") **PENDING** at Meta when last checked. `hello_world` only works from Meta test numbers (error 131058) — skipped by sync.
- Template messages cost money: a **payment method** must be added in WhatsApp Manager.
- Open Meta problems (not code): restricted portfolio `1066955262606783`; old WhatsApp account `1755324759049717` not visible; unclear which portfolio is "verified"; support case open. Don't onboard the boss's number (Coexistence) until resolved.

---

# 6. LOCAL TOOLS

- ngrok installed but not needed (Meta calls Netlify). Local webhook tests: POST to `http://localhost:3000/api/whatsapp/webhook` with `x-hub-signature-256` = HMAC-SHA256 of the raw body with `META_APP_SECRET`. Real Meta messages only reach the **live** site.
- Scheduler routes can be called locally with `Authorization: Bearer <SCHEDULER_SECRET>`: `/api/broadcasts/trigger`, `/api/follow-ups/trigger`, `/api/backup/trigger`.

---

# 7. KNOWN LIMITATIONS / GAPS

1. **No delivery status**: "sent" = accepted by Meta. Delivered/read/failed webhook statuses are only logged (no wamid stored). Candidate next feature (ticks in chat).
2. **Meta limits**: unverified business ≈ 250 new conversations/day; template broadcasts above that will fail per recipient (shown in the delivery report).
3. **Broadcast speed**: Send Now ≈ 250 recipients per request (~4–6 min for 1,500 with the page open); scheduler alone ≈ 130 per 5-min run.
4. `whatsapp-media` bucket is **public** (anyone with a link can open files). Making it private needs signed URLs — ask Aditya first.
5. Backups live in the same Supabase project — also download one occasionally.
6. Deleting contacts can leave a group empty; CSV import doesn't validate tags.
7. Pre-existing lint warning: `<img>` in `components/whatsapp-history.tsx`.
8. Netlify injects a toolbar script that causes a harmless React #418 console error on the live site.
9. Messages from unknown numbers received **before** 3 Oct have no phone stored and can't be linked automatically.

---

# 8. NETLIFY NOTES

- Build: `npm run build` (Next.js runtime). Scheduled functions in `netlify/functions/` (3: broadcasts every 5 min, reminder 04:30 UTC, backup 21:30 UTC) run only on the published deploy; check "Functions bundling" in the deploy log.
- Secrets scan fails the deploy on expected hits — handled in `netlify.toml`; the "exit code 2" line is the scan, read the lines above it. Don't disable scanning.
- New/changed env vars apply only after a new deploy.

---

# 9. ROADMAP / NEXT STEPS

- ⏳ **Media test**: Aditya to send a new photo, voice note and PDF; confirm `media_url` is a stored `inbound/…` copy (one repaired photo already works).
- ⏳ **Privacy policy email**: `app/privacy-policy/page.tsx` `CONTACT_EMAIL` is still Aditya's work email; needs a real non-personal address (e.g. a privacy@ alias) from Aditya.
- ⏳ Aditya: change the CRM login password (shared in chat); Meta template approval + payment method + business verification + support case; Resend domain `crest-group.co` (DNS at GoDaddy in an account Aditya doesn't have — ask whoever set up Google Workspace; then set `RESEND_FROM_EMAIL` to `CREST CRM <reminders@crest-group.co>`); re-import contacts; confirm the Maharlika font licence.
- Optional builds: delivery ticks (store wamid + status from webhook), private media bucket, restore-from-backup button, group-empty guard, tag validation on import.
- Then §11 testing.

Do NOT start a "Recently Deleted" restore UI, or onboard the boss's real number, without Aditya explicitly asking.

---

# 11. TESTING (pending — Aditya will give the list, step by step)

Work through it one item at a time: tell him exactly what to do, verify on your side where possible (database via the service key, webhook, token). He logs in himself.

Baseline smoke checks (dev server and live):
1. Login/logout; `/contacts` logged out → `/login`; `/privacy-policy` opens without login.
2. Contacts: 100/page, search, tag filter, add (email optional), edit, delete (soft), bulk delete (soft), import CSV/Excel.
3. Groups: create needs ≥1 contact; last member can't be removed.
4. Investors and contact pages; notes; follow-ups on any contact; Suggest with AI; voice-note upload; AI summary.
5. WhatsApp: chat bubbles + countdown; reply only inside the window; Send template (Meta/CRM); inbound text/photo/voice/PDF; unknown numbers → Save contact.
6. Broadcasts: custom/CRM/Meta template, Send Now progress, scheduled, delivery report, skipped people. Only send to real people when Aditya asks.
7. Dashboard; dark mode; My Profile settings, test reminder email, downloads, automatic backups.
8. Phone width; no console errors.

Scripted security checks (read-only; keys from `.env.local`, never printed):
- Anon key reads 0 rows from every table; anon insert into `whatsapp_messages` fails.
- `GET <SUPABASE_URL>/auth/v1/settings` → `disable_signup: true`.
- Webhook: unsigned → 401, wrong signature → 401, correctly signed test payload accepted (delete test rows).
- Trigger routes with a wrong secret → 401. Backups bucket not readable publicly or with the anon key.
