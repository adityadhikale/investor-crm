-- Keep the sender's phone number (and WhatsApp profile name) on each
-- WhatsApp message (3 Oct 2026).
--
-- A message from a number that isn't a contact yet is saved with
-- contact_id = null. Storing the number lets the CRM show it under "Unknown
-- numbers" on the Unread Messages page and link those messages to the contact
-- as soon as one is added or imported with that number. The profile name is
-- the name the sender set in WhatsApp, used to pre-fill "Save contact".
-- Additive only: existing rows keep null. Safe to run more than once.

alter table public.whatsapp_messages
  add column if not exists phone text;

alter table public.whatsapp_messages
  add column if not exists profile_name text;

create index if not exists whatsapp_messages_unmatched_phone_idx
  on public.whatsapp_messages (phone)
  where contact_id is null;
