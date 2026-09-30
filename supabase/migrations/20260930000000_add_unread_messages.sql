-- Unread WhatsApp conversations.
--
-- A conversation is "unread" when the contact has sent inbound messages that are
-- newer than BOTH the last time the conversation was opened in the CRM
-- (contacts.last_read_at) AND the last outbound message we sent to that contact
-- (a reply from the CRM or from the phone via coexistence also clears it).

alter table public.contacts
  add column if not exists last_read_at timestamptz;

create or replace function public.unread_conversations()
returns table (
  contact_id contacts.id%type,
  unread_count bigint,
  last_message_at timestamptz,
  last_message_text text,
  last_media_url text
)
language sql
stable
as $$
  select
    m.contact_id,
    count(*) as unread_count,
    max(m.sent_at) as last_message_at,
    (array_agg(m.message_text order by m.sent_at desc))[1] as last_message_text,
    (array_agg(m.media_url order by m.sent_at desc))[1] as last_media_url
  from public.whatsapp_messages m
  join public.contacts c
    on c.id = m.contact_id
   and c.deleted_at is null
  where m.direction = 'in'
    and m.deleted_at is null
    and m.sent_at > coalesce(c.last_read_at, '-infinity'::timestamptz)
    and m.sent_at > coalesce(
      (
        select max(o.sent_at)
        from public.whatsapp_messages o
        where o.contact_id = c.id
          and o.direction = 'out'
          and o.deleted_at is null
      ),
      '-infinity'::timestamptz
    )
  group by m.contact_id
  order by max(m.sent_at) desc;
$$;
