-- Codexa: preferências de aparência por usuário
-- Aplicar manualmente no Supabase SQL Editor.
-- Este script é idempotente e não altera dados existentes.

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'dark',
  primary_color text not null default '#38bdf8',
  secondary_color text not null default '#818cf8',
  tertiary_color text not null default '#22d3ee',
  background_color text not null default '#090b10',
  surface_color text not null default '#11161e',
  sidebar_color text not null default '#0d1118',
  header_color text not null default '#090b10',
  text_color text not null default '#f4f7fb',
  muted_text_color text not null default '#94a3b8',
  border_color text not null default '#263142',
  focus_color text not null default '#38bdf8',
  font_size_base integer not null default 16,
  heading_scale numeric not null default 1,
  font_weight integer not null default 400,
  line_height numeric not null default 1.5,
  letter_spacing numeric not null default 0,
  button_radius numeric not null default 0.65,
  card_radius numeric not null default 0.85,
  shadow_strength integer not null default 28,
  appearance_palette text not null default 'custom',
  accent_color text not null default '#38bdf8',
  font_family text not null default 'inter',
  radius_scale text not null default 'comfortable',
  contrast_mode text not null default 'standard',
  motion_mode text not null default 'full',
  navigation_collapsed boolean not null default false,
  table_density text not null default 'comfortable',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences add column if not exists theme text not null default 'dark';
alter table public.user_preferences add column if not exists primary_color text not null default '#38bdf8';
alter table public.user_preferences add column if not exists secondary_color text not null default '#818cf8';
alter table public.user_preferences add column if not exists tertiary_color text not null default '#22d3ee';
alter table public.user_preferences add column if not exists background_color text not null default '#090b10';
alter table public.user_preferences add column if not exists surface_color text not null default '#11161e';
alter table public.user_preferences add column if not exists sidebar_color text not null default '#0d1118';
alter table public.user_preferences add column if not exists header_color text not null default '#090b10';
alter table public.user_preferences add column if not exists text_color text not null default '#f4f7fb';
alter table public.user_preferences add column if not exists muted_text_color text not null default '#94a3b8';
alter table public.user_preferences add column if not exists border_color text not null default '#263142';
alter table public.user_preferences add column if not exists focus_color text not null default '#38bdf8';
alter table public.user_preferences add column if not exists font_size_base integer not null default 16;
alter table public.user_preferences add column if not exists heading_scale numeric not null default 1;
alter table public.user_preferences add column if not exists font_weight integer not null default 400;
alter table public.user_preferences add column if not exists line_height numeric not null default 1.5;
alter table public.user_preferences add column if not exists letter_spacing numeric not null default 0;
alter table public.user_preferences add column if not exists button_radius numeric not null default 0.65;
alter table public.user_preferences add column if not exists card_radius numeric not null default 0.85;
alter table public.user_preferences add column if not exists shadow_strength integer not null default 28;
alter table public.user_preferences add column if not exists appearance_palette text not null default 'custom';
alter table public.user_preferences add column if not exists accent_color text not null default '#38bdf8';
alter table public.user_preferences add column if not exists font_family text not null default 'inter';
alter table public.user_preferences add column if not exists radius_scale text not null default 'comfortable';
alter table public.user_preferences add column if not exists contrast_mode text not null default 'standard';
alter table public.user_preferences add column if not exists motion_mode text not null default 'full';
alter table public.user_preferences add column if not exists navigation_collapsed boolean not null default false;
alter table public.user_preferences add column if not exists table_density text not null default 'comfortable';
alter table public.user_preferences add column if not exists created_at timestamptz not null default now();
alter table public.user_preferences add column if not exists updated_at timestamptz not null default now();

alter table public.user_preferences enable row level security;

drop policy if exists user_preferences_select_own on public.user_preferences;
create policy user_preferences_select_own
  on public.user_preferences for select
  using (auth.uid() = user_id);

drop policy if exists user_preferences_insert_own on public.user_preferences;
create policy user_preferences_insert_own
  on public.user_preferences for insert
  with check (auth.uid() = user_id);

drop policy if exists user_preferences_update_own on public.user_preferences;
create policy user_preferences_update_own
  on public.user_preferences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists user_preferences_delete_own on public.user_preferences;
create policy user_preferences_delete_own
  on public.user_preferences for delete
  using (auth.uid() = user_id);

create or replace function public.touch_user_preferences_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_preferences_touch_updated_at on public.user_preferences;
create trigger user_preferences_touch_updated_at
  before update on public.user_preferences
  for each row execute function public.touch_user_preferences_updated_at();
