begin;

do $create_client_contact_codes$
declare
  v_client_id_type text;
begin
  select pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
    into v_client_id_type
  from pg_catalog.pg_attribute attribute
  where attribute.attrelid = 'public.clients'::regclass
    and attribute.attname = 'id'
    and attribute.attnum > 0
    and not attribute.attisdropped;

  if v_client_id_type is null then
    raise exception 'public.clients.id was not found';
  end if;

  execute format($table$
    create table if not exists public.client_contact_codes (
      id uuid primary key default pg_catalog.gen_random_uuid(),
      client_id %s not null references public.clients(id) on delete cascade,
      code text not null unique check (code ~ '^CX-[A-F0-9]{32}$'),
      created_by uuid references auth.users(id) on delete set null,
      created_at timestamptz not null default now(),
      revoked_by uuid references auth.users(id) on delete set null,
      revoked_at timestamptz
    )
  $table$, v_client_id_type);
end;
$create_client_contact_codes$;

create unique index if not exists client_contact_codes_one_active_per_client
  on public.client_contact_codes (client_id)
  where revoked_at is null;

alter table public.client_contact_codes enable row level security;
revoke all on table public.client_contact_codes from public, anon, authenticated;
grant all on table public.client_contact_codes to service_role;

insert into public.access_permissions (id, module_name, action_name, is_active)
values
  (gen_random_uuid(), 'clients', 'generate_contact_codes', true),
  (gen_random_uuid(), 'clients', 'revoke_contact_codes', true)
on conflict (module_name, action_name) do update
set is_active = true;

create or replace function public.create_initial_client_contact_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.client_contact_codes (client_id, code, created_by)
  values (
    new.id,
    'CX-' || upper(replace(pg_catalog.gen_random_uuid()::text, '-', '')),
    auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists clients_create_initial_contact_code on public.clients;
create trigger clients_create_initial_contact_code
after insert on public.clients
for each row execute function public.create_initial_client_contact_code();

create or replace function public.issue_client_contact_code(p_client_id text, p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id public.clients.id%TYPE;
  v_code text;
  v_result jsonb;
begin
  select client.id into v_client_id
  from public.clients client
  where client.id::text = p_client_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Client not found';
  end if;

  update public.client_contact_codes code_record
  set revoked_at = now(), revoked_by = p_actor_id
  where code_record.client_id = v_client_id
    and code_record.revoked_at is null;

  v_code := 'CX-' || upper(replace(pg_catalog.gen_random_uuid()::text, '-', ''));

  insert into public.client_contact_codes (client_id, code, created_by)
  values (v_client_id, v_code, p_actor_id)
  returning jsonb_build_object(
    'id', id,
    'client_id', client_id::text,
    'code', code,
    'created_at', created_at,
    'revoked_at', revoked_at
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.issue_client_contact_code(text, uuid) from public, anon, authenticated;
grant execute on function public.issue_client_contact_code(text, uuid) to service_role;

create or replace function public.prevent_non_admin_client_contact_code_grants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.access_permissions permission
    where permission.id = new.permission_id
      and permission.module_name = 'clients'
      and permission.action_name in ('generate_contact_codes', 'revoke_contact_codes')
  ) and not exists (
    select 1
    from public.access_roles role
    where role.id = new.role_id
      and lower(btrim(role.name)) = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'Client contact code permissions are admin-only';
  end if;

  return new;
end;
$$;

drop trigger if exists role_permissions_admin_only_client_codes on public.role_permissions;
create trigger role_permissions_admin_only_client_codes
before insert or update on public.role_permissions
for each row execute function public.prevent_non_admin_client_contact_code_grants();

create or replace function public.prevent_non_admin_client_contact_code_overrides()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.access_permissions permission
    where permission.id = new.permission_id
      and permission.module_name = 'clients'
      and permission.action_name in ('generate_contact_codes', 'revoke_contact_codes')
  ) and not exists (
    select 1
    from public.team_members member
    where member.id = new.member_id
      and lower(btrim(member.role_name)) = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'Client contact code overrides are admin-only';
  end if;

  return new;
end;
$$;

drop trigger if exists member_permission_admin_only_client_codes on public.workspace_member_permission_overrides;
create trigger member_permission_admin_only_client_codes
before insert or update on public.workspace_member_permission_overrides
for each row execute function public.prevent_non_admin_client_contact_code_overrides();

commit;
