-- CRM settings (single row).
--
-- Holds the preferences edited on /my-profile: the daily reminder email and
-- which notification types appear in the top-bar bell. The theme is stored
-- per-device in the browser and is not part of this table.

create table if not exists public.app_settings (
  id text primary key default 'default' check (id = 'default'),
  reminder_email_enabled boolean not null default true,
  reminder_email_to text,
  reminder_include_followups boolean not null default true,
  reminder_include_unread boolean not null default true,
  notify_messages boolean not null default true,
  notify_followups boolean not null default true,
  notify_broadcasts boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values ('default')
on conflict (id) do nothing;

-- Same permissive single-user policy as the rest of the CRM.
alter table public.app_settings enable row level security;

drop policy if exists "Allow all for authenticated" on public.app_settings;
create policy "Allow all for authenticated"
  on public.app_settings
  for all
  to authenticated
  using (true)
  with check (true);
