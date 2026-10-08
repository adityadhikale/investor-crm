# CREST CRM — HANDOFF / CONTEXT
## Updated: 8 October 2026

You are continuing development of an internal single-user Investor CRM for CREST Capital Management. This document is the source of truth for context — read it fully before suggesting any changes.

**CURRENT PHASE:** the build is feature-complete for now. On 5–6 Oct a second large batch was added (§4, items 18–29): PDF auto-reply, loading screens, Brevo email, duplicate protection, broadcast delivery results + retry, the final tag list, owner checks, error pages, direct file uploads with signed links, merged detail components. **Open: deploy the latest push and run the pending SQL (§3), then the Meta billing / Business Verification blocker (§5).** The three `CRM_*_DOCUMENTATION` files (.md and .docx) and `CREST-CRM-PRD.docx` in the project root are snapshots from early 6 Oct and are slightly behind items 21–29; they are not committed.

IMPORTANT:
- The project is substantially built. DO NOT rebuild existing functionality.
- Work incrementally, one scoped feature at a time. Build, then verify (type-check, lint, `npm run build`, and a safe real test where possible) before reporting.
- The user (Aditya) is non-technical — he copy-pastes prompts into an AI coding assistant and screenshots Meta/Netlify/Supabase screens when stuck. He does not write code. Keep instructions as short numbered steps with exact click paths.
- **Commit/push policy:** only when Aditya asks. "Commit and push" means **both remotes** (§1). Confirm before any destructive git operation.
- **Database changes:** migrations are not auto-applied. Write a migration file and ask Aditya to paste it into the Supabase SQL Editor. Make code tolerate the column/table being missing until he has, or tell him to run the SQL **before** deploying.
- **Secrets:** never ask Aditya to paste tokens/keys/passwords into chat and never repeat them. He has pasted some anyway (a temporary token, the Meta app secret in a screenshot — since reset — and the CRM login password on 3 Oct, which he should change). Keys go straight into `.env.local` and Netlify environment variables.
- **Never send real WhatsApp messages or emails to people while testing** unless Aditya asks. Safe tests: contacts with no 24-hour window (plain text is skipped), invalid 8-digit phone numbers, made-up numbers through the signed local webhook. Clean up test rows afterwards.
- **Read `node_modules/next/dist/docs/`** before writing Next.js code (see `AGENTS.md`) — Next.js 16 with breaking changes.
- **Privacy:** Aditya does not want his name/email shown to CRM users or the public. Code uses neutral examples ("Rahul Sharma", rahul@example.com). The public privacy page (`app/privacy-policy/page.tsx`) uses the company address **info@crest-group.co** (changed 5 Oct); its Contact us section lists the company name, website and registered office from the company policy document. Do not put a personal name or email in the app.

---

# 1. PROJECT & HOSTING

