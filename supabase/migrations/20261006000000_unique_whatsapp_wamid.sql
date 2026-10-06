-- One row per WhatsApp message (6 Oct 2026).
--
-- Every WhatsApp message has a unique ID (wamid). The webhook now saves it on
-- incoming messages too and skips a message whose ID is already stored. This
-- unique index makes that a hard guarantee even if Meta delivers the same
-- message twice at the same instant.
-- Messages without an ID (older rows) are unaffected. Safe to run more than once.

drop index if exists public.whatsapp_messages_wamid_idx;

create unique index if not exists whatsapp_messages_wamid_unique
  on public.whatsapp_messages (wamid)
  where wamid is not null;
