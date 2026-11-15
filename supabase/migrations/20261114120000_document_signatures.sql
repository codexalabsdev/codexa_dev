begin;

create table if not exists public.internal_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 160),
  description text not null default '',
  category text not null default 'geral' check (category in ('geral', 'contratos', 'avisos', 'metas', 'processos', 'financeiro')),
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size between 1 and 20971520),
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);

create table if not exists public.document_links (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.internal_documents(id) on delete cascade,
  entity_type text not null check (entity_type in ('project', 'task', 'contract', 'support_ticket', 'financial')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  linked_by uuid not null references auth.users(id),
  unique (document_id, entity_type, entity_id)
);

alter table public.internal_documents enable row level security;
alter table public.document_links enable row level security;
grant select, insert, update, delete on public.internal_documents, public.document_links to authenticated;
grant all on public.internal_documents, public.document_links to service_role;

drop policy if exists internal_documents_select on public.internal_documents;
create policy internal_documents_select on public.internal_documents for select to authenticated
  using (public.has_workspace_permission('documents', 'view') and public.workspace_row_scope('documents', to_jsonb(internal_documents)));
drop policy if exists internal_documents_insert on public.internal_documents;
create policy internal_documents_insert on public.internal_documents for insert to authenticated
  with check (public.has_workspace_permission('documents', 'upload') and created_by = auth.uid());
drop policy if exists internal_documents_update on public.internal_documents;
create policy internal_documents_update on public.internal_documents for update to authenticated
  using (public.has_workspace_permission('documents', 'update') and public.workspace_row_scope('documents', to_jsonb(internal_documents)))
  with check (public.has_workspace_permission('documents', 'update') and created_by = auth.uid());
drop policy if exists internal_documents_delete on public.internal_documents;
create policy internal_documents_delete on public.internal_documents for delete to authenticated
  using (public.has_workspace_permission('documents', 'delete') and public.workspace_row_scope('documents', to_jsonb(internal_documents)));
drop policy if exists document_links_select on public.document_links;
create policy document_links_select on public.document_links for select to authenticated
  using (public.has_workspace_permission('documents', 'view') and exists (
    select 1 from public.internal_documents document where document.id = document_links.document_id
  ));
drop policy if exists document_links_insert on public.document_links;
create policy document_links_insert on public.document_links for insert to authenticated
  with check (public.has_workspace_permission('documents', 'upload') and linked_by = auth.uid() and exists (
    select 1 from public.internal_documents document where document.id = document_links.document_id
  ));
drop policy if exists document_links_delete on public.document_links;
create policy document_links_delete on public.document_links for delete to authenticated
  using (public.has_workspace_permission('documents', 'upload') and exists (
    select 1 from public.internal_documents document where document.id = document_links.document_id
  ));

create table if not exists public.document_signing_processes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 160),
  source_document_id uuid references public.internal_documents(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'awaiting_signatures', 'partially_signed', 'signed', 'refused', 'cancelled', 'expired', 'processing')),
  original_storage_path text not null,
  final_storage_path text,
  original_sha256 text not null check (original_sha256 ~ '^[a-f0-9]{64}$'),
  final_sha256 text check (final_sha256 is null or final_sha256 ~ '^[a-f0-9]{64}$'),
  page_count integer not null check (page_count > 0),
  expires_at timestamptz,
  created_by uuid not null references auth.users(id),
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'signed') = (signed_at is not null)),
  check ((status = 'signed') = (final_storage_path is not null)),
  check ((status = 'signed') = (final_sha256 is not null))
);

create table if not exists public.document_signers (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.document_signing_processes(id) on delete restrict,
  user_id uuid not null references auth.users(id),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 160),
  email text not null check (char_length(email) between 3 and 254),
  signer_type text not null default 'internal' check (signer_type in ('internal', 'external')),
  signing_order integer not null default 1 check (signing_order > 0),
  status text not null default 'pending' check (status in ('pending', 'signed', 'refused')),
  authentication_method text,
  consent_text text,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (process_id, user_id),
  check ((status = 'signed') = (signed_at is not null))
);

