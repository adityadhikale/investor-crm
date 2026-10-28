-- Portfolio updates (28 Oct 2026).
--
-- Investor / portfolio updates (PDF, Excel, CSV or pasted text) attached to a
-- contact, with an AI analysis (AUM, returns, top 5 gainers and bottom 5
-- losers, change versus the previous update) stored next to each one.
--
-- Files live in a private storage bucket, "portfolio-updates", opened only
-- through the signed-in CRM. Safe to run more than once.

insert into storage.buckets (id, name, public)
values ('portfolio-updates', 'portfolio-updates', false)
on conflict (id) do nothing;

create table if not exists public.portfolio_updates (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  title text,
  file_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  source text not null default 'file' check (source in ('file', 'paste')),
  analysis jsonb,
  analysis_status text not null default 'pending'
    check (analysis_status in ('pending', 'done', 'failed')),
  analysis_error text,
  as_of_date date,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists portfolio_updates_contact_idx
  on public.portfolio_updates (contact_id, created_at desc);

alter table public.portfolio_updates enable row level security;

drop policy if exists "Owner only" on public.portfolio_updates;
create policy "Owner only" on public.portfolio_updates
  for all to authenticated
  using (public.is_crm_owner())
  with check (public.is_crm_owner());
