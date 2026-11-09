create table if not exists public.license_integrations (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null unique references public.licenses(id) on delete cascade,
  installation_id text not null unique,
  project_type text not null default 'nextjs-supabase',
  sdk_version text not null default '0.1.0',
  token_hash text not null unique,
  status text not null default 'prepared' check (status in ('prepared','awaiting_installation','connected','error','revoked')),
  last_validation_at timestamptz,
  last_validation_status text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists license_integrations_license_id_idx on public.license_integrations(license_id);
create index if not exists license_integrations_status_idx on public.license_integrations(status);

alter table public.license_integrations enable row level security;

create policy "license integrations are managed server-side"
  on public.license_integrations for all
  using (false)
  with check (false);

comment on table public.license_integrations is 'Identidade e credencial hash da integração server-to-server de cada instalação cliente.';
