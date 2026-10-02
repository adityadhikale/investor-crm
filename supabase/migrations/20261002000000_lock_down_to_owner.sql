-- Lock every CRM table to the single owner account.
--
-- Before this migration:
--   * broadcasts, templates and whatsapp_messages allowed ALL access to anyone
--     holding the public anon key, with no login at all (policy: true).
--   * every other table allowed ALL access to any signed-in account, so a
--     stranger who signed up through Supabase's public sign-up endpoint would
--     have had full access.
--
-- After it, only the owner's user id passes. The server-only service-role key
-- (used by the WhatsApp webhook and the scheduled jobs) bypasses row-level
-- security and is unaffected.
--
-- To roll back, re-create the old policies, e.g.:
--   create policy "Allow all for authenticated" on public.templates
--     for all using (true) with check (true);

create or replace function public.is_crm_owner()
returns boolean
language sql
stable
set search_path = public
as $$
  select auth.uid() = 'ff04929a-ae33-454b-8f18-0c81a4059022'::uuid
$$;

do $$
declare
  t text;
  p text;
begin
  foreach t in array array[
    'contacts', 'groups', 'contact_groups', 'interactions', 'follow_ups',
    'whatsapp_messages', 'templates', 'broadcasts', 'app_settings'
  ]
  loop
    -- app_settings only exists once its own migration has been run.
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    for p in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', p, t);
    end loop;

    execute format(
      'create policy "Owner only" on public.%I for all to authenticated using (public.is_crm_owner()) with check (public.is_crm_owner())',
      t
    );
  end loop;
end
$$;
