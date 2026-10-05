# CREST Capital Management - Investor CRM

An internal, single-user CRM built for CREST Capital Management to organize, track, and nurture investor relationships across meetings, follow-ups, and WhatsApp communications with ~100–120 investors, advisors, and prospects.

## Current Status

Core contact management, investor tracking, WhatsApp integration (webhook + broadcasts + templates), dashboard analytics, and an AI-generated WhatsApp chat summary feature are all built and working. Live WhatsApp message delivery is currently blocked by a Meta Business Account restriction (see Known Limitations below) — this is a Meta-side issue, not a code issue.

## Implemented Features

### 1. Contact Management
- Full lifecycle management: create, view, edit, search, and soft-delete (`deleted_at`).
- Full contact detail page (`/contacts/[id]`) — profile, meeting notes, follow-ups, WhatsApp history, and AI chat summary — works for any contact regardless of tag.
- Quick-edit Sheet (`contact-details-dialog.tsx`) for Name/Phone/Email/Tags/Groups/Date Saved, with a "View Full Details" link to the full page.
- Quick copy-to-clipboard for phone numbers and email addresses.
- Search and filtering across contacts by name, phone, or email.

### 2. CSV Import
- Drag-and-drop or file-browse CSV upload modal.
- Column mapping for Name, Phone, Email (optional), Tag, and Date Saved.
- In-browser validation (phone digits, email syntax, date format, required fields) with a preview table before committing.
- Bulk batch insertion into the database.
- Not yet tested: importing a real Google Contacts export (manual CSV export chosen over live OAuth sync — see Roadmap).

### 3. Tags & Custom Groups
- Standard tags (Investors, Shareholders, FMS Leads, EO, GRI, Potential Leads, IFA, Distributors, Leads) plus custom tags, single source of truth exported from `add-contact-dialog.tsx`.
- Custom group creation, editing, and deletion (groups use intentional hard-delete, not soft-delete).
- Bulk checkbox-based group assignment/removal, with a "Select All" / indeterminate toggle.

### 4. Investor Tracking (`/investors`)
- Dedicated pipeline view filtering all contacts tagged Investor.
- Full investor detail page (`/investors/[id]`) — same feature set as the contact detail page (notes, follow-ups, WhatsApp history, AI summary).

### 5. Meeting Notes & Follow-ups
- Chronological meeting-note timeline per contact, with add/edit/delete.
- Follow-up scheduling with due dates, pending/completed toggling, and overdue indicators.
- Completing a follow-up automatically logs it as an interaction.

### 6. WhatsApp Integration (Meta Cloud API, direct — not AiSensy/Wati)
- Webhook (`/api/whatsapp/webhook`) — GET verification + POST handling for incoming messages and Coexistence-mode echo messages.
- Broadcast composer — Group/Tag/Manual targeting, drafts, Send Now, calendar/time-based scheduling, scheduled edit/cancel, powered by a shared `broadcast-editor.tsx` for both `/broadcasts/new` and `/broadcasts/[id]`.
- `sendBroadcastNow` — resolves recipients, normalizes phone numbers (10-digit local ↔ +91-prefixed at send-time only), calls the Meta Graph API, tracks per-contact results.
- Scheduler dispatch function + protected trigger route — built and verified live; no periodic cron trigger yet (deferred until hosting is chosen).
- Template management UI — list, create, edit (no Meta template-submission logic yet).
- WhatsApp History (`components/whatsapp-history.tsx`) — compact inline stats (message count, latest-message preview) always visible; full message list moves into a right-side Sheet behind "View Full History"; shared by both contact and investor detail pages.
- Coexistence mode on the production number: phone app and Cloud API operate simultaneously with bidirectional message-echo syncing. The number's owner must be physically present with their phone for the QR-code pairing step during setup.

### 7. AI-Generated WhatsApp Chat Summary
- Google Gemini (`gemini-3.6-flash`) generates a short, scannable 2-sentence summary of a contact's WhatsApp history, with a "Next: " line surfacing any pending action.
- Cached on the contacts table (`whatsapp_summary`, `whatsapp_summary_generated_at`) — regenerates only when the user clicks "Generate Summary" / "Refresh Summary", not on every page load.
- Lives in the same `whatsapp-history.tsx` component, above the "Latest Message" card.

### 8. Dashboard
- Greeting banner and four core KPIs (Total Contacts, Active Investors, Pending Follow-ups, Overdue Follow-ups).
- Analytics section (`components/dashboard-analytics.tsx`, powered by recharts):
  - Follow-up Trend (created vs. completed-proxy, last 8 weeks)
  - Tag Distribution donut chart
  - "Investors Going Quiet" — top 5 Investor-tagged contacts by longest time since last interaction, flagging zero-interaction contacts
