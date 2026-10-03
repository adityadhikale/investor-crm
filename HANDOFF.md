# CREST CRM — HANDOFF / CONTEXT
## Updated: 3 October 2026

You are continuing development of an internal single-user Investor CRM for CREST Capital Management. This document is the source of truth for context — read it fully before suggesting any changes.

**CURRENT PHASE (decided by Aditya on 3 Oct 2026):** (1) a **security + performance optimization pass**, then (2) **step-wise testing** driven by a list Aditya will provide. The optimization pass must keep the app **working exactly as it does now — same functionality, same UI**. Read §10 and §11 before touching anything.

IMPORTANT:
- The project is already substantially built. DO NOT rebuild existing functionality.
- Work incrementally, one scoped feature at a time.
- The user (Aditya) is non-technical — he copy-pastes prompts into an AI coding assistant to make changes and screenshots Meta/Netlify/Supabase screens when stuck. He does not write code himself. Keep instructions as short numbered steps with exact click paths.
- **Commit/push policy:** only when Aditya asks. "Commit and push" means **both remotes** (see §1). Still confirm before any destructive git operation (force-push, reset --hard, branch deletion).
- **Secrets:** never ask Aditya to paste tokens/keys/secrets into chat, and never repeat them. He has pasted some anyway (a temporary token, and once the Meta app secret in a screenshot, which was then reset). Remind him to paste secrets straight into `.env.local` and Netlify's environment variables.
- **Read `node_modules/next/dist/docs/`** before writing Next.js code (see `AGENTS.md`) — this is Next.js 16 with breaking changes.

---

# 1. PROJECT & HOSTING

- Project: Investor CRM for CREST Capital Management
- Local repository: `A:\CREST\CRM\investor-crm`
- Live site: **https://investor-crm.netlify.app** (Netlify, free plan)
- GitHub (org): `https://github.com/crest-capital-management/investor-crm` — remote `origin`
- GitHub (personal copy): `https://github.com/adityadhikale/investor-crm` — remote `personal`. **Netlify builds from this personal copy**, because Vercel's free Hobby plan can't deploy repos owned by a GitHub organization (and Hobby is also meant for non-commercial use).
- Branch: `master`. After every commit run **both**: `git push origin master` and `git push personal master`. Check both heads match before telling Aditya to redeploy.
- Supabase project ref: `fyesxkvfgwurejqsobdq`
- `netlify.toml` excludes expected secrets-scan hits (see §8). Netlify only applies new/changed environment variables on a **new deploy**.
- Windows machine. Python is **not** installed (use `node` for scripts). Files in the repo use CRLF line endings; scripts that rewrite files should preserve them.
- Dev server: `npm run dev` (port 3000) or the preview tool with the `investor-crm-dev` entry in `.claude/launch.json`. ngrok is **no longer needed** (see §6).

---

# 2. TECH STACK

- Next.js 16.3.4, App Router, TypeScript, Turbopack; React 19.2.8
- Supabase Postgres + Auth (free tier) + Storage (`whatsapp-media` public bucket)
- shadcn/ui, Tailwind CSS v4, react-day-picker, date-fns, `recharts`
- Meta WhatsApp Cloud API — direct integration, NOT AiSensy, NOT Wati
- Google Gemini API — `gemini-3.6-flash`, falling back to `gemini-flash-lite-latest` (retries on 429/500/503)
- `exceljs` for server-side Excel import (not SheetJS — unfixed advisory)
- Resend for the daily reminder email — **still not configured** (`RESEND_API_KEY`/`RESEND_FROM_EMAIL` blank)
- `proxy.ts` (renamed from `middleware.ts`) protects routes; its matcher only lists some routes, but every private page also calls `requireAuth()`
- Self-hosted font `public/fonts/Maharlika-Regular.ttf` for the CREST wordmark. **License caveat:** described as free for non-commercial use; nobody has confirmed a commercial license is not needed.

---

# 3. DATABASE & SECURITY

**Active tables:** `contacts`, `groups`, `contact_groups`, `interactions`, `follow_ups`, `whatsapp_messages`, `broadcasts`, `templates`, `app_settings`. (The group-membership table is **`contact_groups`**, not `contact_group_members` as older notes said.)

