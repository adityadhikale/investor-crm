-- Prospect score: a 1-5 fit score per contact. The AI suggests a score and a
-- reason; the owner can override it with their own score and reason. Both are
-- kept, so an override never loses the AI suggestion ("Reset to AI" just
-- clears the manual columns).
--
-- Additive and safe to run more than once. Run it in the Supabase SQL Editor
-- BEFORE using the score card. The contact pages still open without it and
-- show a notice instead of the score.

alter table public.contacts
  add column if not exists ai_score smallint,
  add column if not exists ai_score_reason text,
  add column if not exists ai_scored_at timestamptz,
  add column if not exists manual_score smallint,
  add column if not exists manual_score_reason text,
  add column if not exists manual_scored_at timestamptz;

alter table public.contacts drop constraint if exists contacts_ai_score_range;
alter table public.contacts
  add constraint contacts_ai_score_range check (ai_score is null or ai_score between 1 and 5);

alter table public.contacts drop constraint if exists contacts_manual_score_range;
alter table public.contacts
  add constraint contacts_manual_score_range check (manual_score is null or manual_score between 1 and 5);
