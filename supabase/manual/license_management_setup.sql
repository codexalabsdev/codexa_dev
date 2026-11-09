-- Configuração manual do banco para validação remota de licenças.
-- Execute no SQL Editor do projeto Supabase na ordem deste arquivo.
-- Pré-requisitos: as tabelas public.licenses, public.system_modules e
-- public.team_members já devem existir.

set search_path = public, extensions;

create extension if not exists pgcrypto with schema extensions;

-- 1. Armazena somente o hash da chave de licença.
alter table public.licenses
  add column if not exists license_key_hash text;

update public.licenses
set license_key_hash = encode(digest(convert_to(license_key, 'UTF8'), 'sha256'), 'hex'),
    license_key = null
where license_key is not null
  and license_key_hash is null;

alter table public.licenses
  alter column license_key drop not null;

create unique index if not exists licenses_license_key_hash_uidx
  on public.licenses (license_key_hash)
  where license_key_hash is not null;

-- 2. Kill switch global da licença.
alter table public.licenses
  add column if not exists is_active boolean;

update public.licenses
set is_active = (lower(status) in ('active', 'ativa'))
where is_active is null;

alter table public.licenses
  alter column is_active set default true;

alter table public.licenses
  alter column is_active set not null;

create index if not exists licenses_is_active_idx
  on public.licenses (is_active)
  where is_active = false;

comment on column public.licenses.is_active is
  'Kill Switch mestre. false suspende imediatamente o client-script.';

create or replace function public.set_license_active_from_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status and new.is_active is not false then
    new.is_active := lower(new.status) in ('active', 'ativa');
  end if;
  return new;
end;
$$;

drop trigger if exists licenses_sync_active_status on public.licenses;
create trigger licenses_sync_active_status
before update on public.licenses
for each row execute function public.set_license_active_from_status();

-- 3. Módulos contratados e habilitados por licença.
create table if not exists public.license_module_entitlements (
  license_id uuid not null references public.licenses (id) on delete cascade,
  system_module_id uuid not null references public.system_modules (id) on delete cascade,
  is_contracted boolean not null default false,
  is_enabled boolean not null default false,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (license_id, system_module_id),
  constraint license_module_entitlements_enabled_requires_contracted
    check (not is_enabled or is_contracted)
);

create index if not exists license_module_entitlements_module_idx
  on public.license_module_entitlements (system_module_id);

alter table public.license_module_entitlements enable row level security;
revoke all on public.license_module_entitlements from public, anon, authenticated;
grant select, insert, update, delete on public.license_module_entitlements to service_role;

create or replace function public.is_license_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.team_members
    where user_id = (select auth.uid())
      and role_name = 'admin'
  );
$$;

revoke all on function public.is_license_admin() from public, anon;
grant execute on function public.is_license_admin() to authenticated;

drop policy if exists "Admins manage license module entitlements"
  on public.license_module_entitlements;
create policy "Admins manage license module entitlements"
  on public.license_module_entitlements
  for all
  to authenticated
  using (public.is_license_admin())
  with check (public.is_license_admin());

-- 4. Rate limit por IP para o endpoint público de validação.
create table if not exists public.license_validation_rate_limits (
  key_hash text not null,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count > 0),
  primary key (key_hash, window_start)
);

alter table public.license_validation_rate_limits enable row level security;
revoke all on public.license_validation_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.license_validation_rate_limits to service_role;

create or replace function public.consume_license_validation_rate_limit(
  p_key_hash text,
  p_limit integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window_start timestamptz;
  v_request_count integer;
begin
  if p_key_hash !~ '^[a-f0-9]{64}$' or p_limit < 1 or p_limit > 1000 then
    raise exception 'Invalid rate limit arguments';
  end if;

  v_window_start := to_timestamp(floor(extract(epoch from clock_timestamp()) / 60) * 60);

  insert into public.license_validation_rate_limits (key_hash, window_start, request_count)
  values (p_key_hash, v_window_start, 1)
  on conflict (key_hash, window_start)
  do update set request_count = public.license_validation_rate_limits.request_count + 1
  returning request_count into v_request_count;

  if v_request_count = 1 then
    delete from public.license_validation_rate_limits
    where window_start < now() - interval '1 day';
  end if;

  return v_request_count <= p_limit;
end;
$$;

revoke all on function public.consume_license_validation_rate_limit(text, integer)
  from public, anon, authenticated;
grant execute on function public.consume_license_validation_rate_limit(text, integer)
  to service_role;

-- Verificação opcional, sem expor chaves ou dados de usuários:
-- select to_regclass('public.licenses'),
--        to_regclass('public.system_modules'),
--        to_regclass('public.license_module_entitlements'),
--        to_regclass('public.license_validation_rate_limits');
