begin;

do $$
declare
  v_has_active boolean;
  v_has_share boolean;
  v_has_archive boolean;
  v_obsolete_actions_inactive boolean;
  v_effective_function text;
  v_has_archive_trigger boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'access_permissions'
      and column_name = 'is_active'
  ) into v_has_active;
  if not v_has_active then
    raise exception 'access_permissions.is_active is missing; apply supabase/migrations/20261031130000_workspace_permission_catalog.sql before running this test';
  end if;

  select exists (
    select 1 from public.access_permissions
    where module_name = 'projects' and action_name = 'share' and is_active
  ) into v_has_share;
  if not v_has_share then raise exception 'projects:share is not active'; end if;

  select exists (
    select 1 from public.access_permissions
    where module_name = 'projects' and action_name = 'archive' and is_active
  ) into v_has_archive;
  if not v_has_archive then raise exception 'projects:archive is not active'; end if;

  select not exists (
    select 1 from public.access_permissions
    where is_active and (
      (module_name = 'projects' and action_name in ('upload', 'download'))
      or module_name = 'calendar'
    )
  ) into v_obsolete_actions_inactive;
  if not v_obsolete_actions_inactive then
    raise exception 'obsolete project/calendar permission combinations remain active';
  end if;

  select pg_get_functiondef(p.oid) into v_effective_function
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'effective_workspace_permission'
    and pg_get_function_identity_arguments(p.oid) = 'p_member_id uuid, p_module text, p_action text';
  if v_effective_function is null or v_effective_function not ilike '%permission.is_active%' then
    raise exception 'effective permission resolver does not filter inactive catalog entries';
  end if;

  select exists (
    select 1 from pg_trigger trigger_row
    join pg_class table_row on table_row.oid = trigger_row.tgrelid
    join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
    where schema_row.nspname = 'public'
      and table_row.relname = 'projects'
      and trigger_row.tgname = 'projects_require_archive_permission'
      and not trigger_row.tgisinternal
  ) into v_has_archive_trigger;
  if not v_has_archive_trigger then
    raise exception 'project archive permission trigger is missing';
  end if;
end;
$$;

rollback;