- Upcoming follow-ups widget with instant mark-done, and a recent interaction feed.

### 9. Authentication & Protected Routes
- Supabase Auth (email/password).
- Route protection via `proxy.ts` (renamed from `middleware.ts`) using the Supabase server client.
- Server Component (`requireAuth`) and Server Action (`requireActionAuth`) session guards.
- RLS is enabled but intentionally permissive (single-user design) — tightening is deferred until the app's surface area stabilizes.

### 10. Typography & Visual Polish
- Headings (h1/h2, including DialogTitle/SheetTitle) render in Playfair Display, matching the CREST logo font. Body text, buttons, inputs, and tables remain on Geist. Non-semantic "headings" (login CardTitle, large metric numbers) are intentionally left on Geist.

### 11. Responsive Design
- Fully responsive across desktop, tablet, and mobile, with a collapsible sidebar/drawer and touch-friendly Sheets/dialogs.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.3.4 (App Router, Turbopack) |
| Language | TypeScript 5 |
| UI Library | React 19.2.8 |
| Styling | Tailwind CSS v4, @tailwindcss/postcss |
| Primitives | Base UI (`@base-ui/react`) & shadcn/ui pattern |
| Icons | Lucide React |
| Database & Auth | Supabase (Postgres, free tier) — `@supabase/supabase-js`, `@supabase/ssr` |
| WhatsApp | Meta WhatsApp Cloud API (direct integration, Coexistence mode) |
| AI Summaries | Google Gemini API (`gemini-3.6-flash`, free tier) |
| Charts | recharts |
| Date Utilities | date-fns, react-day-picker |
| Runtime | Node.js throughout — no Edge runtime usage anywhere |

---

## Database Architecture

PostgreSQL via Supabase. Active tables:

- **`contacts`**  
  `id` (UUID, PK), `name`, `phone`, `email` (optional, required at app level not DB level), `tags` (TEXT[]), `date_saved`, `created_at`, `deleted_at`  
  `whatsapp_summary` (TEXT, nullable) — cached AI-generated summary  
  `whatsapp_summary_generated_at` (TIMESTAMPTZ, nullable)
- **`groups`**  
  `id` (UUID, PK), `name`, `created_at` — hard-delete, no `deleted_at`
- **`contact_group_members`**  
  Junction table: `contact_id`, `group_id`, `deleted_at` (soft-delete, allows reactivation)
- **`interactions`**  
  `id`, `contact_id`, `type` (e.g. `'meeting'`), `note`, `created_at`, `deleted_at`
- **`follow_ups`**  
  `id`, `contact_id`, `due_date`, `message`, `is_done`, `created_at`, `deleted_at`
- **`whatsapp_messages`**  
  `id`, `contact_id`, `direction` (`'in'`/`'out'`, matching a DB check constraint), `message_text`, `media_url`, `sent_at`, `created_at`, `deleted_at`  
  *No wamid/status/error_code columns yet — delivery-status tracking is a known gap (see below).*
- **`broadcasts`**  
  Stores broadcast drafts, scheduled sends, and send results (targeting, status, template reference).
- **`templates`**  
  WhatsApp message templates; `body_text` column added this year via migration.

Two legacy unused tables exist (`contact_interactions`, `contact_follow_ups`) — ignore them.

**Backup:** manual weekly `pg_dump` (Supabase free tier has no automatic backups).

---

## Known Limitations (confirmed, not bugs)

- **No delivery-status tracking linkage.** `whatsapp_messages` has no `wamid`/`status`/`error_code` columns; `broadcasts` has no per-recipient tracking. The webhook receives real failed status events but can't currently reconcile them to a specific broadcast or contact.
- **Outbound broadcast sends are not written into `whatsapp_messages` at send time** — only inbound/webhook-sourced messages are logged.
- **`sendWhatsAppMessage()`'s reported success only reflects Meta's synchronous API acceptance, not actual delivery** — true success/failure is only knowable via the async webhook. Expected Cloud API behavior, not a bug.
- **WhatsApp Business Account restriction (error 131031).** The account is currently locked pending Meta Business Verification completion — this blocks all outbound sends, including the sandbox test number, so no code-level workaround exists. Resolving this requires completing Business Verification in Meta Business Manager.
- **`npm run build` occasionally gets skipped mid-session if it conflicts with an active `next dev` server.** Stop the dev server first, or run build manually in a separate terminal.

