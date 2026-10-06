-- Remember which WhatsApp message each broadcast recipient got (6 Oct 2026).
--
-- "Sent" on a broadcast only means WhatsApp accepted the message. Meta reports
-- later whether it was delivered, read or failed (for example a billing
-- problem). Keeping each recipient's WhatsApp message ID lets the broadcast
-- page show those results.
-- Additive only; earlier broadcasts keep null. Safe to run more than once.

alter table public.broadcast_recipients
  add column if not exists wamid text;