create table if not exists public.document_signing_fields (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.document_signing_processes(id) on delete restrict,
  signer_id uuid not null references public.document_signers(id) on delete restrict,
  page_number integer not null check (page_number > 0),
  x_percent numeric(6,3) not null check (x_percent between 0 and 100),
  y_percent numeric(6,3) not null check (y_percent between 0 and 100),
  width_percent numeric(6,3) not null check (width_percent between 1 and 100),
  height_percent numeric(6,3) not null check (height_percent between 1 and 100),
  field_type text not null default 'signature' check (field_type in ('signature', 'name', 'date')),
  status text not null default 'pending' check (status in ('pending', 'filled')),
  created_at timestamptz not null default now(),
  check (x_percent + width_percent <= 100 and y_percent + height_percent <= 100)
);

create table if not exists public.document_signing_events (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.document_signing_processes(id) on delete restrict,
  signer_id uuid references public.document_signers(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('uploaded', 'prepared', 'signature_requested', 'link_accessed', 'authenticated', 'signed', 'refused', 'cancelled', 'expired', 'finalized')),
  event_data jsonb not null default '{}'::jsonb check (jsonb_typeof(event_data) = 'object'),
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists document_signing_processes_created_idx on public.document_signing_processes (created_at desc);
create index if not exists document_signing_processes_status_idx on public.document_signing_processes (status, created_at desc);
create index if not exists document_signers_process_idx on public.document_signers (process_id, signing_order);
create index if not exists document_signing_fields_process_idx on public.document_signing_fields (process_id, page_number);
create index if not exists document_signing_events_process_idx on public.document_signing_events (process_id, created_at desc);

alter table public.document_signing_processes enable row level security;
alter table public.document_signers enable row level security;
alter table public.document_signing_fields enable row level security;
alter table public.document_signing_events enable row level security;

revoke all on public.document_signing_processes, public.document_signers, public.document_signing_fields, public.document_signing_events from anon, authenticated;
grant all on public.document_signing_processes, public.document_signers, public.document_signing_fields, public.document_signing_events to service_role;

create or replace function public.prevent_document_signing_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'document signing evidence is immutable' using errcode = '42501';
end;
$$;

create trigger document_signing_events_immutable
  before update or delete on public.document_signing_events
  for each row execute function public.prevent_document_signing_event_mutation();

create or replace function public.prevent_signed_process_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'signed' then
    raise exception 'signed processes are immutable' using errcode = '42501';
  end if;
  if old.original_sha256 is distinct from new.original_sha256
    or old.original_storage_path is distinct from new.original_storage_path
    or old.created_by is distinct from new.created_by then
    raise exception 'original document data is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger document_signing_processes_immutable_guard
  before update on public.document_signing_processes
  for each row execute function public.prevent_signed_process_mutation();

create or replace function public.finalize_document_signature(
  p_process_id uuid,
  p_signer_id uuid,
  p_actor_id uuid,
  p_final_storage_path text,
  p_final_sha256 text,
  p_consent_text text,
  p_signature_type text,
  p_ip_address inet,
  p_user_agent text,
  p_timezone text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
begin
  if p_final_sha256 !~ '^[a-f0-9]{64}$'
    or p_signature_type not in ('drawn', 'typed')
    or p_consent_text <> 'Declaro que li e concordo com o conteúdo deste documento e confirmo minha assinatura eletrônica.' then
    raise exception 'invalid signature evidence' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.document_signers signer
    where signer.id = p_signer_id and signer.process_id = p_process_id
      and signer.user_id = p_actor_id and signer.status = 'pending'
  ) then
    raise exception 'signer is not authorized or already completed' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.document_signing_processes process
    where process.id = p_process_id and process.status = 'processing'
  ) then
    raise exception 'process is not being finalized' using errcode = '40001';
  end if;

  update public.document_signers
  set status = 'signed', signed_at = v_now,
      authentication_method = 'authenticated-session', consent_text = p_consent_text
  where id = p_signer_id and status = 'pending';
  if not found then raise exception 'signer already completed' using errcode = '40001'; end if;

  update public.document_signing_fields
  set status = 'filled'
  where process_id = p_process_id and signer_id = p_signer_id;
  if not found then raise exception 'signature field is missing' using errcode = '22023'; end if;

  update public.document_signing_processes
  set status = 'signed', final_storage_path = p_final_storage_path,
      final_sha256 = p_final_sha256, signed_at = v_now, updated_at = v_now
  where id = p_process_id and status = 'processing';
  if not found then raise exception 'process changed while signing' using errcode = '40001'; end if;

  insert into public.document_signing_events (process_id, signer_id, actor_id, event_type, event_data, ip_address, user_agent)
  values
    (p_process_id, p_signer_id, p_actor_id, 'authenticated', jsonb_build_object('method', 'authenticated-session'), p_ip_address, p_user_agent),
    (p_process_id, p_signer_id, p_actor_id, 'signed', jsonb_build_object('consent_text', p_consent_text, 'signature_type', p_signature_type, 'final_sha256', p_final_sha256, 'timezone', p_timezone), p_ip_address, p_user_agent),
    (p_process_id, p_signer_id, p_actor_id, 'finalized', jsonb_build_object('final_sha256', p_final_sha256), p_ip_address, p_user_agent);

  return true;
