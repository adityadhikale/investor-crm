-- Company field and bulk updates (16 Oct 2026).
--
-- 1. contacts.company: where a contact works.
-- 2. bulk_change_contact_tags: add, remove or replace a tag on many contacts in
--    one statement (used by "Change tag" on the Contacts list).
-- 3. bulk_update_contacts: update several fields on many contacts in one
--    statement (used by "Update from file"). A field that is null in the input
--    is left exactly as it is, so only the columns present in the uploaded file
--    change.
--
-- Both functions run with the caller's permissions, so the owner-only
-- row-level security still applies. Additive only; safe to run more than once.
-- RUN THIS BEFORE deploying the matching version of the CRM.

alter table public.contacts add column if not exists company text;

create or replace function public.bulk_change_contact_tags(
  p_ids uuid[],
  p_mode text,
  p_tag text
)
returns integer
language plpgsql
as $$
declare
  n integer := 0;
begin
  if p_mode = 'add' then
    update public.contacts
    set tags = coalesce(tags, '{}') || p_tag
    where id = any(p_ids)
      and deleted_at is null
      and not (p_tag = any(coalesce(tags, '{}')));
  elsif p_mode = 'remove' then
    update public.contacts
    set tags = array_remove(coalesce(tags, '{}'), p_tag)
    where id = any(p_ids)
      and deleted_at is null
      and p_tag = any(coalesce(tags, '{}'));
  elsif p_mode = 'replace' then
    update public.contacts
    set tags = array[p_tag]
    where id = any(p_ids)
      and deleted_at is null
      and tags is distinct from array[p_tag];
  else
    raise exception 'Unknown mode %', p_mode;
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.bulk_update_contacts(p_rows jsonb)
returns integer
language plpgsql
as $$
declare
  n integer := 0;
begin
  update public.contacts c
  set name = coalesce(r.name, c.name),
      email = coalesce(r.email, c.email),
      company = coalesce(r.company, c.company),
      notes = coalesce(r.notes, c.notes),
      date_saved = coalesce(r.date_saved, c.date_saved),
      tags = coalesce(r.tags, c.tags)
  from jsonb_to_recordset(p_rows) as r(
    id uuid,
    name text,
    email text,
    company text,
    notes text,
    date_saved date,
    tags text[]
  )
  where c.id = r.id
    and c.deleted_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;