- Live site: **https://investor-crm.netlify.app** (Netlify, free plan). Local repo: `A:\CREST\CRM\investor-crm`.
- GitHub (org): `https://github.com/crest-capital-management/investor-crm` — remote `origin`.
- GitHub (personal copy): `https://github.com/adityadhikale/investor-crm` — remote `personal`. **Netlify builds from this copy** (Vercel Hobby can't deploy org repos).
- Branch `master`. After every commit: `git push origin master` and `git push personal master`; check both heads match before telling Aditya to redeploy (Netlify → Deploys → Trigger deploy → Deploy site).
- Restore point before the 3 Oct work: tag `pre-optimization-2026-10-03` (on both remotes).
- Supabase project ref: `fyesxkvfgwurejqsobdq` (free plan: 500 MB database, 1 GB storage, **no downloadable backups** — hence §4 backups).
- Windows machine; no Python (use `node`). Repo files use CRLF. **Bash heredocs in this environment mangle backslashes and can break on apostrophes** — write scripts/long code to a scratch file with the Write tool and run/append with `node`.
- Dev server: `investor-crm-dev` in `.claude/launch.json` (port 3000), started with the preview tool (`preview_start`) or `npm run dev`. It sometimes stops (network drops, package changes) — restart it. **Don't run `npm run build` while the dev server is running**: both write to `.next` and the dev server's workers crash ("Jest worker encountered 2 child process exceptions") or its generated types get corrupted. Fix: stop the dev server, delete the `.next` folder, start it again. `npx tsc --noEmit` errors under `.next/dev/types` mean the same corruption, not a code bug.
- The in-app browser pane can log in to **localhost** but **cannot log in to the live site** (it blocks `*.supabase.co`). Aditya tests the live site in his own browser and sends screenshots.

---

# 2. TECH STACK

- Next.js **16.3.8** (patched for GHSA-vcvr-r3jv-pc5j), App Router, TypeScript, Turbopack; React 19.2.8.
- Supabase Postgres + Auth + Storage. Buckets: `whatsapp-media` (outgoing files at `<contactId>/<ts>-<name>` and incoming `inbound/<mediaId>.<ext>`; **public until migration `20261006020000` is run after the deploy, then private** — files are always opened through `/api/whatsapp/media/[id]`, which signs a short-lived link) and `backups` (**private**, created by the first backup).
- shadcn/ui on Base UI (all dropdowns use the app's `Select`; no native `<select>` left), Tailwind v4, date-fns, react-day-picker, recharts.
- Meta WhatsApp Cloud API (direct). Graph API v25.0 in code.
- Google Gemini (`gemini-3.6-flash`, fallback `gemini-flash-lite-latest`) for AI summary, follow-up suggestion, voice-note transcription.
- Email: `lib/resend.ts` sends through **Brevo** when `BREVO_API_KEY` + `BREVO_SENDER_EMAIL` are set (must be a v3 **API key** starting `xkeysib-`, NOT an SMTP key `xsmtpsib-`; in Brevo → Security → Authorised IPs, blocking for **API keys must stay deactivated** because Netlify's IPs change), otherwise **Resend** (can only email the Resend account owner until a domain is verified). `exceljs` for imports.
- `proxy.ts` protects every private page (incl. broadcasts, templates, unread-messages); every private page also calls `requireAuth()`; every server action calls `requireActionAuth()`; service-role actions (backups, test reminder) call `requireOwnerAction()` (checks `is_crm_owner()`).
- Security headers in `next.config.ts` (nosniff, Referrer-Policy, X-Frame-Options DENY, Permissions-Policy). No CSP yet.
- Font `public/fonts/Maharlika-Regular.ttf` for the logo (licence for commercial use **unconfirmed**). Geist Mono and Playfair are not preloaded.

---

# 3. DATABASE & SECURITY

**Tables:** `contacts`, `groups`, `contact_groups`, `interactions`, `follow_ups`, `whatsapp_messages`, `broadcasts`, `broadcast_recipients`, `templates`, `app_settings`. Their original CREATE TABLEs are recorded (idempotent, reference only) in `supabase/migrations/20260101000000_baseline_schema.sql`.

Notable columns / rules:
- **Tags** (`lib/tags.ts`, one list): Existing PMS Investors, Existing RIA Investors, Shareholders, FMS, EO, GRI, Miscellaneous, IFA, Distributors, Leads — nothing else is offered. A contact can have several; add via the "+" in Contact Details (dialog), remove via a tag's ✕ (with a confirmation window), the edit form keeps the other tags. The Investors page/count shows contacts with `Existing PMS Investors` or `Existing RIA Investors` (`INVESTOR_TAGS`, `.overlaps`).
- `contacts`: soft delete (`deleted_at`) for **both** single and bulk delete (bulk was hard delete until 3 Oct). Email is **optional**. Phones are saved and compared in one canonical form (`normalizeToLocalPhone`): `919876543210`, `+91 98765 43210`, `09876543210` and `9876543210` are the same number; Indian numbers are 10 digits (`+91` added at send time), foreign numbers kept whole.
- `whatsapp_messages`: **every message now stores its WhatsApp message ID `wamid`** (inbound too; duplicates are skipped by ID; a unique partial index makes it a hard rule once `20261006000000` is applied). + `phone` (sender's number, local form) and `profile_name` (sender's WhatsApp name) — used for unknown numbers. `media_url` is our own stored copy; old/failed ones may be `meta_media_id:<id>` or a Meta lookaside URL (see `lib/media-ref.ts`).
- `broadcasts`: status `draft | scheduled | sending | sent` (check constraint), `template_id`, `variable_mappings`, `send_summary` jsonb (counts + skipped names + failures).
- `broadcast_recipients`: + `wamid` (the recipient's WhatsApp message ID, used for the "After sending" results). One row per recipient (`pending → sending → sent | skipped | failed`), unique `(broadcast_id, contact_id)`; claimed in batches by SQL function `claim_broadcast_recipients(p_broadcast_id, p_limit)` (FOR UPDATE SKIP LOCKED).
- `templates`: `meta_template_id`, `approved_at`, `language`, `variables` (sample values). Rows with `meta_template_id` are Meta templates (view-only in the CRM); without it, CRM-only templates.
- `app_settings` (single row `default`): reminder email on/off, recipient, include follow-ups/unread; bell preferences.
- `unread_conversations()` SQL function: contacts with inbound messages newer than `last_read_at` and our last outbound.

**Migrations — applied by Aditya through 4 Oct unless marked:**
`20260929000000_add_notes_to_contacts`, `20260930000000_add_unread_messages`, `20260930010000_add_app_settings`, `20261002000000_lock_down_to_owner`, `20261003000000_add_performance_indexes`, `20261003010000_add_phone_to_whatsapp_messages` (phone + profile_name), `20261003020000_add_send_summary_to_broadcasts`, `20261003030000_add_broadcast_recipients` (table, `sending` status, claim function), `20261004000000_add_message_delivery_status` (`whatsapp_messages.wamid`, `status`, `status_error`, `status_at`).
Added 8 Oct: `20261008000000_chat_list_and_realtime` (**PENDING — run in the SQL Editor; code works without it**). Added 6 Oct: `20260101000000_baseline_schema` (reference only, safe no-op), `20261006000000_unique_whatsapp_wamid` (**confirm it was run**), `20261006010000_add_wamid_to_broadcast_recipients` (**applied**), `20261006020000_make_whatsapp_media_private` (**PENDING — run only AFTER the matching deploy**, otherwise chat images stop loading; undo = set `public = true`).

**Row-level security:** every table (including `broadcast_recipients`) has one policy "Owner only" → `public.is_crm_owner()` (user id `ff04929a-ae33-454b-8f18-0c81a4059022`, login `test@example.com`). **Supabase public sign-up is disabled** — keep it off. The service-role key (`lib/supabase-service.ts`) bypasses RLS and is used by the webhook, scheduled jobs and backup/storage code. Never use the anon key server-side without a session.

**Env vars** (both `.env.local` and Netlify): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET`, `SCHEDULER_SECRET`, `GEMINI_API_KEY`, `REMINDER_EMAIL_TO`, `RESEND_API_KEY` (sending-only key), `RESEND_FROM_EMAIL` (= `CREST CRM <onboarding@resend.dev>` until the domain is verified), `BREVO_API_KEY` + `BREVO_SENDER_EMAIL` (set 6 Oct; reminder email now sends via Brevo from the verified sender; optional `BREVO_SENDER_NAME`). `netlify.toml` omits expected secrets-scan hits (public Supabase keys, `REMINDER_EMAIL_TO`, the Turbopack cache, and `HANDOFF.md` which names WhatsApp IDs).

**Current data (6 Oct):** about 1,524 contacts (almost all tagged `Leads`), test broadcasts, templates `crm_welcome` (CRM-only) and `crest_inital_invitation` (Meta, approved; Meta's spelling), plus follow-ups. Aditya said he will delete the contact data and re-import; do not rely on or protect the current rows.

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

## Added 4–5 Oct 2026
14. **WhatsApp delivery status tracking** (`lib/message-status.ts`): every outgoing message (chat reply, file, template send, broadcast) saves Meta's message ID (`wamid`) with status `sent`; the webhook applies Meta's delivery reports (delivered/read/failed + error code; a message never moves backwards, a failure is final). Common error codes get plain-language reasons (131049 marketing limit, 131026 not on WhatsApp, 131042 payment problem…). Chat bubbles show ticks (✓ sent, ✓✓ delivered, blue ✓✓ read) or a red "Not delivered" with the reason. Messages sent before 4 Oct have no status. Tested with fake signed status reports, and for real (it caught the 131042 payment error on Vedant's message).
15. **Notification bell dismissal** (`components/notification-bell.tsx`): opening an item, its ✕, or "Clear all" dismisses it on that device (localStorage; key includes the item's last-activity time so new activity re-shows it). The red count drops with dismissed items that needed action. Dismissed follow-ups stay pending on the dashboard and in the email.
16. **Dropdown fix**: the shared `Select` menu now uses z-index 100 so it opens above full-screen layers (CSV import mapping screen is `fixed z-[60]`).
17. **Privacy policy page** uses the company address **info@crest-group.co** and has an 11. Contact us section (company name, https://www.crest-capital.com, registered office). The company's own long policy document lists `ig@crest-group.co` and covers KYC/AA/portfolio management — the CRM page deliberately describes only what the CRM does. No personal name/email anywhere in the app.

## Added 5–6 Oct 2026
18. **PDF auto-reply** (`lib/auto-reply.ts`, called from the webhook after an inbound `button` message is saved): tapping **"Send details first"** on a message we sent whose saved text contains "CREST Family Office Advisory" (checked by the replied-to `wamid`) sends `public/crest-company-details.pdf` as a WhatsApp document by link (`https://investor-crm.netlify.app/...`). Only that button, only that template. Needs the template approved + synced and sent from the CRM so its `wamid` is logged. Not yet tested live.
19. **Loading screens**: `components/loading-screen.tsx` (one-colour animated bars, follows the theme) used by a `loading.tsx` in every route folder (a single root file does not show between sibling routes). Next 16: error boundaries get `retry`, not `reset`.
20. **Email via Brevo** (see §2). Reminder email verified working; Gmail shows a warning banner until `crest-group.co` is authenticated in Brevo (DNS).
21. **Duplicate protection**: canonical phone comparison for add/edit/import; webhook skips a message whose `wamid` is already stored, stores inbound `wamid`, treats a unique-violation as a duplicate, and **answers 500 when a message can't be saved so Meta retries** (safe because of the ID check); outbound/echo race handled in `insertOutboundMessage`.
22. **Broadcasts**: status badge says "Not delivered / Nobody reached / Partly sent" when appropriate; a `sending` broadcast can't be deleted; **"After sending" panel** (`lib/broadcast-delivery.ts`) shows delivered/read/waiting/not delivered per person from WhatsApp's reports, with a red **billing-problem banner** for code 131042; **"Retry failed"** button (`retryFailedBroadcastRecipients`) resends only recipients WhatsApp refused (never invalid numbers or "interrupted" ones, to avoid double sends).
23. **Templates sync** now hides CRM copies of Meta templates that were deleted at Meta (CRM-only templates untouched).
24. **Security/robustness**: `requireOwnerAction()` on backup + test-reminder actions; `proxy.ts` covers all private pages; friendly `app/error.tsx`, `app/not-found.tsx`, `app/global-error.tsx`; plain-language server errors (details go to the log); delete messages no longer promise a restore.
25. **Files**: the browser uploads attachments straight to Supabase Storage via a signed upload target (`prepareWhatsAppMediaUpload` → storage → `sendWhatsAppMediaFromStorage`), so the ~6 MB Netlify request cap no longer applies to chat files (16 MB Meta limit applies). Excel import and voice-note upload still go through server actions, so they are capped at **5 MB**. The chat opens every stored file through `/api/whatsapp/media/[id]` (signed link), which is what lets the bucket be private.
26. **Add Tag bug fixed** (one state was used for both "dialog open" and "saving").
27. **Merged components**: `components/investor-detail.tsx` is now a thin wrapper around `ContactDetail variant="investor"`; dead code removed (`getWhatsAppMessages`, unused webhook exports).
28. **Documents** (not committed): `CRM_FRONTEND_DOCUMENTATION`, `CRM_BACKEND_DOCUMENTATION`, `CRM_DATABASE_DOCUMENTATION` (.md + .docx) and `CREST-CRM-PRD.docx`; generated 6 Oct, before items 21–27 were finished.

## Added 8 Oct 2026
29. **Login page never scrolls**: compact layout on short screens via a `short` Tailwind variant (`@custom-variant short (@media (max-height: 700px))` in `app/globals.css`); checked at 1093x530, 1280x720 and 375x667.
30. **Instant search** (`components/contacts-explorer.tsx`, `lib/contact-search.ts`, `app/api/contacts/index/route.ts`): the Contacts page loads every active contact once (`/api/contacts/index`, kept in memory for the session and refreshed on new messages, focus, and after edits) and then searches, tag-filters and pages entirely in the browser on every keystroke (ranked: word-start in name, phone digits incl. +91/0 prefixes, email). Until the list has loaded, the server's page is shown. 5,000 contacts search in 1–16 ms. The URL is kept in sync with `history.replaceState`. Other lists (Investors, Unread, etc.) still search on the server but are faster (below).
31. **Faster server pages**: `requireAuthFast()` (`lib/auth.ts`, uses `auth.getClaims()`, verified locally instead of a network call) on all list/detail pages that only need the DB client; `proxy.ts` also uses `getClaims()`. Pages that show account details (dashboard, my-profile) still use `requireAuth()`. Search debounce 250 → 150 ms.
32. **Chat-style contact order**: contacts show the most recently active chats first with a preview line ("You: …" / message text, and time) — needs migration `20261008000000_chat_list_and_realtime.sql` (adds `contacts.last_message_at/_text/_direction`, an after-insert trigger on `whatsapp_messages`, a backfill). Until it is run, lists fall back to the old order and show no preview. The Investors page uses the same order.
33. **Faster arrival of new messages**: `components/realtime-bridge.tsx` (mounted in `app/layout.tsx`) subscribes to Supabase Realtime on `whatsapp_messages` and fires `MESSAGES_CHANGED_EVENT` / `UNREAD_CHANGED_EVENT`; the open chat refreshes at once, the sidebar badge, bell and contact list reload. Fallback polling is now 10 s (open chat) and 20 s (badge, bell). Realtime needs the same migration (it adds the table to the `supabase_realtime` publication). Messages typed in the WhatsApp **Business app on the phone** only reach the CRM if Coexistence is set up (not done); messages from customers' phones arrive through the webhook and are shown within a second or two once realtime is on.

---

# 5. META / WHATSAPP SETUP

- App `CREST-CRM` (ID `973294598468351`), **Live**, portfolio `1385596579928121` ("CREST Capital Management", **not business-verified** → low limits, roughly 250 new business-initiated conversations/day).
- WhatsApp Business Account "Crest Investment Management" `1092796546468247`. Number **+91 91374 09245**, Phone Number ID `1352056234657893`, CONNECTED/GREEN.
- `WHATSAPP_ACCESS_TOKEN`: System User token, never expires, can send messages and read/manage templates. After any app-secret reset, regenerate it and update `.env.local` + Netlify, then redeploy.
- Webhook: `https://investor-crm.netlify.app/api/whatsapp/webhook`, field `messages`, verify token `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, signature checked with `META_APP_SECRET`.
- Templates: `crest_inital_invitation` (Marketing, approved; body variable `{{1}}` = first name; "Dear {{1}}, This is Girish, founder of Crest Capital…", quick replies Share available slots / Send details first / Not interested — the 2nd submission may still be in review) is synced into the CRM. `investor_invitation` was deleted at Meta (the sync now removes it from the CRM). `hello_world` only works from Meta test numbers (error 131058) — skipped by sync.
- **CURRENT BLOCKER (5 Oct): Meta billing.** Marketing templates to people outside the 24-hour window fail with **error 131042 "payment problem"** (reported by Meta ~7 s after sending; visible in the chat). Adding funds / a payment method (UPI) in Business Manager → Billing & payments → Payment methods → WhatsApp Business accounts → "Crest Investment Management (1092796546468247…)" fails with "Unable to add funds — we've noticed something unusual… try again in 24 hours" (security hold, repeated on 4 and 5 Oct; Meta's chat claimed "postpay, just add a card" but the UPI flow goes straight to a prepaid "Add to balance" screen). Meta's health check says the **business is LIMITED: error 141010 "business has not passed business verification"** (WABA and app are AVAILABLE; tier `TIER_250`, number CONNECTED/GREEN). Next steps for Aditya: one retry later (₹500–1,000 via UPI), open a human billing support case, and **start Business Verification** (Business Settings → Security Center). Free paths still work (replies/CRM templates/broadcasts inside the 24-hour window).
- **System-user permission lesson (5 Oct):** the CRM token belongs to system user **"Employee"**. It must stay assigned to WhatsApp account **Crest Investment Management (1092796546468247)** with **full control** (Business Settings → Accounts → WhatsApp accounts → People, or Users → System users → Employee → Add assets). It lost that access on 5 Oct → every send returned **"Authorization Error" (OAuthException 100)** and the token could only see the "Test WhatsApp Business Account"; re-assigning it fixed it with the same token. Safe check without messaging anyone: POST a template send with a made-up template name to `/{PHONE_NUMBER_ID}/messages` — "(#132001) Template name does not exist" means auth is fine; `debug_token` and `GET /{WABA}?fields=health_status` are also useful.
- There are two WhatsApp accounts named "Crest Investment Management" (`1092796546468247` = the one in use; the other starts `1409201257…`) plus two "Test WhatsApp Business Account"s. Only add billing to the one in use.
- Open Meta problems (not code): restricted portfolio `1066955262606783`; old WhatsApp account `1755324759049717` not visible; unclear which portfolio is "verified"; support case open. Don't onboard the boss's number (Coexistence) until resolved.

---

# 6. LOCAL TOOLS

- ngrok installed but not needed (Meta calls Netlify). Local webhook tests: POST to `http://localhost:3000/api/whatsapp/webhook` with `x-hub-signature-256` = HMAC-SHA256 of the raw body with `META_APP_SECRET`. Real Meta messages only reach the **live** site.
- Scheduler routes can be called locally with `Authorization: Bearer <SCHEDULER_SECRET>`: `/api/broadcasts/trigger`, `/api/follow-ups/trigger`, `/api/backup/trigger`.

---

# 7. KNOWN LIMITATIONS / GAPS

1. Delivery results per broadcast recipient exist from 6 Oct on (item 22); broadcasts sent earlier have no saved message IDs and show no "After sending" panel.
2. **Meta limits**: unverified business ≈ 250 new conversations/day; template broadcasts above that will fail per recipient (shown in the delivery report).
3. **Broadcast speed**: Send Now ≈ 250 recipients per request (~4–6 min for 1,500 with the page open); scheduler alone ≈ 130 per 5-min run.
4. `whatsapp-media` is private only after migration `20261006020000` is run (after the deploy). Old public links stop working at that point.
5. Backups live in the same Supabase project — also download one occasionally.
6. Deleting contacts can leave a group empty; CSV import doesn't validate tags.
7. Chat messages that fail to send are not retried automatically (resend manually); only failed broadcast recipients have a Retry button. Not covered: no contact restore UI (soft-deleted contacts stay in the database), groups can still end up empty, tags are not validated on CSV import, 15 MB+ voice notes/Excel files are refused (5 MB cap). Pre-existing lint warning: `<img>` in `components/whatsapp-history.tsx`.
8. Netlify injects a toolbar script that causes a harmless React #418 console error on the live site.
9. Messages from unknown numbers received **before** 3 Oct have no phone stored and can't be linked automatically.

---

# 8. NETLIFY NOTES

- Build: `npm run build` (Next.js runtime). Scheduled functions in `netlify/functions/` (3: broadcasts every 5 min, reminder 04:30 UTC, backup 21:30 UTC) run only on the published deploy; check "Functions bundling" in the deploy log.
- Secrets scan fails the deploy on expected hits — handled in `netlify.toml`; the "exit code 2" line is the scan, read the lines above it. Don't disable scanning.
- New/changed env vars apply only after a new deploy.

---

# 9. ROADMAP / NEXT STEPS

- ⏳ **Meta billing / verification (blocker, see §5)**: add a payment method (UPI) once Meta's hold lifts, open a human billing case if it persists, start Business Verification. After it works, resend `investor_invitation` to Vedant (9579125718) from his chat on the **live** site and check the tick/"Not delivered" result. Vedant's tests at 12:38 PM (untracked), 1:03 PM and 1:55 PM on 4 Oct all failed with 131042. **Do not keep resending until billing is fixed.**
- ⏳ **After deploying the 6 Oct push**: run `20261006000000` if not yet run, then (after the deploy is live) `20261006020000`; send one real attachment from a chat and open one old image to confirm files still load; send a broadcast to Aditya only and check the "After sending" panel; once the "Send details first" template is approved and synced, tap the button on a test number and check the PDF arrives.
- ⏳ **Media test (inbound)**: Aditya to send a new photo, voice note and PDF to +91 91374 09245; confirm `media_url` is a stored `inbound/…` copy. Needs the system user permission in §5 intact.
- ✅ **Privacy policy contact** is now `info@crest-group.co` (5 Oct). Make sure that mailbox really receives mail: Meta's app settings point at `https://investor-crm.netlify.app/privacy-policy#data-deletion`. The company-wide policy document (Customer Privacy Protection Policy) is broader than this CRM page and lists `ig@crest-group.co`; the CRM page deliberately describes only what the CRM does.
- ⏳ Aditya: change the CRM login password (shared in chat); Meta template approval + payment method + business verification + support case; Resend domain `crest-group.co` (DNS at GoDaddy in an account Aditya doesn't have — ask whoever set up Google Workspace; then set `RESEND_FROM_EMAIL` to `CREST CRM <reminders@crest-group.co>`); re-import contacts; confirm the Maharlika font licence.
- Optional builds: automatic retry for failed chat sends, restore-from-backup / restore-contact UI, group-empty guard, tag validation on import, per-message idempotency for scheduler email, `ig@` vs `info@` alignment with the company policy document, regenerate the CRM_*_DOCUMENTATION files to include items 21–27, authenticate `crest-group.co` in Brevo (DNS) to remove the Gmail warning.
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
