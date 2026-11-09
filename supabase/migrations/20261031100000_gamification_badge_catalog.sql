alter table public.profile_badges
  add column if not exists category text not null default 'Especial',
  add column if not exists rarity text not null default 'common',
  add column if not exists unlock_criteria jsonb not null default '{}'::jsonb,
  add column if not exists is_active boolean not null default true,
  add column if not exists archived_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profile_badges_rarity_check'
      and conrelid = 'public.profile_badges'::regclass
  ) then
    alter table public.profile_badges
      add constraint profile_badges_rarity_check
      check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary', 'special'));
  end if;
end;
$$;

create index if not exists profile_badges_catalog_active_idx
  on public.profile_badges (is_active, granted_at desc)
  where member_id is null;

create index if not exists profile_badges_source_member_idx
  on public.profile_badges (source_badge_id, member_id)
  where source_badge_id is not null;