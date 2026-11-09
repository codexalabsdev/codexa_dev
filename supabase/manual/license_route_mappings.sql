-- Execute manualmente no Supabase antes de usar o gerador de middleware.
create table if not exists public.license_route_mappings (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id) on delete cascade,
  system_module_id uuid not null references public.system_modules(id) on delete cascade,
  route_pattern text not null,
  blocked_path text not null default '/licenca-bloqueada',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint license_route_mappings_route_check check (route_pattern like '/%' and route_pattern not like '%?%' and route_pattern not like '%#%'),
  constraint license_route_mappings_unique_route unique (license_id, route_pattern)
);
create index if not exists license_route_mappings_license_idx on public.license_route_mappings(license_id);
alter table public.license_route_mappings enable row level security;
revoke all on public.license_route_mappings from public, anon, authenticated;
grant select, insert, update, delete on public.license_route_mappings to service_role;
create policy "license route mappings are managed server-side" on public.license_route_mappings for all using (false) with check (false);