- `contacts`: id, name, phone, email, tags TEXT[], date_saved, notes, created_at, deleted_at, whatsapp_summary(+_generated_at), **last_read_at** (when the WhatsApp chat was last opened)
- `whatsapp_messages`: id, contact_id (null when the number matches no contact), direction ('in'/'out'), message_text, media_url, sent_at, created_at, deleted_at. No wamid/status columns.
- `app_settings`: single row (`id='default'`) — reminder email on/off + recipient + what to include; which bell notification types show.
- SQL function `unread_conversations()` returns contacts whose inbound messages are newer than both `last_read_at` and our last outbound message.
- Soft-delete pattern: reads filter `.is("deleted_at", null)`. Phones stored as 10-digit Indian numbers; `+91` added at send time (`lib/whatsapp.ts`). **Bulk "Delete" on the Contacts page is a hard delete** (single delete is soft).
- Supabase PostgREST "Max Rows" is 1000 and silently caps unpaginated queries — use `lib/supabase-pagination.ts` (`fetchAllPages`) for any full-list query.

**Migrations are not auto-applied** (no linked Supabase CLI). Aditya pastes each into the SQL Editor. All applied as of 2 Oct 2026:
`20260929000000_add_notes_to_contacts`, `20260930000000_add_unread_messages`, `20260930010000_add_app_settings`, `20261002000000_lock_down_to_owner`.

**Row-level security (changed 2 Oct 2026 — supersedes the old "intentionally permissive" note):** every table has one policy, "Owner only", allowing access only when `public.is_crm_owner()` is true (user id `ff04929a-ae33-454b-8f18-0c81a4059022`, the single login `test@example.com`). Before this, `broadcasts`/`templates`/`whatsapp_messages` allowed anyone with the public anon key to read/write/delete, and the rest trusted any signed-in account. **Supabase public sign-up is now disabled** (verified via `/auth/v1/settings`, `disable_signup: true`) — keep it off. If another user is ever needed, update `is_crm_owner()`.
- The service-role key (`SUPABASE_SERVICE_ROLE_KEY`, server only) bypasses RLS. The **WhatsApp webhook and scheduled jobs use it** (`lib/supabase-service.ts`). Never use the anon key server-side without a user session — it can see nothing (this bug made incoming messages unmatchable to contacts until fixed on 2 Oct).

**Env var convention:** `NEXT_PUBLIC_*` browser-exposed, others server-only. `.env.local` and Netlify's environment must both have: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET`, `SCHEDULER_SECRET`, `GEMINI_API_KEY`, `REMINDER_EMAIL_TO`. Blank for now: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`. Do **not** set `NGROK_AUTHTOKEN` on Netlify.

**Data history:**
- Around 28–30 Sept the whole database was found empty; the cause was never identified. Aditya re-imported ~1518 contacts.
- On 2 Oct the contacts table dropped to 1 row and `whatsapp_messages` to 0; **Aditya confirmed he deleted these himself.** The contacts table is therefore nearly empty and needs re-importing from his Excel/CSV when he wants the data back. Groups, templates, broadcasts, notes and follow-ups have been empty since the first wipe.

---

# 4. WHAT'S BUILT

Previously: contact management, CSV/Excel import with review UX, contact notes, investor pipeline, meeting notes + follow-ups, groups, broadcasts + templates, WhatsApp history with AI summary/reply/media, AI follow-up suggestions, voice-note transcription, dashboard analytics, 8-tag system, per-tag sidebar navigation, Maharlika logo.

