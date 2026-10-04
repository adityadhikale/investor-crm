-- WhatsApp delivery status (4 Oct 2026).
--
-- "Sent" in the CRM only means WhatsApp accepted the message. Meta reports
-- what happened next (delivered / read / failed, with a reason) through the
-- webhook. These columns store that so the chat can show ticks and, when a
-- message could not be delivered, why.
-- Additive only; existing messages keep null. Safe to run more than once.

alter table public.whatsapp_messages
  add column if not exists wamid text,
  add column if not exists status text,
  add column if not exists status_error text,
  add column if not exists status_at timestamptz;

create index if not exists whatsapp_messages_wamid_idx
  on public.whatsapp_messages (wamid)
  where wamid is not null;