---

## Local Development Setup

### Prerequisites
- Node.js v20+
- npm
- A Supabase project with the schema above applied
- A public Supabase Storage bucket named `whatsapp-media` (created once via the service role key; stores a persistent copy of any file sent through WhatsApp media upload/send, since Meta's own media URLs are short-lived and require authentication)

### 1. Clone & Install
```bash
git clone https://github.com/crest-capital-management/investor-crm
cd investor-crm
npm install
```

### 2. Configure Environment Variables
Create a `.env.local` file in the project root:
```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
WHATSAPP_ACCESS_TOKEN=your-meta-access-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your-webhook-verify-token
WHATSAPP_APP_SECRET=your-meta-app-secret
GEMINI_API_KEY=your-gemini-api-key
SCHEDULER_SECRET=your-scheduler-trigger-secret
RESEND_API_KEY=your-resend-api-key
RESEND_FROM_EMAIL=your-verified-sender@yourdomain.com
REMINDER_EMAIL_TO=you@yourdomain.com
```
> **Note:** Never commit `.env.local` or expose production API keys.

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Code Quality & Validation

Run before committing (stop the dev server first if it's running, to avoid port conflicts on build):
```bash
npm run lint
npx tsc --noEmit
npm run build
```

---

## Roadmap

- ✅ Template management UI
- ✅ Scheduler dispatch function + protected trigger route (verified live)
- ✅ AI-generated WhatsApp chat summary (Gemini)
- ✅ Dashboard analytics (Follow-up Trend, Tag Distribution, Investors Going Quiet)
- ✅ WhatsApp History Sheet redesign
- ✅ Headings switched to Playfair Display
- ✅ Meta Business Verification — resolved; WhatsApp account unlocked; confirmed working with live test sends via the WhatsApp test number
- ✅ Daily follow-up reminder — email digest (via Resend) of due/overdue follow-ups; manual "Send test reminder email" button on the dashboard; not yet on an actual daily schedule (see below)
- ✅ Outbound broadcast messages now logged into `whatsapp_messages` at send time (previously a known gap — fixed)
- ✅ Reply-from-CRM — free-form WhatsApp reply box in the WhatsApp History panel on contact/investor detail pages (`sendWhatsAppReply` in `app/contacts/actions.ts`); subject to Meta's 24-hour customer window like any WhatsApp business messaging; confirmed working with a live test send
- ✅ Media upload/send — attach button in the WhatsApp reply composer (images, documents, video, audio up to 16MB); uploads to Meta to send and keeps a copy in a new Supabase Storage bucket (`whatsapp-media`) for display in WhatsApp History; confirmed working with a live test send (real photo, delivered)
- ✅ AI-suggested follow-ups — "Suggest with AI" button next to the existing manual "Add Follow-up" button (unchanged) on contact/investor detail pages; Gemini reads WhatsApp history + meeting notes and decides whether a follow-up is warranted, drafting a due date + message into the same manual Add Follow-up dialog for review before saving (`suggestFollowUp` in `app/investors/actions.ts`, `generateFollowUpSuggestion` in `lib/gemini.ts`); confirmed working live — correctly said "not needed" for content-free test messages and correctly drafted a real, actionable follow-up from a meeting note
- ✅ Voice note transcription — "Upload Voice Note" button next to the existing manual "Add Meeting Note" button (unchanged) on contact/investor detail pages; uploads an audio recording to Gemini, which transcribes it into a clean meeting note draft, pre-filled into the same manual Add Meeting Note dialog for review before saving (`transcribeVoiceNote` in `app/contacts/actions.ts`, `transcribeVoiceNoteToMeetingNote` in `lib/gemini.ts`); audio itself is not stored, only the resulting text; confirmed working live — correctly reported when a test recording had no usable speech rather than inventing a note
- ⏳ Actual cron/periodic trigger for scheduled broadcasts and the daily follow-up reminder — deferred until hosting platform is chosen
- ⏳ Inbound webhook messages in local dev — requires a public URL (tested successfully via ngrok + Meta's webhook test tool); real inbound messages won't reach the CRM until the Meta app is published (Meta restriction, not a code issue)
- ⏳ RLS tightening — deferred until surface area stabilizes
- ⏳ Google Contacts CSV import — importer likely already compatible, not yet actually tested
- 📋 Recently Deleted restore — unscoped
- ❌ Google Meet transcript auto-pull — dropped entirely in favor of the AI chat summary feature above