## Added 2 Oct 2026
1. **Pagination** — 100 rows/page via `?page=N` on Contacts, Investors, Groups, Broadcasts, Templates (`lib/pagination.ts`, `components/pagination-controls.tsx`). Search/tag filters reset to page 1. Selection clears on page change.
2. **Unread Messages** — `/unread-messages` lists contacts waiting for a reply; sidebar count badge; opening the WhatsApp History panel on a contact page marks it read (`contacts.last_read_at`), plus "Mark read"/"Mark all as read" buttons. Replying (CRM or phone) also clears it.
3. **Notification bell** (top bar) — new WhatsApp messages, overdue/due-today follow-ups, broadcasts sent in the last 7 days (`app/notifications/actions.ts`). Only the first two count toward the red badge.
4. **Settings on `/my-profile`** — dark mode **switch** (per-device, stored in localStorage, applied before paint by `lib/theme.ts`), daily reminder email options (on/off, recipient, include follow-ups / unread messages, test button), bell preferences, and **downloads**: contacts CSV (`/api/export/contacts`) and a full JSON backup of every table (`/api/export/backup`). Settings are stored in `app_settings`.
5. **Daily reminder email** now also lists unread WhatsApp messages and follows the settings. Still needs Resend keys and a scheduler (§7).
6. **Groups must have at least one member** — creating a group requires choosing contacts; removing the last member is blocked. **Known gap:** deleting contacts can still leave a group empty.
7. **Public privacy policy** at `/privacy-policy` (with `#data-deletion` section), linked from the login page and profile page. `lib/public-routes.ts` lists public pages (they render without sidebar/top bar and need no login).
8. **WhatsApp webhook fix** — now uses the service-role client and verifies Meta's `x-hub-signature-256` with `META_APP_SECRET` (unsigned or badly signed requests get 401).
9. **Security hardening** — see RLS section in §3.

---

# 5. META / WHATSAPP SETUP (2 Oct 2026) — READ CAREFULLY

- **App:** `CREST-CRM`, App ID `973294598468351`, **Live** since 2 Oct 2026. Type Business, use case "Connect with customers through WhatsApp", linked to portfolio `1385596579928121`.
- **Portfolio `1385596579928121`** ("CREST Capital Management"): Aditya is the only admin; no restriction is shown on its Support page; **business verification shows "not verified"**, so messaging limits are low.
- **WhatsApp Business Account:** "Crest Investment Management", ID `1092796546468247` (review status APPROVED).
- **Production number:** `+91 91374 09245`, Phone Number ID `1352056234657893`, Cloud API, display name "Crest Capital Management", status CONNECTED, quality GREEN. This number had been registered to an older account, which first blocked adding it (error #2388361, display-name mismatch); it later became registrable.
- **Token:** `WHATSAPP_ACCESS_TOKEN` is a **System User token that never expires**, with `whatsapp_business_management` and `whatsapp_business_messaging`. **Lesson:** resetting the app secret appeared to strip the permissions of the previous token (it still validated but could read nothing and CRM sending failed); a new token was generated from the Meta app's Step 2 → Send message → Generate token screen. After any app-secret reset, regenerate the token and update `.env.local` **and** Netlify, then redeploy.
- **Webhook:** callback `https://investor-crm.netlify.app/api/whatsapp/webhook`, field `messages` (v26.0), app subscribed to the account. The verify token is `WHATSAPP_WEBHOOK_VERIFY_TOKEN`. The app secret was exposed in a screenshot and reset on 2 Oct; the current one is in `META_APP_SECRET` (never commit it).
- **Meta app settings:** Privacy policy URL `https://continuum.crest-capital.com/privacy`, data deletion URL `https://investor-crm.netlify.app/privacy-policy#data-deletion`, app domain `crest-capital.com`. Terms of Service URL should be left blank.
- **24-hour window:** free-form replies only work within 24 hours of the contact's last message; otherwise a template is needed.
- **Verified end to end on 2 Oct:** phone → CRM (inbound saved, matched to contact, shown in Unread Messages/bell/badge) and CRM → phone, on the Netlify site.

**Open Meta problems (not code):**
- Meta flagged an **automation policy restriction** (advertising features) on portfolio **`1066955262606783`** on 16 Sep 2026 (no ads/audiences/pixel/boosting; "manage people" restriction disabled creating System Users there). Aditya's current login **cannot open that portfolio**. The older WhatsApp account `1755324759049717` and its developer app are also not visible from this login.
- A Meta email dated 24 Sep said "Crest Capital Management Private Limited is now verified" — which portfolio that applies to is unknown; the working portfolio shows unverified.
- Two Facebook profile IDs appeared (`61571986714940` and `61594242398581`); Meta's support assistant said the latter had "access blocks". Meta's chat assistant is unreliable and contradicted itself. A manual review/support case is still open.
- The WhatsApp number's profile photo: Aditya was changing it; confirm it shows (WhatsApp Manager → Phone numbers → Profile; square JPG/PNG ≥192px, ≤5 MB, phones cache it for hours).
- Production use with his boss's own number via Coexistence has **not** been done and should not be, until verification and the support case are resolved.

---

# 6. LOCAL TOOLS

- **ngrok** v3.39.11 is installed (winget `Ngrok.Ngrok`, updated with `ngrok update`; auth token saved by Aditya in `%LOCALAPPDATA%\ngrok`). It is **not running and not needed** now that Meta calls Netlify. If local webhook testing is ever needed again: `ngrok http 3000`, then point Meta's callback at the new URL (free-plan address has been `crumb-darling-tabloid.ngrok-free.dev`), and switch it back afterwards.
- Because `META_APP_SECRET` is set locally, a local webhook test must send a valid `x-hub-signature-256` (HMAC-SHA256 of the raw body with the app secret).

---

# 7. KNOWN LIMITATIONS / GAPS

1. `whatsapp_messages` has no `wamid`/`status`/`error_code`; `broadcasts` has no per-recipient tracking. Delivery status events are logged only.
2. `sendWhatsAppMessage()` success only reflects Meta's synchronous acceptance.
3. `supabase/.temp/cli-latest` was committed by accident — needs `.gitignore` + `git rm -r --cached`.
4. CSV/Excel import doesn't validate tags against the standard list.
5. **No scheduler** exists for scheduled broadcasts or the daily reminder email. Both have protected trigger routes (`/api/broadcasts/trigger`, `/api/follow-ups/trigger`, `Authorization: Bearer <SCHEDULER_SECRET>`). Netlify scheduled functions or an external cron is needed. Function time limits on Netlify may matter for slow Gemini calls.
6. Resend is not configured, so the reminder email cannot send.
7. The broadcast composer pickers (`app/broadcasts/new`, `[id]`) were not audited for the 1000-row cap.
8. Groups: each group still loads its members inline (heavy for very large groups). Deleting contacts can leave a group empty.
9. Messages that arrived before 2 Oct from unknown numbers have `contact_id = null` (Aditya cleared the old ones).
10. Pre-existing minor lint warning: `<img>` in `components/whatsapp-history.tsx`.
11. The Storage bucket `whatsapp-media` is public; its policies were not reviewed.

---

# 8. NETLIFY NOTES

- Build is `npm run build` (Next.js runtime plugin); it succeeds. Netlify's **secrets scan** fails the deploy on expected hits, so `netlify.toml` omits `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `REMINDER_EMAIL_TO` (by key) and `.netlify/.next/cache/**` (by path; Turbopack's never-served build cache holds env values). Scanning stays on for everything served. Don't disable it.
- The scan's "exit code 2" message at the end of a build log is the scan failing, not the Next build — read the lines above it.
- The site is public; the login page has no sign-up; RLS and disabled sign-up are what protect the data. Don't weaken either.

