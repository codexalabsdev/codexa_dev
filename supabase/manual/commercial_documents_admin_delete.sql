-- Execute manualmente no Supabase SQL Editor para habilitar a exclusão administrativa.
-- Cada documento excluído é copiado integralmente para o arquivo de auditoria,
-- junto com todos os eventos e um evento final de exclusão, antes da remoção.

create table if not exists public.workspace_commercial_document_archive (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null unique,
  document_number text,
  document_snapshot jsonb not null,
  event_history jsonb not null,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz not null default now()
);

alter table public.workspace_commercial_document_archive enable row level security;
revoke all on public.workspace_commercial_document_archive from anon, authenticated;
grant select, insert, update, delete on public.workspace_commercial_document_archive to service_role;

create or replace function public.archive_and_delete_workspace_commercial_document(
  p_document_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.workspace_commercial_documents;
  v_events jsonb;
  v_deleted_at timestamptz := now();
  v_is_admin boolean;
begin
  select exists (
    select 1
    from public.team_members member
    join public.access_roles role
      on lower(btrim(role.name)) = lower(btrim(member.role_name))
    where member.user_id = p_actor_id
      and lower(btrim(role.name)) in ('admin', 'administrador')
      and role.is_active = true
      and lower(trim(both '"' from trim(both '''' from btrim(coalesce(member.status, '')))))
        in ('active', 'ativo', 'enabled', 'habilitado')
  ) into v_is_admin;

  if not coalesce(v_is_admin, false) then
    raise exception 'administrator role required' using errcode = '42501';
  end if;

  select * into v_document
  from public.workspace_commercial_documents
  where id = p_document_id
  for update;
  if not found then
    raise exception 'document not found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(to_jsonb(event_row) order by event_row.created_at, event_row.id), '[]'::jsonb)
  into v_events
  from public.workspace_document_events event_row
  where event_row.document_id = p_document_id;

  v_events := v_events || jsonb_build_array(jsonb_build_object(
    'event_type', 'deleted',
    'actor_id', p_actor_id,
    'details', '{}'::jsonb,
    'created_at', v_deleted_at
  ));

  insert into public.workspace_commercial_document_archive (
    source_document_id, document_number, document_snapshot,
    event_history, deleted_by, deleted_at
  ) values (
    v_document.id, v_document.document_number, to_jsonb(v_document),
    v_events, p_actor_id, v_deleted_at
  );

  delete from public.workspace_document_events where document_id = p_document_id;
  delete from public.workspace_commercial_documents where id = p_document_id;

  return jsonb_build_object('pdf_storage_path', v_document.pdf_storage_path);
end;
$$;

revoke all on function public.archive_and_delete_workspace_commercial_document(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.archive_and_delete_workspace_commercial_document(uuid, uuid)
  to service_role;
