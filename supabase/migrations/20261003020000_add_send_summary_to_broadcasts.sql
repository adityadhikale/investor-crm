-- Delivery summary for each sent broadcast (3 Oct 2026).
--
-- Filled when a broadcast is sent (Send Now or scheduled): how many were
-- sent, skipped (plain text to contacts outside the 24-hour reply window) and
-- failed, with names, so skipped people are visible even for scheduled sends.
-- Additive only; existing broadcasts keep null. Safe to run more than once.

alter table public.broadcasts
  add column if not exists send_summary jsonb;
