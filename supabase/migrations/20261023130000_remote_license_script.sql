-- Controle remoto de licenças para o client-script.js.
-- A migração 20261022100000_license_management.sql já cria o hash,
-- os vínculos de módulos e o rate limit usados pela API.

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

-- O endpoint público lê os dados com service_role e não expõe a chave secreta.
-- O client-script usa POST /api/licenses/validate com Authorization: Bearer <chave>.
