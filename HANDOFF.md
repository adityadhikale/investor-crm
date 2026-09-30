# CREST CRM — HANDOFF / CONTEXT
## Updated: 30 September 2026

You are continuing development of an internal single-user Investor CRM for CREST Capital Management. This document is the source of truth for context — read it fully before suggesting any changes.

IMPORTANT:
- The project is already substantially built. DO NOT rebuild existing functionality.
- Work incrementally, one scoped feature at a time.
- The user (Aditya) is non-technical — he copy-pastes prompts into an AI coding assistant to make changes. He does not write code himself.
- Commit/push policy has changed since the previous handoff: Aditya explicitly asked this session to build, commit, and push directly — the older blanket "never commit without asking" rule no longer holds as written. Still confirm before any destructive git operation (force-push, reset --hard, branch deletion), but a plain commit + push on `master` when asked is fine.

---

# ⚠️ UNRESOLVED INCIDENT — READ FIRST

Partway through this session, **the entire Supabase database was found completely empty** — every table (`contacts`, `groups`, `templates`, `broadcasts`, `interactions`, `follow_ups`, `whatsapp_messages`) returned zero rows, confirmed by querying directly with the service-role key, bypassing the app entirely. This was discovered mid-session while testing an unrelated CSV-import feature; it was not caused by anything in that session's own code changes (verified — no delete/truncate logic was touched, and the wipe affected tables like `templates`/`broadcasts` that the changed code never even queries).

**Root cause was never identified.** Aditya was notified but the conversation moved on to other feature work without diagnosing it further. He then re-imported his contacts (~1518 rows), so the immediate symptom is gone, but **the underlying cause of that wipe is still unknown** and could recur. Whoever picks this up next should ask Aditya whether he checked the Supabase dashboard (Table Editor / SQL Editor query history / project activity log) for what happened, and whether Point-in-Time Recovery or backups are available on his plan in case it happens again.

---

# 1. PROJECT

