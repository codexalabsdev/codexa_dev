create table if not exists public.workspace_document_sequences (
  document_type text not null check (document_type in ('receipt', 'quote', 'billing_notice', 'service_order')),
  calendar_year integer not null check (calendar_year between 2000 and 9999),
  next_number bigint not null default 1 check (next_number > 0),
  primary key (document_type, calendar_year)
);

create table if not exists public.workspace_document_settings (
  id boolean primary key default true check (id),
  issuer_name text not null default 'Codexa' check (char_length(issuer_name) between 2 and 160),
  issuer_tax_id text not null default '' check (char_length(issuer_tax_id) <= 40),
  issuer_email text not null default '' check (char_length(issuer_email) <= 254),
  issuer_phone text not null default '' check (char_length(issuer_phone) <= 60),
  issuer_address text not null default '' check (char_length(issuer_address) <= 500),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_commercial_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in ('receipt', 'quote', 'billing_notice', 'service_order')),
  status text not null default 'draft' check (status in ('draft', 'review', 'issued', 'cancelled')),
  title text not null check (char_length(title) between 2 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  line_items jsonb not null default '[]'::jsonb check (jsonb_typeof(line_items) = 'array' and jsonb_array_length(line_items) between 1 and 30),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  total_cents bigint not null default 0 check (total_cents >= 0),
  due_date date,
  notes text not null default '' check (char_length(notes) <= 2000),
  document_number text unique,
  calendar_year integer,
  issued_snapshot jsonb,
  issued_at timestamptz,
  issued_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancellation_reason text,
  pdf_storage_path text,
  deleted_at timestamptz,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount_cents <= subtotal_cents),
  check (total_cents = subtotal_cents - discount_cents),
  check ((status in ('issued', 'cancelled')) = (issued_snapshot is not null)),
  check ((status in ('issued', 'cancelled')) = (issued_at is not null))
);

create index if not exists workspace_commercial_documents_created_idx
  on public.workspace_commercial_documents (created_at desc);
create index if not exists workspace_commercial_documents_status_idx
  on public.workspace_commercial_documents (status, document_type, created_at desc);
create index if not exists workspace_commercial_documents_client_idx
  on public.workspace_commercial_documents (client_id) where client_id is not null;