end;
$$;

revoke all on function public.finalize_document_signature(uuid, uuid, uuid, text, text, text, text, inet, text, text) from public, anon, authenticated;
grant execute on function public.finalize_document_signature(uuid, uuid, uuid, text, text, text, text, inet, text, text) to service_role;

create or replace function public.create_document_signing_process(
  p_process_id uuid,
  p_title text,
  p_source_document_id uuid,
  p_storage_path text,
  p_original_sha256 text,
  p_page_count integer,
  p_actor_id uuid,
  p_signer_name text,
  p_signer_email text,
  p_file_name text,
  p_ip_address inet,
  p_user_agent text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signer_id uuid;
begin
  if p_original_sha256 !~ '^[a-f0-9]{64}$' or p_page_count < 1 or p_page_count > 500
    or char_length(btrim(p_title)) < 2 or char_length(btrim(p_title)) > 160
    or char_length(btrim(p_signer_name)) < 2 or char_length(p_signer_email) > 254 then
    raise exception 'invalid signing process' using errcode = '22023';
  end if;
  insert into public.document_signing_processes
    (id, title, source_document_id, status, original_storage_path, original_sha256, page_count, created_by)
  values (p_process_id, btrim(p_title), p_source_document_id, 'draft', p_storage_path, p_original_sha256, p_page_count, p_actor_id);
  insert into public.document_signers (process_id, user_id, full_name, email, signer_type, signing_order)
  values (p_process_id, p_actor_id, btrim(p_signer_name), lower(btrim(p_signer_email)), 'internal', 1)
  returning id into v_signer_id;
  insert into public.document_signing_fields
    (process_id, signer_id, page_number, x_percent, y_percent, width_percent, height_percent)
  values (p_process_id, v_signer_id, p_page_count, 10, 78, 42, 12);
  insert into public.document_signing_events (process_id, signer_id, actor_id, event_type, event_data, ip_address, user_agent)
  values (p_process_id, v_signer_id, p_actor_id, 'uploaded',
    jsonb_build_object('original_sha256', p_original_sha256, 'page_count', p_page_count, 'file_name', p_file_name),
    p_ip_address, p_user_agent);
  return v_signer_id;
end;
$$;

create or replace function public.prepare_document_signing_field(
  p_process_id uuid, p_actor_id uuid, p_page_number integer,
  p_x_percent numeric, p_y_percent numeric, p_width_percent numeric, p_height_percent numeric,
  p_ip_address inet, p_user_agent text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signer_id uuid;
begin
  if p_page_number < 1 or p_x_percent < 0 or p_y_percent < 0 or p_width_percent < 1 or p_height_percent < 1
    or p_x_percent + p_width_percent > 100 or p_y_percent + p_height_percent > 100 then
    raise exception 'invalid signature field coordinates' using errcode = '22023';
  end if;
  select signer.id into v_signer_id
  from public.document_signers signer
  join public.document_signing_processes process on process.id = signer.process_id
  where signer.process_id = p_process_id and signer.user_id = p_actor_id
    and signer.status = 'pending' and process.status = 'draft' and p_page_number <= process.page_count;
  if v_signer_id is null then raise exception 'signer or process is not available' using errcode = '42501'; end if;
  update public.document_signing_fields
  set page_number = p_page_number, x_percent = p_x_percent, y_percent = p_y_percent,
      width_percent = p_width_percent, height_percent = p_height_percent
  where process_id = p_process_id and signer_id = v_signer_id and field_type = 'signature';
  if not found then raise exception 'signature field is missing' using errcode = '22023'; end if;
  insert into public.document_signing_events (process_id, signer_id, actor_id, event_type, event_data, ip_address, user_agent)
  values (p_process_id, v_signer_id, p_actor_id, 'prepared',
    jsonb_build_object('page_number', p_page_number, 'x_percent', p_x_percent, 'y_percent', p_y_percent,
      'width_percent', p_width_percent, 'height_percent', p_height_percent), p_ip_address, p_user_agent);
  return true;
end;
$$;

create or replace function public.cancel_document_signing_process(p_process_id uuid, p_actor_id uuid, p_ip_address inet, p_user_agent text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.document_signing_processes
  set status = 'cancelled', updated_at = now()
  where id = p_process_id and status in ('draft', 'awaiting_signatures', 'partially_signed');
  if not found then return false; end if;
  insert into public.document_signing_events (process_id, actor_id, event_type, event_data, ip_address, user_agent)
  values (p_process_id, p_actor_id, 'cancelled', jsonb_build_object('source', 'workspace'), p_ip_address, p_user_agent);
  return true;
end;
$$;

revoke all on function public.create_document_signing_process(uuid, text, uuid, text, text, integer, uuid, text, text, text, inet, text) from public, anon, authenticated;
revoke all on function public.prepare_document_signing_field(uuid, uuid, integer, numeric, numeric, numeric, numeric, inet, text) from public, anon, authenticated;
revoke all on function public.cancel_document_signing_process(uuid, uuid, inet, text) from public, anon, authenticated;
grant execute on function public.create_document_signing_process(uuid, text, uuid, text, text, integer, uuid, text, text, text, inet, text) to service_role;
grant execute on function public.prepare_document_signing_field(uuid, uuid, integer, numeric, numeric, numeric, numeric, inet, text) to service_role;
grant execute on function public.cancel_document_signing_process(uuid, uuid, inet, text) to service_role;

insert into public.access_permissions (id, module_name, action_name, is_active)
values
  (gen_random_uuid(), 'documents', 'signature_upload', true),
  (gen_random_uuid(), 'documents', 'signature_prepare', true),
  (gen_random_uuid(), 'documents', 'signature_sign', true),
  (gen_random_uuid(), 'documents', 'signature_evidence', true),
  (gen_random_uuid(), 'documents', 'signature_cancel', true)
on conflict (module_name, action_name) do update set is_active = true;

insert into public.role_permissions (role_id, permission_id)
select granted.role_id, target_permission.id
from public.role_permissions granted
join public.access_permissions existing_permission on existing_permission.id = granted.permission_id
join (values
  ('upload', 'signature_upload'),
  ('update', 'signature_prepare'),
  ('update', 'signature_sign'),
  ('view', 'signature_evidence'),
  ('update', 'signature_cancel')
) as mapping(existing_action, signature_action)
  on existing_permission.module_name = 'documents'
  and existing_permission.action_name = mapping.existing_action
join public.access_permissions target_permission
  on target_permission.module_name = 'documents'
  and target_permission.action_name = mapping.signature_action
  and target_permission.is_active
on conflict (role_id, permission_id) do nothing;

commit;