---

# 9. ROADMAP / NEXT STEPS

- 👉 **Next:** §10 (security + performance pass, behaviour-preserving), then §11 (Aditya's testing list).
- ✅ Pagination, Unread Messages, notification bell, settings + dark mode, group minimum-member rule, privacy policy, webhook fix, security lock-down, Netlify deployment, Meta app Live, real number registered, two-way WhatsApp verified.
- ⏳ **Meta Support case** (restricted portfolio, old WhatsApp account, which portfolio is verified, business verification for the working portfolio).
- ⏳ **Re-import contacts** when Aditya wants them back.
- ⏳ **Resend keys** → daily reminder email; **a scheduler** for it and for broadcasts.
- ⏳ Confirm the Maharlika font license; WhatsApp number profile photo.
- ⏳ Optional: soft-delete or "type DELETE" confirmation for bulk contact delete; block deleting a group's last contact; per-message delivery status columns; audit the broadcast composer pickers for the 1000-row cap; `.gitignore` for `supabase/.temp/`.

Do NOT start a "Recently Deleted" restore feature, or register his boss's real number, without Aditya explicitly asking.

---

# 10. PRE-TESTING OPTIMIZATION & SECURITY PASS (planned — nothing below has been changed yet)

## Ground rules (non-negotiable — Aditya's requirement: "the app will work the same as it is before")
1. **No change in behaviour or UI.** If a fix would be visible to the user (layout, wording, flow), stop and ask Aditya first.
2. **One change per commit**, smallest possible diff. Before each commit: `npx tsc --noEmit`, `npx eslint <files>`, and `npm run build` must all pass. Compare the touched page/flow before vs after (screenshots or outputs).
3. First create a restore point: `git tag pre-optimization-2026-10-03` on the current `master` (push the tag to both remotes) so anything can be rolled back with one command.
4. **Do not touch RLS policies, Supabase Auth settings, Meta settings or secrets** as part of this pass unless a numbered item below says so and Aditya agrees. No major-version dependency upgrades (patch bumps only, as listed).
5. Verify on the dev server first, then after pushing to **both remotes** and redeploying on Netlify, re-run the baseline smoke checks in §11. Aditya must log in himself (never enter his password).
6. Measure before optimizing performance (page load timings / number of queries) so improvements are real, not guesses.

## A. Security findings (from a read-only audit on 2–3 Oct 2026), most important first
1. **Critical npm advisory in `next`** (GHSA-vcvr-r3jv-pc5j, remote code execution in `next/og` ImageResponse; affects 16.2.0–16.3.5). The app does **not** use `next/og`, but upgrade the exact pins in `package.json`: `next` and `eslint-config-next` from `16.3.4` → `16.3.8` (patch bump; `npm audit` names this as the fix). Re-run build and every page.
2. **Two exported server actions have no auth check and use the service role:** `dispatchDueBroadcasts` (`app/broadcasts/actions.ts`) and `dispatchDueFollowUpReminders` (`app/follow-ups/actions.ts`). Functions exported from a `"use server"` file can become callable endpoints. They are only meant to be called by the secret-protected routes `/api/broadcasts/trigger` and `/api/follow-ups/trigger` (the reminder one also by the `sendTestFollowUpReminder` wrapper). Move them into a plain server module (e.g. `lib/`) and import from there — behaviour identical. (All other exported actions already call `requireActionAuth`.)
3. **Webhook signature check fails open:** `app/api/whatsapp/webhook/route.ts` only verifies `x-hub-signature-256` when `META_APP_SECRET` is set. Make it fail **closed** in production (reject if the secret is missing) while keeping local dev usable, and compare with `crypto.timingSafeEqual`.
4. **Trigger routes compare `SCHEDULER_SECRET` with `!==`** — switch to a constant-time comparison.
5. **PostgREST filter injection via search text:** search strings are interpolated into `.or(...)` filters in `app/contacts/page.tsx`, `app/investors/page.tsx`, `app/groups/actions.ts` (`getGroupContactOptions`, `searchContactsForNewGroup`) and `ilike` in `app/groups/page.tsx`. Text containing `,` `(` `)` can change the filter. Impact is limited by owner-only RLS, but sanitize/escape those characters without changing normal searches (names with spaces, apostrophes, `+` in phones must still match).
6. **No HTTP security headers** (`next.config.ts` only sets the Server Actions body limit). Add safe ones: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy`. **Do not add a strict CSP blindly:** the root layout has an inline theme script (`lib/theme.ts`) and Google Fonts; if a CSP is wanted, start with `Content-Security-Policy-Report-Only` and test login, dark mode and fonts.
7. **Dependencies:** `shadcn` (a CLI) is listed as a runtime dependency and pulls high-severity transitive advisories (ts-morph/braces/micromatch). Check it isn't imported at runtime, then move it to `devDependencies` (or remove). Run the **non-breaking** `npm audit fix` for `brace-expansion`, `fast-uri`, `ip-address`. `exceljs`→`uuid` (moderate) has no safe fix; it is server-only and not exercised — accept. Never run `npm audit fix --force`.
8. **Public Storage bucket `whatsapp-media`:** files sent to contacts are readable by anyone with the URL. Moving to a private bucket with signed URLs is the proper fix but changes how media displays — **ask Aditya before doing it.**
9. Housekeeping: `.gitignore` for `supabase/.temp/` (`git rm -r --cached`); keep Supabase sign-up OFF and RLS owner-only (re-verify after any DB change — see the anon test in §11).

## B. Performance findings (no behaviour change)
1. **Dashboard (`app/dashboard/page.tsx`) fetches six full datasets on every load** via `fetchAllPages` (all contacts, follow-ups, interactions, etc.). Replace with count queries and/or small SQL aggregate functions (RPC) for the tag-distribution chart, "Investors Going Quiet" and the follow-up trend. Biggest win. Output must match exactly (compare the numbers before/after).
2. **Duplicate polling:** the sidebar badge and the notification bell each call a server action every 60 s (`getUnreadConversationCount`, `getNotifications`). Share one poller and pause it when the tab is hidden (`visibilitychange`).
3. **Database indexes** — first check what exists: `select tablename, indexname, indexdef from pg_indexes where schemaname='public' order by 1;`. Candidate non-breaking indexes: `whatsapp_messages(contact_id, direction, sent_at)` (the `unread_conversations()` function runs a correlated subquery per message), `follow_ups(is_done, due_date)` partial `where deleted_at is null`, `contacts(phone)`, GIN on `contacts(tags)`, `contact_groups(group_id)` and `(contact_id)`, `interactions(contact_id, created_at)`. Ship as a migration file; Aditya pastes it into the SQL editor.
4. **Contacts page** runs five count queries plus the page query per load — acceptable; optimize last (e.g. one RPC).
5. **Fonts:** the root layout loads Geist, Geist Mono and Playfair Display (Google) plus Maharlika on every page. Confirm Geist Mono / Playfair are actually used (they appear in `broadcast-editor`, `globals.css` and as the logo fallback) and trim unused ones — the logo must look identical.
6. **Groups page** loads every group's members inline. Counting members and loading the list on open would be faster but is visible behaviour — ask first.
7. Minor: one `<img>` lint warning in `components/whatsapp-history.tsx` (leave unless trivial); `recharts` could be loaded only on the dashboard (check the bundle first); Netlify free functions have short time limits that slow Gemini calls can hit.

---

# 11. TESTING (pending — Aditya will give the list, we go step by step)

Aditya will provide his testing list in the new chat. Work through it **one item at a time**: tell him exactly what to do, then verify on your side where possible (database via the service key, webhook, token). He logs in himself.

## Baseline smoke checks (run before AND after the optimization pass)
Run these on the dev server and on https://investor-crm.netlify.app:
1. Login/logout; `/contacts` without a login redirects to `/login`; `/privacy-policy` opens without login.
2. Contacts: list shows 100/page, page counter, search, tag filter, add, edit, delete, import CSV/Excel.
3. Groups: creating one requires choosing at least one contact; removing the last member is blocked; add/remove/delete otherwise work.
4. Investors list and detail pages; meeting notes; follow-ups (add, done, overdue); "Suggest with AI"; voice-note upload; AI chat summary.
5. WhatsApp: send text from a contact page (needs the contact to have messaged within 24 h); send media; **inbound** message from a phone appears in WhatsApp History, `/unread-messages`, the sidebar badge and the bell; opening the history marks it read.
6. Broadcasts and Templates: list, create, view; scheduled/send paths only when Aditya asks (they message real people).
7. Dashboard widgets and numbers; dark mode switch; `/my-profile` settings save (needs the `app_settings` table, which exists) and the two downloads (contacts CSV, full JSON backup).
8. Responsive layout at phone width; no console errors.

## Scripted security checks (read-only; use the keys in `.env.local` without printing them)
- **Anonymous visitor sees nothing:** with only the anon key, `GET /rest/v1/<table>?select=*&limit=1` must return 0 rows for every table, and an anonymous `INSERT` into `whatsapp_messages` must fail with HTTP 401 (RLS violation).
- **Sign-up is off:** `GET <SUPABASE_URL>/auth/v1/settings` shows `disable_signup: true`.
- **Webhook:** an unsigned POST to `/api/whatsapp/webhook` → 401 "Missing signature"; a wrong signature → 401 "Invalid signature"; a correctly signed (HMAC-SHA256 with `META_APP_SECRET`) test payload from a made-up number is accepted and saved with `contact_id = null` (delete that test row afterwards).
- **Token health:** `debug_token` shows the System User token valid, never expires, with both WhatsApp scopes; the phone number reads CONNECTED/GREEN.
