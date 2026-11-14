alter table public.workspace_document_settings
  add column if not exists issuer_primary_color text not null default '#17324D',
  add column if not exists issuer_secondary_color text not null default '#0F766E';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workspace_document_settings_primary_color_format'
      and conrelid = 'public.workspace_document_settings'::regclass
  ) then
    alter table public.workspace_document_settings
      add constraint workspace_document_settings_primary_color_format
      check (issuer_primary_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'workspace_document_settings_secondary_color_format'
      and conrelid = 'public.workspace_document_settings'::regclass
  ) then
    alter table public.workspace_document_settings
      add constraint workspace_document_settings_secondary_color_format
      check (issuer_secondary_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end;
$$;