Project: Investor CRM for CREST Capital Management
Local repository: `A:\CREST\CRM\investor-crm` (moved from `D:\` since the previous handoff)
GitHub: `https://github.com/crest-capital-management/investor-crm`
Branch: `master`
Supabase project ref: `fyesxkvfgwurejqsobdq`

---

# 2. TECH STACK

- Next.js 16.3.4, App Router, TypeScript, Turbopack
- React 19.2.8
- Supabase Postgres + Auth (free tier) + Storage (`whatsapp-media` public bucket)
- shadcn/ui, Tailwind CSS v4, react-day-picker, date-fns
- Meta WhatsApp Cloud API — direct integration (Coexistence mode), NOT AiSensy, NOT Wati
- `recharts` — dashboard analytics charts
- Google Gemini API — primary model `gemini-3.6-flash`, with automatic fallback to `gemini-flash-lite-latest` when the primary is overloaded (new this session, see §4)
- `exceljs` (new this session) — server-only Excel (.xlsx/.xls) parsing for contact import. Note: not `xlsx`/SheetJS — that package has an unfixed high-severity advisory on npm; `exceljs` was used instead (2 low-relevance moderate transitive advisories via `uuid`, not exercised by our usage)
- Resend — transactional email (daily follow-up reminder). **Still not configured** — `RESEND_API_KEY`/`RESEND_FROM_EMAIL` are blank in `.env.local`
- Node.js runtime throughout — no Edge runtime anywhere
- `middleware.ts` was renamed to `proxy.ts` (Supabase server client + route protection)
- Self-hosted local font: `public/fonts/Maharlika-Regular.ttf`, loaded via `next/font/local` in `app/layout.tsx` (new this session — see §4). **License caveat:** the font's distribution terms (dafont/befonts) describe it as free for non-commercial use; Aditya supplied the file and asked for it to be applied, but nobody has checked whether a paid/commercial license is needed for business use in a company product. Worth flagging to him if it comes up.

---

# 3. DATABASE SCHEMA (current)

**Active tables:** `contacts`, `groups`, `contact_group_members`, `interactions`, `follow_ups`, `whatsapp_messages`, `broadcasts`, `templates`
**Ignore:** two unused legacy tables `contact_interactions`, `contact_follow_ups`

- `contacts`: id, name, phone, email (optional, app-level required not DB-level), tags (TEXT[]), date_saved, notes (TEXT, nullable — **new this session**, free-form field intended for company name / designation / sector), created_at, deleted_at, whatsapp_summary (TEXT, nullable), whatsapp_summary_generated_at (TIMESTAMPTZ, nullable)
- `groups`: id, name, created_at — hard-delete, no deleted_at
- `contact_group_members`: contact_id, group_id, deleted_at (soft-delete, allows reactivation)
- `interactions`: id, contact_id, type ('meeting'), note, created_at, deleted_at — meeting notes and voice-note transcripts both land here as type='meeting'
- `follow_ups`: id, contact_id, due_date, message, is_done, created_at, deleted_at
- `whatsapp_messages`: id, contact_id, direction ('in'/'out'), message_text, media_url, sent_at, created_at, deleted_at — still no wamid/status/error_code columns (known gap, unchanged)
- `broadcasts`, `templates`: broadcast/template persistence

Migration for the new column: `supabase/migrations/20260929000000_add_notes_to_contacts.sql`. **Migrations in this repo are not auto-applied** — there's no linked Supabase CLI project (no `supabase/config.toml`, no access token), so every migration has to be pasted into the Supabase SQL Editor by Aditya manually. Confirm with him whether this one's already been run before assuming the column exists (it was, and confirmed working, by the end of this session).

Soft-delete pattern: all reads filtered with `.is("deleted_at", null)`. Phone numbers stored as 10-digit Indian local numbers; `+91` prefix added at send-time only via `lib/whatsapp.ts`. RLS is enabled but intentionally permissive (single-user design) — not a bug, don't tighten without it being explicitly requested.

Env var convention: `NEXT_PUBLIC_*` for browser-exposed, plain `SCREAMING_SNAKE_CASE` for server-only secrets.

**Current `.env.local` keys** (values not reproduced here — check the file directly):
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
WHATSAPP_ACCESS_TOKEN       <- currently a TEMPORARY token, expires quickly, refreshed twice already this session — expect to need a fresh one pasted in again soon. A permanent System User token is still the real fix (see §5).
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_BUSINESS_ACCOUNT_ID
SCHEDULER_SECRET
SUPABASE_SERVICE_ROLE_KEY
GEMINI_API_KEY
RESEND_API_KEY              <- still BLANK, needs Aditya's Resend account + key
RESEND_FROM_EMAIL            <- still BLANK, needs a verified sender
REMINDER_EMAIL_TO=aditya.dhikale@crest-group.co
WHATSAPP_WEBHOOK_VERIFY_TOKEN  <- set for local ngrok webhook testing
```

Note: an accidental duplicate stray file `env.local` (no leading dot) appeared briefly this session from a copy/paste mistake — it was deleted; `.env.local` (with the dot) is the only real one and is what Next.js actually reads.

---

# 4. WHAT'S BUILT (feature-complete)

Everything from the previous handoff, PLUS this session's additions:

## Built previously (still standing, unchanged)
See the git history / previous handoff content for the full list (contact management, investor pipeline, WhatsApp integration, broadcasts, AI features, dashboard analytics, etc.) — all confirmed still working this session.

## Built THIS session (29–30 Sept 2026)

1. **Dashboard "Tag Distribution" overlap, take 2** — an earlier session's `min-w-0`/`truncate` fix wasn't the whole story. The real remaining bug: the analytics grid switches to 3 columns at the `xl` breakpoint, but `TagDistributionChart`'s internal pie+legend layout only ever switched to a horizontal row via `sm:flex-row` (a *viewport* breakpoint), so at the narrow 3-column layout it kept trying to lay the legend out beside the pie chart with no room, overflowing into the neighboring "Investors Going Quiet" card. Fixed with `sm:flex-row xl:flex-col` on `components/dashboard-analytics.tsx` so it stacks again exactly when the grid narrows. Also added `min-w-0` to the three analytics grid cell wrappers in `app/dashboard/page.tsx` as a second layer of defense against grid blowout.
2. **Contact/Investor detail pages: Edit button + email overflow fix** — Both pages now have an "Edit Contact"/"Edit Investor" button that opens the *same* right-side quick-edit sheet (`components/contact-details-dialog.tsx`) already used elsewhere, via a new `startInEditMode` prop (and `nativeButtonTrigger` to fix a Base UI console warning when the trigger is a real `<button>` instead of a table row). Also fixed long emails pushing the Copy button off-screen on these two pages (`min-w-0` + `break-words` on the value column, `shrink-0` on the button).
3. **Contact notes field** — new `contacts.notes` TEXT column (migration above), wired into: Add Contact form, the quick-edit sheet (edit + view), Contact/Investor detail pages, CSV/Excel import column mapping (optional "Notes" column, auto-detected), and the corresponding server actions in `app/contacts/actions.ts`.
4. **Sidebar: per-tag navigation + scroll fix** — `components/app-sidebar.tsx` now has a collapsible "Tags" section listing all 8 tags; each links to `/contacts?tags=<tag>` (reusing the existing filter) except "Investors," which points at the dedicated `/investors` page. Also fixed the sidebar (both desktop `<aside>` and mobile drawer) not being scrollable — it was clipped with no way to reach items below the fold once the Tags section pushed content past the viewport height (`overflow-y-auto` added to both containers).
5. **Gemini call resilience** — `lib/gemini.ts` now retries on transient `429`/`500`/`503` responses (confirmed via direct testing that `gemini-3.6-flash` genuinely does intermittently 503 under demand, independent of our request), and falls back to `gemini-flash-lite-latest` if the primary model is still unavailable after retries. Applies to chat summary, follow-up suggestion, and voice transcription — all three now share one `callGeminiGenerateContent` helper instead of three copies of the same fetch logic.
6. **Excel (.xlsx/.xls) import support** — `components/import-contacts-dialog.tsx` now accepts Excel files alongside CSV. Parsing happens server-side (`lib/parse-spreadsheet.ts` + a new `parseExcelFile` server action in `app/contacts/actions.ts`) using `exceljs`, converting the first worksheet into the same `{headers, rows}` shape the CSV path already used, so the existing column-mapping/validation UI needed no changes. `next.config.ts` bumped the Server Actions body size limit to 15MB to accommodate large files (⚠️ **requires a dev/prod server restart to take effect** — Next.js does not hot-reload `next.config.ts` changes).
7. **Import review UX overhaul** (`components/import-contacts-dialog.tsx`):
   - A persistent header toggle ("All rows" / "Invalid (N)") replaces a hard-to-find text link — the original complaint was "no way to go back" after filtering to invalid rows only.
   - "Download Invalid Rows" and (after import) "Download Skipped Duplicates" buttons export CSVs with the specific reason each row was skipped, so nothing is silently invisible.
   - After import, a results screen shows Imported / Skipped (duplicate) / Invalid counts with plain-language explanation, instead of just a single toast.
   - The insert itself is now batched (300 rows/batch) server-side for clearer partial-failure attribution.
8. **Root-caused and fixed a real, sneaky Supabase bug**: the project's PostgREST "Max Rows" setting is configured to **1000**, and *silently* caps the response of any query that doesn't explicitly paginate with `.range()` — regardless of any `.limit()` requested above it, with no error. This was directly responsible for the dashboard/contacts page showing "1000 contacts" after importing 1518, and for duplicate-phone checks missing real duplicates once the table passed 1000 rows. Fixed everywhere found via a shared `lib/supabase-pagination.ts` (`fetchAllPages`) helper:
   - `app/contacts/actions.ts` (`addContact`/`updateContact`/`importContacts` duplicate-phone checks)
   - `app/contacts/page.tsx` (Total/Investors/Tagged Contacts stats + the contacts table itself)
   - `app/dashboard/page.tsx` (Total Contacts, Investors, tag-distribution chart, "Investors Going Quiet" widget; also switched three pure counts — Pending/Overdue Follow-ups, Recent Interactions — to `count: "exact", head: true` queries instead of fetching full row sets)
   - `app/investors/page.tsx` (investor list + last-interaction/next-follow-up lookups)
   - `app/groups/actions.ts` (`getGroupContactOptions` — the "add contacts to group" picker)
   - `app/broadcasts/actions.ts` (`dispatchBroadcast` — **this one is the highest-severity**: sending a broadcast to a group/tag with more than 1000 members would have silently sent to only 1000 of them and reported full success with no error)
   - **Not yet audited/fixed**: `app/broadcasts/page.tsx`, `app/broadcasts/new/page.tsx`, `app/broadcasts/[id]/page.tsx` (unbounded contact/group/template pickers in the broadcast composer UI), `app/groups/page.tsx`. Lower risk today (smaller tables) but same bug class — worth a pass once contacts/groups/templates individually approach 1000 rows.
   - Caveat: the Contacts page now fetches and renders *all* contacts in one unpaginated HTML table (currently ~1518 rows) — correct, but no pagination/virtualization UI exists yet. Fine for now, worth revisiting if the list keeps growing.
9. **CREST logo → Maharlika font** — Aditya supplied `Maharlika-Regular.ttf` as a zip upload; extracted to `public/fonts/`, loaded via `next/font/local` (`app/layout.tsx`, CSS var `--font-maharlika`), applied to the two logo wordmark spots (`components/top-nav.tsx`, `src/app/login/page.tsx`) with Playfair Display/serif kept as fallback. See the font-license caveat in §2.
10. **WhatsApp access token refreshed** twice this session (still temporary — see env var table above).
11. **Production WhatsApp number planning discussion** — no code change, but worth recording: Aditya asked about eventually sending from his boss's number instead of his own/the test number for production. Answer given: the code already supports this via env vars alone (`WHATSAPP_PHONE_NUMBER_ID`/`WHATSAPP_ACCESS_TOKEN`, no code change needed) — the real work is on Meta's side (registering the boss's number to the WhatsApp Business Platform, business verification, a permanent System User token). He also hit Meta's "number already registered to a WhatsApp account" error while trying to add a number — explained the Migrate-vs-Disconnect options; not yet resolved as of end of session.

---

# 5. WHATSAPP STATUS

Unchanged from previous handoff except the token refreshes noted above. Meta Business Verification remains resolved. Still deliberately deferred (Aditya's choice): permanent System User access token, and publishing the Meta app for real inbound messages in local dev. See previous handoff content / git history for full detail on the dev/test setup (ngrok tunnel URL will have changed since it rotates on every ngrok restart).

---

# 6. KNOWN LIMITATIONS / GAPS (confirmed, not bugs — do not "fix" without explicit ask)

1. `whatsapp_messages` still has no `wamid`/`status`/`error_code` columns; `broadcasts` has no per-recipient tracking.
2. `sendWhatsAppMessage()`'s reported success only reflects Meta's synchronous API acceptance, not actual delivery — expected Cloud API behavior, not a bug.
3. `supabase/.temp/cli-latest` was accidentally committed a while back — needs `.gitignore` entry + `git rm -r --cached`, not urgent.
4. CSV/Excel import does not validate imported tag values against the standard tag list — any string is accepted into `contacts.tags` at import time.
5. Gemini occasionally returns a transient "high demand" / 503 error — now auto-retried + falls back to a lighter model (see §4), but a sustained/global Gemini outage would still surface as an error eventually.
6. No actual daily/periodic cron trigger exists yet for either scheduled broadcasts or the daily follow-up reminder — both require a manual button click or an external trigger call, protected by `SCHEDULER_SECRET`.
7. The broadcast composer's own contact/group/template picker queries (`app/broadcasts/{page,new,[id]}/page.tsx`) and `app/groups/page.tsx` were **not yet audited** for the Supabase 1000-row cap bug (see §4 item 8) — do this before assuming any list over 1000 rows displays completely there.
8. Contacts list has no pagination UI — renders all ~1518+ rows in one scrollable table now that the row-cap bug is fixed. Works but will get heavier as the table grows.
9. The root cause of the mid-session full-database wipe (see incident callout at the top) was never found.

---

# 7. ROADMAP STATUS

- ✅ Everything from the previous roadmap
- ✅ Dashboard overlap bug — actually fixed this time (root cause was different from what the previous fix addressed)
- ✅ Contact/Investor Edit button + email overflow fix
- ✅ Contact notes field
- ✅ Per-tag sidebar navigation + sidebar scroll fix
- ✅ Gemini retry/fallback resilience
- ✅ Excel import support
- ✅ Import review UX (invalid/duplicate visibility + downloads)
- ✅ Supabase 1000-row cap bug — fixed in the 6 highest-priority spots found
- ✅ Maharlika logo font
- ⏳ Same 1000-row cap bug in the broadcast composer picker UI and `app/groups/page.tsx` — not yet done
- ⏳ Root cause of the database-wipe incident — not yet investigated
- ⏳ `RESEND_API_KEY`/`RESEND_FROM_EMAIL` — still blank
- ⏳ Permanent WhatsApp System User token — still deferred, Aditya's call
- ⏳ Actual cron/periodic trigger — deferred until hosting platform is chosen
- ⏳ RLS tightening — deferred
- ⏳ `.gitignore` cleanup for `supabase/.temp/`
- ⏳ Contacts list pagination/virtualization — not urgent, but noted

---

# 8. IMMEDIATE NEXT STEPS (in rough order of readiness)

1. **Ask Aditya what he finds when checking Supabase's dashboard/activity log for the database-wipe incident** — this is the most important open question from this session.
2. **Finish the Supabase 1000-row-cap audit** on the broadcast composer picker pages and `app/groups/page.tsx` (§6 item 7) — same fix pattern (`lib/supabase-pagination.ts`'s `fetchAllPages`) as everywhere else it was applied.
3. **Get `RESEND_API_KEY` + `RESEND_FROM_EMAIL` from Aditya** to actually enable the daily follow-up reminder email.
4. **Confirm the font license** for Maharlika is fine for commercial/business use, or get Aditya a proper license if needed.
5. When Aditya is ready: permanent WhatsApp System User token, and/or publishing the Meta app — both his call, don't push.
6. **Choose a hosting platform** — unblocks real cron scheduling.
7. Any further UI/feature polish Aditya wants — not blocked by anything above.

Do NOT start RLS tightening, or Recently Deleted restore without Aditya explicitly raising them.
