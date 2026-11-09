set search_path = public, auth, pg_temp;

alter table public.access_roles
  add column if not exists is_active boolean not null default true;

create unique index if not exists access_roles_name_uidx
  on public.access_roles (lower(name));

create unique index if not exists access_permissions_module_action_uidx
  on public.access_permissions (module_name, action_name);

create unique index if not exists role_permissions_role_permission_uidx
  on public.role_permissions (role_id, permission_id);

insert into public.access_roles (id, name, description, is_system, is_active)
values
  (gen_random_uuid(), 'admin', 'Administrador com acesso integral ao workspace.', true, true),
  (gen_random_uuid(), 'Comercial', 'Prospecção, relacionamento e negociação comercial.', true, true),
  (gen_random_uuid(), 'Operacional', 'Sistemas, módulos, licenças e execução operacional.', true, true),
  (gen_random_uuid(), 'Financeiro', 'Contas, recebimentos, pagamentos e relatórios financeiros.', true, true),
  (gen_random_uuid(), 'Suporte', 'Atendimento técnico e gestão de chamados.', true, true),
  (gen_random_uuid(), 'Projetos', 'Planejamento, distribuição e acompanhamento de projetos.', true, true),
  (gen_random_uuid(), 'Desenvolvedor', 'Execução de tarefas técnicas atribuídas.', true, true),
  (gen_random_uuid(), 'Relacionamento', 'Acompanhamento contínuo dos clientes.', true, true),
  (gen_random_uuid(), 'Consulta', 'Acesso somente de leitura expressamente concedido.', true, true),
  (gen_random_uuid(), 'Leitura e auditoria', 'Papel legado somente de leitura; permissões seguem a matriz explícita.', true, true)
on conflict (lower(name)) do update
set description = excluded.description,
    is_system = true,
    is_active = true,
    updated_at = now();

insert into public.access_permissions (id, module_name, action_name)
select gen_random_uuid(), modules.module_name, actions.action_name
from (values
  ('dashboard'), ('dashboard_comercial'), ('leads'), ('clients'), ('contacts'),
  ('proposals'), ('contracts'), ('projects'), ('change_requests'), ('support'),
  ('systems'), ('modules'), ('plans'), ('licenses'), ('accounts_receivable'),
  ('accounts_payable'), ('finance'), ('reports_commercial'), ('reports_financial'),
  ('team'), ('users'), ('roles'), ('settings'), ('appearance'), ('audit'),
  ('profile'), ('documents'), ('attachments'), ('notifications'), ('calendar')
) as modules(module_name)
cross join (values
  ('view'), ('create'), ('update'), ('delete'), ('manage'), ('approve'),
  ('export'), ('upload'), ('download'), ('assign'), ('change_status'),
  ('manage_licenses'), ('release_modules'), ('manage_users'), ('manage_roles'),
  ('view_audit')
) as actions(action_name)
on conflict (module_name, action_name) do nothing;

with role_grants(role_name, grants) as (
  values
    ('Comercial', array[
      'dashboard_comercial:view','leads:view','leads:create','leads:update','leads:change_status',
      'clients:view','clients:create','clients:update','contacts:view','contacts:create','contacts:update',
      'proposals:view','proposals:create','proposals:update','proposals:change_status',
      'contracts:view','contracts:create','attachments:upload','attachments:download',
      'projects:view','reports_commercial:view','reports_commercial:export',
      'profile:view','profile:update','notifications:view','notifications:update'
    ]),
    ('Operacional', array[
      'dashboard:view','clients:view','contracts:view','projects:view','projects:update','projects:assign',
      'projects:change_status','change_requests:view','change_requests:update','change_requests:assign',
      'change_requests:change_status','systems:view','systems:create','systems:update',
      'modules:view','modules:create','modules:update','plans:view','licenses:view',
      'licenses:manage_licenses','licenses:release_modules','team:view',
      'profile:view','profile:update','notifications:view','notifications:update'
    ]),
    ('Financeiro', array[
      'dashboard:view','clients:view','contracts:view','proposals:view',
      'accounts_receivable:view','accounts_receivable:create','accounts_receivable:update','accounts_receivable:approve',
      'accounts_payable:view','accounts_payable:create','accounts_payable:update','accounts_payable:approve',
      'finance:view','finance:export','reports_financial:view','reports_financial:export',
      'profile:view','profile:update','notifications:view','notifications:update'
    ]),
    ('Suporte', array[
      'dashboard:view','clients:view','contacts:view','support:view','support:create','support:update',
      'support:assign','support:change_status','support:upload','support:download',
      'systems:view','modules:view','licenses:view','change_requests:view','team:view',
      'profile:view','profile:update','notifications:view','notifications:update'
    ]),
    ('Projetos', array[
      'dashboard:view','clients:view','contracts:view','projects:view','projects:create','projects:update',
      'projects:assign','projects:change_status','projects:upload','projects:download','projects:delete',
      'change_requests:view','change_requests:create','change_requests:update','change_requests:assign',
      'change_requests:change_status','support:view','support:assign','team:view','profile:view','profile:update',
      'attachments:download','attachments:upload','attachments:delete','notifications:view','notifications:update'
    ]),
    ('Desenvolvedor', array[
      'dashboard:view','projects:view','projects:update','projects:change_status','projects:upload',
      'projects:download','change_requests:view','change_requests:update','change_requests:change_status',
      'support:view','support:update','support:upload','support:download','systems:view',
      'modules:view','profile:view','profile:update','attachments:download','attachments:upload',
      'notifications:view','notifications:update'
    ]),
    ('Relacionamento', array[
      'dashboard:view','clients:view','clients:update','contacts:view','contacts:create','contacts:update',
      'projects:view','contracts:view','systems:view','modules:view',
      'profile:view','profile:update','notifications:view','notifications:update'
    ]),
    ('Consulta', array[
      'dashboard:view','leads:view','clients:view','contacts:view','proposals:view','contracts:view',
      'projects:view','change_requests:view','support:view','systems:view','modules:view','plans:view',
      'licenses:view','accounts_receivable:view','accounts_payable:view','finance:view','reports_commercial:view',
      'reports_financial:view','profile:view','audit:view_audit','notifications:view'
    ]),
    ('Leitura e auditoria', array[
      'dashboard:view','leads:view','clients:view','contacts:view','proposals:view','contracts:view',
      'projects:view','change_requests:view','support:view','systems:view','modules:view','plans:view',
      'licenses:view','accounts_receivable:view','accounts_payable:view','finance:view','reports_commercial:view',
      'reports_financial:view','profile:view','audit:view_audit','notifications:view'
    ])
), parsed_grants as (
  select role_name, split_part(grant_name, ':', 1) as module_name,
    split_part(grant_name, ':', 2) as action_name
  from role_grants
  cross join lateral unnest(grants) as grant_value(grant_name)
), permission_rows as (
  select roles.id as role_id, permissions.id as permission_id
  from parsed_grants
  join public.access_roles roles on roles.name = parsed_grants.role_name
  join public.access_permissions permissions
    on permissions.module_name = parsed_grants.module_name
    and permissions.action_name = parsed_grants.action_name
  where roles.name <> 'admin'
)
insert into public.role_permissions (role_id, permission_id)
select role_id, permission_id from permission_rows
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.access_roles roles
cross join public.access_permissions permissions
where roles.name = 'admin'
on conflict (role_id, permission_id) do nothing;

