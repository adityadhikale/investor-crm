-- Chat-style contact list and live message updates (8 Oct 2026).
--
-- 1. Each contact remembers its latest WhatsApp message (time, short preview,
--    and whether we sent or received it). The contact lists use this to show the
--    most recently active chats first, like WhatsApp, with a preview line.
--    A trigger keeps it up to date; the update at the end fills it in for the
--    messages that already exist.
-- 2. Adds the messages table to Supabase Realtime, so the CRM can show a new
--    incoming message within a second or two instead of waiting for the next
--    refresh. Row-level security still applies: only the owner receives events.
--
-- Additive only. Safe to run more than once.

alter table public.contacts
  add column if not exists last_message_at timestamptz,
  add column if not exists last_message_text text,
  add column if not exists last_message_direction text;

create index if not exists contacts_last_message_at_idx
  on public.contacts (last_message_at desc nulls last)
  where deleted_at is null;

create or replace function public.touch_contact_last_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.contact_id is not null and new.deleted_at is null then
    update public.contacts
    set last_message_at = new.sent_at,
        last_message_text = left(
          coalesce(nullif(btrim(new.message_text), ''),
                   case when new.media_url is not null then 'Attachment' else '' end),
          120),
        last_message_direction = new.direction
    where id = new.contact_id
      and (last_message_at is null or last_message_at <= new.sent_at);
  end if;
  return new;
end;
$$;

drop trigger if exists whatsapp_messages_touch_contact on public.whatsapp_messages;
create trigger whatsapp_messages_touch_contact
  after insert or update of contact_id on public.whatsapp_messages
  for each row execute function public.touch_contact_last_message();

-- Fill in the latest message for contacts that already have chats.
update public.contacts c
set last_message_at = m.sent_at,
    last_message_text = left(
      coalesce(nullif(btrim(m.message_text), ''),
               case when m.media_url is not null then 'Attachment' else '' end),
      120),
    last_message_direction = m.direction
from (
  select distinct on (contact_id) contact_id, sent_at, message_text, media_url, direction
  from public.whatsapp_messages
  where contact_id is not null and deleted_at is null
  order by contact_id, sent_at desc
) m
where c.id = m.contact_id;

-- Live updates: publish changes to the messages table to Supabase Realtime.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'whatsapp_messages'
     ) then
    alter publication supabase_realtime add table public.whatsapp_messages;
  end if;
end
$$;