create table if not exists public.workspace_document_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.workspace_commercial_documents(id) on delete restrict,
  actor_id uuid not null references auth.users(id),
  event_type text not null check (event_type in ('created', 'updated', 'review_requested', 'issued', 'cancelled', 'deleted', 'pdf_downloaded')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists workspace_document_events_document_idx
  on public.workspace_document_events (document_id, created_at desc);

create or replace function public.protect_issued_workspace_commercial_document()
returns trigger
language plpgsql
set search_path = public, auth, pg_temp
as $$
begin
  if current_setting('app.issuing_commercial_document', true) = 'true' then
    return new;
  end if;
  if old.issued_snapshot is null and new.issued_snapshot is not null then
    raise exception 'documents can only be issued through the numbering procedure' using errcode = '42501';
  end if;
  if old.issued_snapshot is not null then
    if old.status = 'issued' and new.status = 'cancelled' and current_setting('app.cancelling_commercial_document', true) is distinct from 'true' then
      raise exception 'documents can only be cancelled through the audited cancellation procedure' using errcode = '42501';
    end if;
    if old.status = 'issued' and (new.cancelled_at is not null or new.cancelled_by is not null or new.cancellation_reason is not null) and new.status <> 'cancelled' then
      raise exception 'cancellation fields require the cancelled state' using errcode = '22023';
    end if;
    if old.status = 'cancelled' and (new.cancelled_at is distinct from old.cancelled_at or new.cancelled_by is distinct from old.cancelled_by or new.cancellation_reason is distinct from old.cancellation_reason) then
      raise exception 'cancellation details are immutable' using errcode = '42501';
    end if;
    if new.issued_snapshot is distinct from old.issued_snapshot
      or (to_jsonb(new) - 'status' - 'pdf_storage_path' - 'updated_at' - 'updated_by' - 'cancelled_at' - 'cancelled_by' - 'cancellation_reason')
        is distinct from (to_jsonb(old) - 'status' - 'pdf_storage_path' - 'updated_at' - 'updated_by' - 'cancelled_at' - 'cancelled_by' - 'cancellation_reason') then
      raise exception 'issued document content is immutable' using errcode = '42501';
    end if;
    if (old.status = 'cancelled' and new.status <> 'cancelled')
      or (old.status = 'issued' and new.status not in ('issued', 'cancelled')) then
      raise exception 'issued documents cannot be reopened' using errcode = '42501';
    end if;
    if new.status = 'cancelled' and (char_length(btrim(coalesce(new.cancellation_reason, ''))) < 3 or new.cancelled_at is null or new.cancelled_by is null) then
      raise exception 'cancellation reason and actor are required' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create trigger workspace_commercial_documents_immutable_guard
  before update on public.workspace_commercial_documents
  for each row execute function public.protect_issued_workspace_commercial_document();

alter table public.workspace_commercial_documents enable row level security;
alter table public.workspace_document_settings enable row level security;
alter table public.workspace_document_events enable row level security;

insert into public.access_permissions (id, module_name, action_name, is_active)
values
  (gen_random_uuid(), 'documents', 'view', true),
  (gen_random_uuid(), 'documents', 'create', true),
  (gen_random_uuid(), 'documents', 'update', true),
  (gen_random_uuid(), 'documents', 'delete', true),
  (gen_random_uuid(), 'documents', 'upload', true),
  (gen_random_uuid(), 'documents', 'download', true),
  (gen_random_uuid(), 'documents', 'issue', true),
  (gen_random_uuid(), 'documents', 'cancel', true),
  (gen_random_uuid(), 'documents', 'configure', true)
on conflict (module_name, action_name) do update set is_active = true;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.access_roles role
cross join public.access_permissions permission
where lower(btrim(role.name)) = 'admin'
  and permission.module_name = 'documents'
  and permission.action_name in ('issue', 'cancel', 'configure')
on conflict (role_id, permission_id) do nothing;

create policy workspace_commercial_documents_select
  on public.workspace_commercial_documents for select to authenticated
  using (public.has_workspace_permission('documents', 'view'));
create policy workspace_commercial_documents_insert
  on public.workspace_commercial_documents for insert to authenticated
  with check (public.has_workspace_permission('documents', 'create') and created_by = auth.uid() and updated_by = auth.uid());
create policy workspace_commercial_documents_update
  on public.workspace_commercial_documents for update to authenticated
  using (public.has_workspace_permission('documents', 'update') and status in ('draft', 'review'))
  with check (public.has_workspace_permission('documents', 'update') and status in ('draft', 'review') and updated_by = auth.uid());
create policy workspace_commercial_documents_delete
  on public.workspace_commercial_documents for delete to authenticated
  using (public.has_workspace_permission('documents', 'delete') and status in ('draft', 'review'));

create policy workspace_document_settings_select
  on public.workspace_document_settings for select to authenticated
  using (public.has_workspace_permission('documents', 'view'));
create policy workspace_document_settings_update
  on public.workspace_document_settings for all to authenticated
  using (public.has_workspace_permission('documents', 'configure'))
  with check (public.has_workspace_permission('documents', 'configure') and updated_by = auth.uid());

create policy workspace_document_events_select
  on public.workspace_document_events for select to authenticated
  using (public.has_workspace_permission('documents', 'view'));
create policy workspace_document_events_insert
  on public.workspace_document_events for insert to authenticated
  with check (actor_id = auth.uid() and public.has_workspace_permission('documents', 'view'));

revoke all on public.workspace_document_sequences from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.workspace_document_settings from anon, authenticated;
  grant select on public.workspace_commercial_documents, public.workspace_document_settings, public.workspace_document_events to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.workspace_commercial_documents, public.workspace_document_events from anon, authenticated;
revoke insert, update, delete on public.workspace_document_settings from anon, authenticated;

create or replace function public.issue_workspace_commercial_document(p_document_id uuid, p_actor_id uuid)
returns public.workspace_commercial_documents
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_document public.workspace_commercial_documents;
  v_member_id uuid;
  v_year integer := extract(year from now() at time zone 'UTC')::integer;
  v_number bigint;
  v_issuer public.workspace_document_settings;
  v_client jsonb := '{}'::jsonb;
  v_project jsonb := '{}'::jsonb;
begin
  select member.id into v_member_id
  from public.team_members member
  where member.user_id = p_actor_id
    and lower(trim(both '"' from trim(both '''' from btrim(coalesce(member.status, ''))))) in ('active', 'ativo', 'enabled', 'habilitado')
  limit 1;

  if v_member_id is null or not public.effective_workspace_permission(v_member_id, 'documents', 'issue') then
    raise exception 'document issue permission required' using errcode = '42501';
  end if;

  select * into v_document
  from public.workspace_commercial_documents
  where id = p_document_id
  for update;
  if not found then raise exception 'document not found' using errcode = 'P0002'; end if;
  if v_document.status not in ('draft', 'review') then
    raise exception 'only a draft or review document can be issued' using errcode = '22023';
  end if;

  insert into public.workspace_document_sequences (document_type, calendar_year, next_number)
  values (v_document.document_type, v_year, 2)
  on conflict (document_type, calendar_year)
  do update set next_number = public.workspace_document_sequences.next_number + 1
  returning next_number - 1 into v_number;

  select * into v_issuer from public.workspace_document_settings where id = true;
  if not found then
    insert into public.workspace_document_settings (id, issuer_name, updated_by)
    values (true, 'Codexa', p_actor_id)
    returning * into v_issuer;
  end if;

  if v_document.client_id is not null then
    select jsonb_build_object(
      'id', client.id,
      'name', coalesce(nullif(client.trade_name, ''), client.legal_name),
      'legal_name', client.legal_name,
      'email', client.email,
      'phone', client.phone
    ) into v_client from public.clients client where client.id = v_document.client_id;
    if v_client is null then raise exception 'client not found' using errcode = 'P0002'; end if;
  end if;
  if v_document.project_id is not null then
    select jsonb_build_object('id', project.id, 'name', project.name)
    into v_project from public.projects project where project.id = v_document.project_id;
    if v_project is null then raise exception 'project not found' using errcode = 'P0002'; end if;
  end if;

  perform set_config('app.issuing_commercial_document', 'true', true);
  update public.workspace_commercial_documents
  set status = 'issued',
      calendar_year = v_year,
      document_number = case v_document.document_type
        when 'receipt' then 'REC'
        when 'quote' then 'ORC'
        when 'billing_notice' then 'COB'
        else 'OS'
      end || '-' || v_year::text || '-' || lpad(v_number::text, 5, '0'),
      issued_at = now(),
      issued_by = p_actor_id,
      updated_by = p_actor_id,
      updated_at = now(),
      issued_snapshot = jsonb_build_object(
        'document_type', v_document.document_type,
        'document_number', case v_document.document_type
          when 'receipt' then 'REC'
          when 'quote' then 'ORC'
          when 'billing_notice' then 'COB'
          else 'OS'
        end || '-' || v_year::text || '-' || lpad(v_number::text, 5, '0'),
        'title', v_document.title,
        'description', v_document.description,
        'line_items', v_document.line_items,
        'subtotal_cents', v_document.subtotal_cents,
        'discount_cents', v_document.discount_cents,
        'total_cents', v_document.total_cents,
        'due_date', v_document.due_date,
        'notes', v_document.notes,
        'issuer', jsonb_build_object('name', v_issuer.issuer_name, 'tax_id', v_issuer.issuer_tax_id, 'email', v_issuer.issuer_email, 'phone', v_issuer.issuer_phone, 'address', v_issuer.issuer_address),
        'client', v_client,
        'project', v_project,
        'issued_at', now(),
        'issued_by', p_actor_id
      )
  where id = p_document_id
  returning * into v_document;

  insert into public.workspace_document_events (document_id, actor_id, event_type, details)
  values (v_document.id, p_actor_id, 'issued', jsonb_build_object('document_number', v_document.document_number));
  return v_document;
end;
$$;

revoke all on function public.issue_workspace_commercial_document(uuid, uuid) from public, anon, authenticated;
grant execute on function public.issue_workspace_commercial_document(uuid, uuid) to service_role;

create or replace function public.cancel_workspace_commercial_document(p_document_id uuid, p_actor_id uuid, p_reason text)
returns public.workspace_commercial_documents
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_document public.workspace_commercial_documents;
  v_member_id uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'cancellation reason is required' using errcode = '22023';
  end if;
  select member.id into v_member_id
  from public.team_members member
  where member.user_id = p_actor_id
    and lower(trim(both '"' from trim(both '''' from btrim(coalesce(member.status, ''))))) in ('active', 'ativo', 'enabled', 'habilitado')
  limit 1;
  if v_member_id is null or not public.effective_workspace_permission(v_member_id, 'documents', 'cancel') then
    raise exception 'document cancel permission required' using errcode = '42501';
  end if;
  select * into v_document from public.workspace_commercial_documents where id = p_document_id for update;
  if not found then raise exception 'document not found' using errcode = 'P0002'; end if;
  if v_document.status <> 'issued' then raise exception 'only an issued document can be cancelled' using errcode = '22023'; end if;
  perform set_config('app.cancelling_commercial_document', 'true', true);
  update public.workspace_commercial_documents
  set status = 'cancelled', cancelled_at = now(), cancelled_by = p_actor_id,
      cancellation_reason = v_reason, updated_by = p_actor_id, updated_at = now()
  where id = p_document_id returning * into v_document;
  insert into public.workspace_document_events (document_id, actor_id, event_type, details)
  values (p_document_id, p_actor_id, 'cancelled', jsonb_build_object('reason', v_reason));
  return v_document;
end;
$$;

revoke all on function public.cancel_workspace_commercial_document(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_workspace_commercial_document(uuid, uuid, text) to service_role;