create or replace function public.current_team_member_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select id from public.team_members
  where user_id = (select auth.uid())
  limit 1;
$$;

create or replace function public.has_workspace_permission(
  p_module text,
  p_action text
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.team_members member
    where member.user_id = (select auth.uid())
      and lower(trim(both '"' from trim(both '''' from btrim(member.status)))) in ('active', 'ativo', 'enabled', 'habilitado')
      and (
        lower(btrim(member.role_name)) = 'admin'
        or exists (
          select 1
          from public.access_roles role
          join public.role_permissions role_permission on role_permission.role_id = role.id
          join public.access_permissions permission on permission.id = role_permission.permission_id
          where role.name = member.role_name
            and role.is_active
            and permission.module_name = p_module
            and permission.action_name = p_action
        )
      )
  );
$$;

create or replace function public.can_access_workspace_assignment(p_assignee uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select p_assignee is null
    or p_assignee = public.current_team_member_id()
    or p_assignee = (select auth.uid());
$$;

create or replace function public.workspace_row_scope(p_module text, p_row jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_role text;
  v_member_id uuid;
  v_user_id uuid := (select auth.uid());
  v_record_id uuid;
  v_project_id uuid;
  v_task_id uuid;
begin
  select member.role_name, member.id
  into v_role, v_member_id
  from public.team_members member
  where member.user_id = v_user_id
  limit 1;

  if lower(coalesce(v_role, '')) = 'admin' then return true; end if;

  if p_module = 'profile' and p_row ? 'user_id' then
    return p_row->>'user_id' = v_user_id::text;
  end if;
  if p_module = 'notifications' then
    return p_row->>'recipient_id' in (v_user_id::text, v_member_id::text);
  end if;
  if p_module = 'attachments' then
    if p_row->>'entity_type' = 'project' then
      return exists (
        select 1 from public.projects project
        where project.id = nullif(p_row->>'entity_id', '')::uuid
          and public.workspace_row_scope('projects', to_jsonb(project))
      );
    end if;
    if p_row->>'entity_type' = 'task' then
      return exists (
        select 1 from public.project_tasks task
        where task.id = nullif(p_row->>'entity_id', '')::uuid
          and public.workspace_row_scope('projects', to_jsonb(task))
      );
    end if;
    return false;
  end if;

  if p_module in ('leads', 'clients', 'proposals', 'contracts') and v_role = 'Comercial' then
    if p_module = 'leads' and p_row ? 'lead_id' then
      return exists (
        select 1 from public.leads lead
        where lead.id = nullif(p_row->>'lead_id', '')::uuid
          and lead.owner_id in (v_user_id, v_member_id)
      );
    end if;
    if p_module = 'proposals' and p_row ? 'proposal_id' then
      return exists (
        select 1 from public.proposals proposal
        where proposal.id = nullif(p_row->>'proposal_id', '')::uuid
          and proposal.responsible_id in (v_user_id, v_member_id)
      );
    end if;
    if p_module = 'contracts' and p_row ? 'contract_id' then
      return exists (
        select 1 from public.contracts contract
        where contract.id = nullif(p_row->>'contract_id', '')::uuid
          and contract.responsible_id in (v_user_id, v_member_id)
      );
    end if;
    return coalesce(p_row->>'owner_id', p_row->>'responsible_id') in (v_user_id::text, v_member_id::text);
  end if;
  if p_module = 'clients' and v_role = 'Relacionamento' then
    return (p_row->>'owner_id') in (v_user_id::text, v_member_id::text);
  end if;
  if p_module = 'contacts' and v_role in ('Comercial', 'Relacionamento') then
    if p_row ? 'client_id' then
      return exists (
        select 1 from public.clients client
        where client.id = nullif(p_row->>'client_id', '')::uuid
          and client.owner_id in (v_user_id, v_member_id)
      );
    end if;
    if p_row ? 'lead_id' then
      return exists (
        select 1 from public.leads lead
        where lead.id = nullif(p_row->>'lead_id', '')::uuid
          and lead.owner_id in (v_user_id, v_member_id)
      );
    end if;
    return false;
  end if;
  if p_module in ('proposals', 'contracts') and v_role = 'Relacionamento' then
    if p_row ? 'client_id' then
      return exists (
        select 1 from public.clients client
        where client.id = nullif(p_row->>'client_id', '')::uuid
          and client.owner_id in (v_user_id, v_member_id)
      );
    end if;
    if p_row ? 'proposal_id' then
      return exists (
        select 1 from public.proposals proposal
        join public.clients client
          on client.id = nullif(to_jsonb(proposal)->>'client_id', '')::uuid
        where proposal.id = nullif(p_row->>'proposal_id', '')::uuid
          and client.owner_id in (v_user_id, v_member_id)
      );
    end if;
    if p_row ? 'contract_id' then
      return exists (
        select 1 from public.contracts contract
        join public.clients client
          on client.id = nullif(to_jsonb(contract)->>'client_id', '')::uuid
        where contract.id = nullif(p_row->>'contract_id', '')::uuid
          and client.owner_id in (v_user_id, v_member_id)
      );
    end if;
    return false;
  end if;

  if p_module = 'projects' and v_role = 'Desenvolvedor' then
    v_record_id := nullif(p_row->>'id', '')::uuid;
    v_project_id := nullif(p_row->>'project_id', '')::uuid;
    v_task_id := nullif(p_row->>'task_id', '')::uuid;

    if p_row ? 'responsible_id'
      and p_row->>'responsible_id' in (v_user_id::text, v_member_id::text) then
      return true;
    end if;
    if v_project_id is not null then
      return exists (
        select 1 from public.project_tasks task
        where task.project_id = v_project_id
          and (task.responsible_id = v_member_id or task.responsible_id = v_user_id)
      );
    end if;
    if v_task_id is not null then
      return exists (
        select 1 from public.project_tasks task
        where task.id = v_task_id
          and (task.responsible_id = v_member_id or task.responsible_id = v_user_id)
      );
    end if;
    if v_record_id is not null then
      return exists (
        select 1 from public.project_tasks task
        where task.project_id = v_record_id
          and (task.responsible_id = v_member_id or task.responsible_id = v_user_id)
      );
    end if;
    return false;
  end if;
  if p_module = 'projects' and v_role in ('Comercial', 'Relacionamento') then
    if p_row ? 'client_id' then
      return exists (
        select 1 from public.clients client
        where client.id = nullif(p_row->>'client_id', '')::uuid
          and client.owner_id in (v_user_id, v_member_id)
      );
    end if;
    if p_row ? 'project_id' then
      return exists (
        select 1 from public.projects project
        join public.clients client on client.id = project.client_id
        where project.id = nullif(p_row->>'project_id', '')::uuid
          and client.owner_id in (v_user_id, v_member_id)
      );
    end if;
    return false;
  end if;

  if p_module = 'support' and v_role in ('Suporte', 'Desenvolvedor') then
    if p_row ? 'technical_responsible_id' then
      return p_row->>'technical_responsible_id' in (v_user_id::text, v_member_id::text);
    end if;
    if p_row ? 'ticket_id' then
      return exists (
        select 1 from public.support_tickets ticket
        where ticket.id = nullif(p_row->>'ticket_id', '')::uuid
          and (ticket.technical_responsible_id = v_member_id or ticket.technical_responsible_id = v_user_id)
      );
    end if;
    return false;
  end if;

  if p_module = 'modules' and v_role = 'Relacionamento' then
    return exists (
      select 1 from public.systems system
      join public.clients client on client.id = system.client_id
      where system.id = nullif(p_row->>'system_id', '')::uuid
        and client.owner_id in (v_user_id, v_member_id)
    );
  end if;
  if p_module = 'systems' and v_role = 'Relacionamento' then
    if p_row ? 'client_id' then
      return exists (
        select 1 from public.clients client
        where client.id = nullif(p_row->>'client_id', '')::uuid
          and client.owner_id in (v_user_id, v_member_id)
      );
    end if;
    if p_row ? 'system_id' then
      return exists (
        select 1 from public.systems system
        join public.clients client on client.id = system.client_id
        where system.id = nullif(p_row->>'system_id', '')::uuid
          and client.owner_id in (v_user_id, v_member_id)
      );
    end if;
    if p_row ? 'id' then
      return exists (
        select 1 from public.systems system
        join public.clients client on client.id = system.client_id
        where system.id = nullif(p_row->>'id', '')::uuid
          and client.owner_id in (v_user_id, v_member_id)
      );
    end if;
    return false;
  end if;

  if p_module = 'change_requests' and v_role in ('Desenvolvedor', 'Suporte') then
    return p_row->>'technical_responsible_id' in (v_user_id::text, v_member_id::text);
  end if;
  return true;
end;
$$;

create or replace function public.assign_workspace_record_owner()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_temp
as $$
begin
  if tg_table_name in ('leads', 'clients') then
    if new.owner_id is null
      and public.has_workspace_permission(tg_table_name, 'create') then
      new.owner_id := public.current_team_member_id();
    end if;
  elsif tg_table_name in ('proposals', 'contracts') then
    if new.responsible_id is null
      and public.has_workspace_permission(tg_table_name, 'create') then
      new.responsible_id := public.current_team_member_id();
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.workspace_storage_scope(p_name text, p_action text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_entity_type text := split_part(coalesce(p_name, ''), '/', 2);
  v_entity_id text := split_part(coalesce(p_name, ''), '/', 3);
  v_permission text;
begin
  if v_user_id is null
    or split_part(coalesce(p_name, ''), '/', 1) <> v_user_id::text
    or v_entity_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;

  v_permission := case p_action
    when 'select' then 'download'
    when 'insert' then 'upload'
    when 'delete' then 'delete'
    else 'update'
  end;
  return public.has_workspace_permission('attachments', v_permission)
    and public.workspace_row_scope('attachments', jsonb_build_object(
      'entity_type', v_entity_type,
      'entity_id', v_entity_id
    ));
end;
$$;

create or replace function public.protect_admin_access_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if lower(coalesce(old.name, '')) = 'admin' then
    if tg_op = 'DELETE' then
      raise exception 'The system administrator role cannot be deleted';
    end if;
    if (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
      raise exception 'The system administrator role is protected';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.protect_admin_role_permissions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_protected boolean;
begin
  if tg_op = 'DELETE' then
    select exists (
      select 1 from public.access_roles
      where id = old.role_id and lower(name) = 'admin'
    ) into v_is_protected;
  else
    select exists (
      select 1 from public.access_roles
      where lower(name) = 'admin' and id in (old.role_id, new.role_id)
    ) into v_is_protected;
  end if;

  if v_is_protected then
    raise exception 'Administrator role permissions cannot be removed or reassigned';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.protect_last_active_admin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_active_admin boolean;
begin
  if tg_op = 'DELETE' then
    v_is_active_admin := lower(old.role_name) = 'admin'
      and lower(trim(both '"' from trim(both '''' from btrim(old.status)))) in ('active', 'ativo', 'enabled', 'habilitado');
  else
    v_is_active_admin := lower(old.role_name) = 'admin'
      and lower(trim(both '"' from trim(both '''' from btrim(old.status)))) in ('active', 'ativo', 'enabled', 'habilitado')
      and (
        lower(new.role_name) <> 'admin'
        or lower(trim(both '"' from trim(both '''' from btrim(new.status)))) not in ('active', 'ativo', 'enabled', 'habilitado')
      );
  end if;

  if v_is_active_admin then
    perform pg_advisory_xact_lock(hashtext('workspace-admin-members'));
    if not exists (
      select 1 from public.team_members member
      where member.id <> old.id
        and lower(member.role_name) = 'admin'
        and lower(trim(both '"' from trim(both '''' from btrim(member.status)))) in ('active', 'ativo', 'enabled', 'habilitado')
    ) then
      raise exception using errcode = '23514', message = 'Cannot remove or deactivate the last active administrator';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists protect_admin_access_role on public.access_roles;
create trigger protect_admin_access_role
  before update or delete on public.access_roles
  for each row execute function public.protect_admin_access_role();

drop trigger if exists protect_admin_role_permissions on public.role_permissions;
create trigger protect_admin_role_permissions
  before update or delete on public.role_permissions
  for each row execute function public.protect_admin_role_permissions();

drop trigger if exists protect_last_active_admin on public.team_members;
create trigger protect_last_active_admin
  before update or delete on public.team_members
  for each row execute function public.protect_last_active_admin();

revoke all on function public.current_team_member_id() from public, anon;
revoke all on function public.has_workspace_permission(text, text) from public, anon;
revoke all on function public.can_access_workspace_assignment(uuid) from public, anon;
revoke all on function public.workspace_row_scope(text, jsonb) from public, anon;
revoke all on function public.assign_workspace_record_owner() from public, anon, authenticated;
revoke all on function public.protect_admin_access_role() from public, anon, authenticated;
revoke all on function public.protect_admin_role_permissions() from public, anon, authenticated;
revoke all on function public.protect_last_active_admin() from public, anon, authenticated;
revoke all on function public.workspace_storage_scope(text, text) from public, anon;
grant execute on function public.current_team_member_id() to authenticated;
grant execute on function public.has_workspace_permission(text, text) to authenticated;
grant execute on function public.can_access_workspace_assignment(uuid) to authenticated;
grant execute on function public.workspace_row_scope(text, jsonb) to authenticated;
grant execute on function public.workspace_storage_scope(text, text) to authenticated;

alter table public.access_roles enable row level security;
alter table public.access_permissions enable row level security;
alter table public.role_permissions enable row level security;

drop policy if exists "RBAC active member can read roles" on public.access_roles;
create policy "RBAC active member can read roles"
  on public.access_roles for select to authenticated
  using (public.has_workspace_permission('profile', 'view'));
drop policy if exists "RBAC admins manage roles" on public.access_roles;
create policy "RBAC admins manage roles"
  on public.access_roles for all to authenticated
  using (public.has_workspace_permission('roles', 'manage_roles'))
  with check (public.has_workspace_permission('roles', 'manage_roles'));

drop policy if exists "RBAC active member can read permission catalog" on public.access_permissions;
create policy "RBAC active member can read permission catalog"
  on public.access_permissions for select to authenticated
  using (public.has_workspace_permission('profile', 'view'));
drop policy if exists "RBAC admins manage permission catalog" on public.access_permissions;
create policy "RBAC admins manage permission catalog"
  on public.access_permissions for all to authenticated
  using (public.has_workspace_permission('roles', 'manage_roles'))
  with check (public.has_workspace_permission('roles', 'manage_roles'));

drop policy if exists "RBAC active member can read role permissions" on public.role_permissions;
create policy "RBAC active member can read role permissions"
  on public.role_permissions for select to authenticated
  using (public.has_workspace_permission('profile', 'view'));
drop policy if exists "RBAC admins manage role permissions" on public.role_permissions;
create policy "RBAC admins manage role permissions"
  on public.role_permissions for all to authenticated
  using (public.has_workspace_permission('roles', 'manage_roles'))
  with check (public.has_workspace_permission('roles', 'manage_roles'));

drop policy if exists rbac_task_comments_author_insert on public.task_comments;
create policy rbac_task_comments_author_insert
  on public.task_comments as restrictive for insert to authenticated
  with check (author_id = (select auth.uid()));
drop policy if exists rbac_task_comments_author_update on public.task_comments;
create policy rbac_task_comments_author_update
  on public.task_comments as restrictive for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));
drop policy if exists rbac_task_comments_author_delete on public.task_comments;
create policy rbac_task_comments_author_delete
  on public.task_comments as restrictive for delete to authenticated
  using (author_id = (select auth.uid()));

create or replace function public.save_workspace_role(
  p_actor_id uuid,
  p_role_id uuid,
  p_name text,
  p_description text,
  p_is_active boolean,
  p_permissions text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor_role text;
  v_role public.access_roles%rowtype;
  v_previous jsonb;
  v_permissions text[] := coalesce(p_permissions, array[]::text[]);
  v_action text;
begin
  select member.role_name into v_actor_role
  from public.team_members member
  where member.user_id = p_actor_id
    and lower(trim(both '"' from trim(both '''' from btrim(member.status)))) in ('active', 'ativo', 'enabled', 'habilitado')
  limit 1;

  if v_actor_role is null then
    raise exception using errcode = '42501', message = 'Active workspace membership required';
  end if;
  if lower(v_actor_role) <> 'admin' and not exists (
    select 1
    from public.access_roles role
    join public.role_permissions role_permission on role_permission.role_id = role.id
    join public.access_permissions permission on permission.id = role_permission.permission_id
    where role.name = v_actor_role
      and role.is_active
      and permission.module_name = 'roles'
      and permission.action_name = 'manage_roles'
  ) then
    raise exception using errcode = '42501', message = 'Role management permission required';
  end if;

  if p_name is null or length(btrim(p_name)) not between 2 and 50
    or lower(btrim(p_name)) = 'admin' or p_is_active is null then
    raise exception using errcode = '22023', message = 'Invalid role fields';
  end if;
  if exists (
    select 1
    from unnest(v_permissions) requested(permission_name)
    where split_part(requested.permission_name, ':', 1) = ''
      or split_part(requested.permission_name, ':', 2) = ''
      or not exists (
        select 1 from public.access_permissions permission
        where permission.module_name = split_part(requested.permission_name, ':', 1)
          and permission.action_name = split_part(requested.permission_name, ':', 2)
      )
  ) then
    raise exception using errcode = '22023', message = 'Unknown permission requested';
  end if;
  if lower(v_actor_role) <> 'admin' and exists (
    select 1
    from unnest(v_permissions) requested(permission_name)
    where not exists (
      select 1
      from public.access_roles actor_role
      join public.role_permissions actor_grant on actor_grant.role_id = actor_role.id
      join public.access_permissions actor_permission on actor_permission.id = actor_grant.permission_id
      where actor_role.name = v_actor_role
        and actor_permission.module_name = split_part(requested.permission_name, ':', 1)
        and actor_permission.action_name = split_part(requested.permission_name, ':', 2)
    )
  ) then
    raise exception using errcode = '42501', message = 'Cannot grant permissions not held by the actor';
  end if;

  if p_role_id is null then
    insert into public.access_roles (id, name, description, is_system, is_active)
    values (gen_random_uuid(), btrim(p_name), coalesce(p_description, ''), false, p_is_active)
    returning * into v_role;
    v_action := 'role.created';
  else
    select * into v_role from public.access_roles where id = p_role_id for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Role not found';
    end if;
    if lower(v_role.name) = 'admin' then
      raise exception using errcode = '42501', message = 'The system administrator role is protected';
    end if;
    v_previous := to_jsonb(v_role) || jsonb_build_object(
      'permissions',
      coalesce((
        select jsonb_agg(permission.module_name || ':' || permission.action_name)
        from public.role_permissions role_permission
        join public.access_permissions permission on permission.id = role_permission.permission_id
        where role_permission.role_id = v_role.id
      ), '[]'::jsonb)
    );
    update public.access_roles
    set name = btrim(p_name),
        description = coalesce(p_description, ''),
        is_active = p_is_active,
        updated_at = now()
    where id = p_role_id
    returning * into v_role;
    if v_role.name is distinct from (v_previous->>'name') then
      update public.team_members set role_name = v_role.name
      where role_name = v_previous->>'name';
    end if;
    v_action := 'role.updated';
  end if;

  delete from public.role_permissions where role_id = v_role.id;
  insert into public.role_permissions (role_id, permission_id)
  select v_role.id, permission.id
  from unnest(v_permissions) requested(permission_name)
  join public.access_permissions permission
    on permission.module_name = split_part(requested.permission_name, ':', 1)
    and permission.action_name = split_part(requested.permission_name, ':', 2)
  on conflict (role_id, permission_id) do nothing;

  insert into public.admin_audit_events (
    actor_id, action_name, entity_type, entity_id, previous_data, new_data, result
  ) values (
    p_actor_id,
    v_action,
    'access_role',
    v_role.id,
    v_previous,
    to_jsonb(v_role) || jsonb_build_object('permissions', to_jsonb(v_permissions)),
    'success'
  );

  return jsonb_build_object(
    'role', to_jsonb(v_role),
    'permissions', to_jsonb(v_permissions)
  );
end;
$$;

create or replace function public.update_workspace_member(
  p_actor_id uuid,
  p_member_id uuid,
  p_role_name text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor_role text;
  v_target public.team_members%rowtype;
  v_role public.access_roles%rowtype;
  v_previous jsonb;
  v_next_role text;
  v_next_status text;
begin
  perform pg_advisory_xact_lock(hashtext('workspace-admin-members'));

  select member.role_name into v_actor_role
  from public.team_members member
  where member.user_id = p_actor_id
    and lower(trim(both '"' from trim(both '''' from btrim(member.status)))) in ('active', 'ativo', 'enabled', 'habilitado')
  limit 1;
  if v_actor_role is null or (
    lower(v_actor_role) <> 'admin' and not exists (
      select 1
      from public.access_roles role
      join public.role_permissions role_permission on role_permission.role_id = role.id
      join public.access_permissions permission on permission.id = role_permission.permission_id
      where role.name = v_actor_role and role.is_active
        and permission.module_name = 'users' and permission.action_name = 'manage_users'
    )
  ) then
    raise exception using errcode = '42501', message = 'User management permission required';
  end if;

  select * into v_target from public.team_members where id = p_member_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Workspace member not found';
  end if;
  if v_target.user_id = p_actor_id then
    raise exception using errcode = '42501', message = 'Actors cannot change their own role or status';
  end if;

  v_next_role := coalesce(p_role_name, v_target.role_name);
  v_next_status := coalesce(p_status, v_target.status);
  v_previous := jsonb_build_object('role_name', v_target.role_name, 'status', v_target.status);

  if p_status is not null and p_status not in ('Ativo', 'Inativo') then
    raise exception using errcode = '22023', message = 'Invalid member status';
  end if;

  if p_role_name is not null then
    select * into v_role from public.access_roles
    where name = p_role_name and is_active
    limit 1;
    if not found then
      raise exception using errcode = '22023', message = 'Selected role is inactive or unknown';
    end if;
    if lower(v_role.name) = 'admin' and lower(v_actor_role) <> 'admin' then
      raise exception using errcode = '42501', message = 'Only an administrator may assign the administrator role';
    end if;
    if lower(v_actor_role) <> 'admin' and exists (
      select 1
      from public.role_permissions target_grant
      join public.access_permissions target_permission on target_permission.id = target_grant.permission_id
      where target_grant.role_id = v_role.id
        and not exists (
          select 1
          from public.access_roles actor_role
          join public.role_permissions actor_grant on actor_grant.role_id = actor_role.id
          join public.access_permissions actor_permission on actor_permission.id = actor_grant.permission_id
          where actor_role.name = v_actor_role
            and actor_permission.module_name = target_permission.module_name
            and actor_permission.action_name = target_permission.action_name
        )
    ) then
      raise exception using errcode = '42501', message = 'Cannot assign a role with greater permissions';
    end if;
    v_next_role := v_role.name;
  end if;

  if lower(v_target.role_name) = 'admin'
    and (lower(v_next_role) <> 'admin'
      or lower(trim(both '"' from trim(both '''' from btrim(v_next_status)))) not in ('active', 'ativo', 'enabled', 'habilitado'))
    and (
      select count(*) from public.team_members member
      where lower(member.role_name) = 'admin'
        and lower(trim(both '"' from trim(both '''' from btrim(member.status)))) in ('active', 'ativo', 'enabled', 'habilitado')
    ) <= 1 then
    raise exception using errcode = '23514', message = 'Cannot deactivate or demote the last active administrator';
  end if;

  update public.team_members
  set role_name = v_next_role, status = v_next_status, updated_at = now()
  where id = p_member_id
  returning * into v_target;

  insert into public.admin_audit_events (
    actor_id, action_name, entity_type, entity_id, previous_data, new_data, result
  ) values (
    p_actor_id,
    case when p_role_name is not null then 'team.role_changed' else 'team.status_changed' end,
    'team_member',
    v_target.id,
    v_previous,
    jsonb_build_object('role_name', v_target.role_name, 'status', v_target.status),
    'success'
  );

  return jsonb_build_object(
    'id', v_target.id,
    'user_id', v_target.user_id,
    'full_name', v_target.full_name,
    'email', v_target.email,
    'role_name', v_target.role_name,
    'status', v_target.status,
    'created_at', v_target.created_at,
    'updated_at', v_target.updated_at
  );
end;
$$;

revoke all on function public.save_workspace_role(uuid, uuid, text, text, boolean, text[]) from public, anon, authenticated;
revoke all on function public.update_workspace_member(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.save_workspace_role(uuid, uuid, text, text, boolean, text[]) to service_role;
grant execute on function public.update_workspace_member(uuid, uuid, text, text) to service_role;

do $$
declare
  v_table text;
  v_module text;
  v_select_action text;
  v_insert_action text;
  v_update_action text;
  v_delete_action text;
begin
  foreach v_table in array array[
    'leads','lead_interactions','clients','messages','proposals','proposal_events','contracts','contract_events',
    'projects','project_tasks','task_comments','project_activity','delivery_history','change_requests',
    'support_tickets','support_messages','systems','system_clients','system_integrations','system_modules',
    'plans','plan_versions','licenses','license_module_entitlements','license_module_changes','license_events',
    'license_sync_attempts','accounts_receivable','collection_attempts','accounts_payable','finance_payments',
    'recurring_charges','finance_audit_events','admin_audit_events','documents','entity_attachments',
    'notifications','team_members','company_settings','user_preferences','sla_rules'
  ]
  loop
    v_module := case v_table
      when 'leads' then 'leads'
      when 'lead_interactions' then 'leads'
      when 'clients' then 'clients'
      when 'messages' then 'contacts'
      when 'proposals' then 'proposals'
      when 'proposal_events' then 'proposals'
      when 'contracts' then 'contracts'
      when 'contract_events' then 'contracts'
      when 'projects' then 'projects'
      when 'project_tasks' then 'projects'
      when 'task_comments' then 'projects'
      when 'project_activity' then 'projects'
      when 'delivery_history' then 'projects'
      when 'change_requests' then 'change_requests'
      when 'support_tickets' then 'support'
      when 'support_messages' then 'support'
      when 'systems' then 'systems'
      when 'system_clients' then 'systems'
      when 'system_integrations' then 'systems'
      when 'system_modules' then 'modules'
      when 'plans' then 'plans'
      when 'plan_versions' then 'plans'
      when 'licenses' then 'licenses'
      when 'license_module_entitlements' then 'licenses'
      when 'license_module_changes' then 'licenses'
      when 'license_events' then 'licenses'
      when 'license_sync_attempts' then 'licenses'
      when 'accounts_receivable' then 'accounts_receivable'
      when 'collection_attempts' then 'accounts_receivable'
      when 'accounts_payable' then 'accounts_payable'
      when 'finance_payments' then 'finance'
      when 'recurring_charges' then 'finance'
      when 'finance_audit_events' then 'audit'
      when 'admin_audit_events' then 'audit'
      when 'documents' then 'documents'
      when 'entity_attachments' then 'attachments'
      when 'notifications' then 'notifications'
      when 'team_members' then 'team'
      when 'company_settings' then 'settings'
      when 'user_preferences' then 'profile'
      when 'sla_rules' then 'support'
    end;
    v_select_action := case
      when v_table in ('admin_audit_events','finance_audit_events') then 'view_audit'
      when v_table = 'entity_attachments' then 'download'
      else 'view'
    end;
    v_insert_action := case
      when v_table in ('task_comments','project_activity','delivery_history','support_messages',
        'lead_interactions','proposal_events','contract_events','collection_attempts','user_preferences') then 'update'
      when v_table = 'entity_attachments' then 'upload'
      else 'create'
    end;
    v_update_action := 'update';
    v_delete_action := case when v_table = 'task_comments' then 'update' else 'delete' end;

    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_table and c.relkind in ('r','p')
    ) then continue; end if;

    execute format('alter table public.%I enable row level security', v_table);

    if v_table in ('leads','clients','proposals','contracts') then
      execute format('drop trigger if exists rbac_assign_record_owner on public.%I', v_table);
      execute format('create trigger rbac_assign_record_owner before insert on public.%I for each row execute function public.assign_workspace_record_owner()', v_table);
    end if;

    execute format('drop policy if exists %I on public.%I', 'rbac_select', v_table);
    execute format('create policy %I on public.%I as permissive for select to authenticated using (public.has_workspace_permission(%L, %L) and public.workspace_row_scope(%L, to_jsonb(%I)))', 'rbac_select', v_table, v_module, v_select_action, v_module, v_table);
    execute format('drop policy if exists %I on public.%I', 'rbac_select_restrict', v_table);
    execute format('create policy %I on public.%I as restrictive for select to authenticated using (public.has_workspace_permission(%L, %L) and public.workspace_row_scope(%L, to_jsonb(%I)))', 'rbac_select_restrict', v_table, v_module, v_select_action, v_module, v_table);

    if v_table = 'team_members' then continue; end if;

    execute format('drop policy if exists %I on public.%I', 'rbac_insert', v_table);
    execute format('create policy %I on public.%I as permissive for insert to authenticated with check (public.has_workspace_permission(%L, %L) and public.workspace_row_scope(%L, to_jsonb(%I)))', 'rbac_insert', v_table, v_module, v_insert_action, v_module, v_table);
    execute format('drop policy if exists %I on public.%I', 'rbac_insert_restrict', v_table);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (public.has_workspace_permission(%L, %L) and public.workspace_row_scope(%L, to_jsonb(%I)))', 'rbac_insert_restrict', v_table, v_module, v_insert_action, v_module, v_table);

    execute format('drop policy if exists %I on public.%I', 'rbac_update', v_table);
    execute format('create policy %I on public.%I as permissive for update to authenticated using (public.has_workspace_permission(%L, %L) and public.has_workspace_permission(%L, %L) and public.workspace_row_scope(%L, to_jsonb(%I))) with check (public.has_workspace_permission(%L, %L) and public.workspace_row_scope(%L, to_jsonb(%I)))', 'rbac_update', v_table, v_module, v_select_action, v_module, v_update_action, v_module, v_table, v_module, v_update_action, v_module, v_table);
    execute format('drop policy if exists %I on public.%I', 'rbac_update_restrict', v_table);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (public.has_workspace_permission(%L, %L) and public.has_workspace_permission(%L, %L) and public.workspace_row_scope(%L, to_jsonb(%I))) with check (public.has_workspace_permission(%L, %L) and public.workspace_row_scope(%L, to_jsonb(%I)))', 'rbac_update_restrict', v_table, v_module, v_select_action, v_module, v_update_action, v_module, v_table, v_module, v_update_action, v_module, v_table);

    execute format('drop policy if exists %I on public.%I', 'rbac_delete', v_table);
    execute format('create policy %I on public.%I as permissive for delete to authenticated using (public.has_workspace_permission(%L, %L) and public.workspace_row_scope(%L, to_jsonb(%I)))', 'rbac_delete', v_table, v_module, v_delete_action, v_module, v_table);
    execute format('drop policy if exists %I on public.%I', 'rbac_delete_restrict', v_table);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (public.has_workspace_permission(%L, %L) and public.workspace_row_scope(%L, to_jsonb(%I)))', 'rbac_delete_restrict', v_table, v_module, v_delete_action, v_module, v_table);
  end loop;
end;
$$;

do $$
begin
  if to_regclass('storage.objects') is null then return; end if;

  execute 'drop policy if exists rbac_private_documents_select_allow on storage.objects';
  execute 'create policy rbac_private_documents_select_allow on storage.objects as permissive for select to authenticated using (bucket_id = ''private-documents'' and public.workspace_storage_scope(name, ''select''))';
  execute 'drop policy if exists rbac_private_documents_select_restrict on storage.objects';
  execute 'create policy rbac_private_documents_select_restrict on storage.objects as restrictive for select to authenticated using (bucket_id <> ''private-documents'' or public.workspace_storage_scope(name, ''select''))';

  execute 'drop policy if exists rbac_private_documents_insert_allow on storage.objects';
  execute 'create policy rbac_private_documents_insert_allow on storage.objects as permissive for insert to authenticated with check (bucket_id = ''private-documents'' and public.workspace_storage_scope(name, ''insert''))';
  execute 'drop policy if exists rbac_private_documents_insert_restrict on storage.objects';
  execute 'create policy rbac_private_documents_insert_restrict on storage.objects as restrictive for insert to authenticated with check (bucket_id <> ''private-documents'' or public.workspace_storage_scope(name, ''insert''))';

  execute 'drop policy if exists rbac_private_documents_delete_allow on storage.objects';
  execute 'create policy rbac_private_documents_delete_allow on storage.objects as permissive for delete to authenticated using (bucket_id = ''private-documents'' and public.workspace_storage_scope(name, ''delete''))';
  execute 'drop policy if exists rbac_private_documents_delete_restrict on storage.objects';
  execute 'create policy rbac_private_documents_delete_restrict on storage.objects as restrictive for delete to authenticated using (bucket_id <> ''private-documents'' or public.workspace_storage_scope(name, ''delete''))';

  execute 'drop policy if exists rbac_private_documents_update_restrict on storage.objects';
  execute 'create policy rbac_private_documents_update_restrict on storage.objects as restrictive for update to authenticated using (bucket_id <> ''private-documents'' or public.workspace_storage_scope(name, ''update'')) with check (bucket_id <> ''private-documents'' or public.workspace_storage_scope(name, ''update''))';
end;
$$;

revoke insert, update, delete, truncate, references, trigger
  on public.team_members, public.access_roles, public.access_permissions, public.role_permissions,
  public.admin_audit_events
  from anon, authenticated;
grant select on public.access_roles, public.access_permissions, public.role_permissions, public.team_members
  to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.access_roles, public.access_permissions, public.role_permissions,
  public.admin_audit_events
  from anon, authenticated;

do $$
begin
  if to_regclass('public.finance_audit_events') is not null then
    execute 'revoke insert, update, delete, truncate, references, trigger on public.finance_audit_events from anon, authenticated';
  end if;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'project_activity','delivery_history','proposal_events','contract_events',
    'license_module_changes','license_events','license_sync_attempts'
  ]
  loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format('revoke update, delete, truncate, references, trigger on public.%I from anon, authenticated', v_table);
    end if;
  end loop;
end;
$$;

create index if not exists team_members_user_role_status_idx
  on public.team_members (user_id, role_name, status);
