-- Performance indexes (3 Oct 2026). Additive only: no data, columns, policies
-- or behaviour change. Safe to run more than once ("if not exists").
--
-- To see what already exists before/after running this:
--   select tablename, indexname, indexdef from pg_indexes
--   where schemaname = 'public' order by 1, 2;

-- unread_conversations() looks up each contact's inbound messages and their
-- latest outbound message; the WhatsApp history panel reads by contact + time.
create index if not exists whatsapp_messages_contact_direction_sent_at_idx
  on public.whatsapp_messages (contact_id, direction, sent_at)
  where deleted_at is null;

-- Pending / overdue follow-ups (dashboard, bell, reminder email).
create index if not exists follow_ups_pending_due_date_idx
  on public.follow_ups (is_done, due_date)
  where deleted_at is null;

-- Follow-ups and interactions listed on a contact's page.
create index if not exists follow_ups_contact_id_idx
  on public.follow_ups (contact_id);

create index if not exists interactions_contact_id_created_at_idx
  on public.interactions (contact_id, created_at);

-- Incoming WhatsApp messages are matched to a contact by phone number.
create index if not exists contacts_phone_idx
  on public.contacts (phone);

-- Tag filters use contains / overlaps on the tags array.
create index if not exists contacts_tags_gin_idx
  on public.contacts using gin (tags);

-- Group membership lookups in both directions.
create index if not exists contact_groups_group_id_idx
  on public.contact_groups (group_id);

create index if not exists contact_groups_contact_id_idx
  on public.contact_groups (contact_id);
