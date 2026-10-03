-- Batched broadcast sending (3 Oct 2026).
--
-- Netlify gives each request about 60 seconds, enough for roughly 100
-- WhatsApp sends. Large broadcasts are therefore sent in batches: when a
-- broadcast starts, every recipient gets a row here ("pending"), and each run
-- claims a batch, sends it and records the outcome. Claiming uses
-- FOR UPDATE SKIP LOCKED, so two runs can never send to the same person.
--
-- Safe to run more than once.

-- 1. Allow the in-progress status "sending" on broadcasts.
do $$
declare
  c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.broadcasts'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.broadcasts drop constraint %I', c);
  end loop;
end
$$;

alter table public.broadcasts
  add constraint broadcasts_status_check
  check (status in ('draft', 'scheduled', 'sending', 'sent'));

-- 2. One row per recipient of a broadcast.
create table if not exists public.broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references public.broadcasts(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  name text,
  phone text,
  email text,
  -- pending -> sending -> sent | skipped | failed
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'skipped', 'failed')),
  error text,
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (broadcast_id, contact_id)
);

create index if not exists broadcast_recipients_broadcast_status_idx
  on public.broadcast_recipients (broadcast_id, status);

-- Same owner-only access as every other CRM table.
alter table public.broadcast_recipients enable row level security;
drop policy if exists "Owner only" on public.broadcast_recipients;
create policy "Owner only" on public.broadcast_recipients
  for all to authenticated
  using (public.is_crm_owner()) with check (public.is_crm_owner());

-- 3. Atomically claim the next batch of pending recipients.
create or replace function public.claim_broadcast_recipients(
  p_broadcast_id uuid,
  p_limit integer
)
returns setof public.broadcast_recipients
language sql
set search_path = public
as $$
  update public.broadcast_recipients r
  set status = 'sending', claimed_at = now()
  where r.id in (
    select id from public.broadcast_recipients
    where broadcast_id = p_broadcast_id and status = 'pending'
    order by created_at, id
    limit p_limit
    for update skip locked
  )
  returning r.*;
$$;

revoke execute on function public.claim_broadcast_recipients(uuid, integer) from anon;
