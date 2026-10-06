-- BASELINE SCHEMA (reference, written 6 Oct 2026).
--
-- The original CREATE TABLE statements for these tables were never saved in
-- this repository. This file records them as they exist in the live database
-- (read from the database's own description of itself), so a new copy of the
-- database can be rebuilt from the repository: run this file first, then the
-- other migrations in file-name order.
--
-- Every statement uses "if not exists", so running it on the live database
-- changes nothing. Not captured from the database description, and therefore
-- not listed here: ON DELETE rules on the foreign keys, CHECK constraints
-- on text columns (for example "direction" and the "status" columns), indexes
-- created outside the migrations, and row-level security. The later migrations
-- add the owner-only security policies and the indexes they created.

create extension if not exists pgcrypto;

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text,
  tags text[],
  date_saved date,
  notes text,
  whatsapp_summary text,
  whatsapp_summary_generated_at timestamptz,
  last_read_at timestamptz,
  created_at timestamptz default now(),
  deleted_at timestamptz
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now(),
  deleted_at timestamptz
);

create table if not exists public.contact_groups (
  contact_id uuid not null references public.contacts(id),
  group_id uuid not null references public.groups(id),
  primary key (contact_id, group_id)
);

create table if not exists public.interactions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id),
  type text not null,            -- "meeting" or "follow_up" in the application
  note text,
  created_at timestamptz default now(),
  deleted_at timestamptz
);

create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id),
  due_date date not null,
  message text,
  is_done boolean default false,
  created_at timestamptz default now(),
  deleted_at timestamptz
);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  meta_template_id text,         -- set for templates synced from Meta
  body_text text,
  variables jsonb,
  category text,
  language text not null default 'en_US',
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  message_text text not null,
  media_url text,
  target_type text not null,
  target_ids text[] not null,
  status text not null default 'draft',   -- draft | scheduled | sending | sent
  scheduled_for timestamptz,
  sent_at timestamptz,
  template_id uuid references public.templates(id),
  variable_mappings jsonb,
  send_summary jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id),   -- null for unknown numbers
  direction text not null,                          -- "in" or "out"
  message_text text,
  media_url text,
  sent_at timestamptz not null,
  phone text,
  profile_name text,
  wamid text,
  status text,                                      -- sent | delivered | read | failed
  status_error text,
  status_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- broadcast_recipients and app_settings are created in full by their own
-- migrations (20261003030000 and 20260930010000).
