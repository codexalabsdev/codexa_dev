alter table public.access_permissions
  add column if not exists is_active boolean not null default true;

with valid_permissions(module_name, action_name) as (
  values
    ('dashboard', 'view'),
    ('dashboard_comercial', 'view'),
    ('leads', 'view'), ('leads', 'create'), ('leads', 'update'), ('leads', 'delete'), ('leads', 'assign'), ('leads', 'change_status'), ('leads', 'export'),
    ('clients', 'view'), ('clients', 'create'), ('clients', 'update'), ('clients', 'delete'), ('clients', 'assign'), ('clients', 'export'),
    ('contacts', 'view'), ('contacts', 'create'), ('contacts', 'update'), ('contacts', 'delete'), ('contacts', 'assign'), ('contacts', 'export'),
    ('proposals', 'view'), ('proposals', 'create'), ('proposals', 'update'), ('proposals', 'delete'), ('proposals', 'approve'), ('proposals', 'change_status'), ('proposals', 'export'),
    ('contracts', 'view'), ('contracts', 'create'), ('contracts', 'update'), ('contracts', 'delete'), ('contracts', 'approve'), ('contracts', 'export'),
    ('projects', 'view'), ('projects', 'create'), ('projects', 'update'), ('projects', 'delete'), ('projects', 'archive'), ('projects', 'assign'), ('projects', 'share'), ('projects', 'change_status'),
    ('change_requests', 'view'), ('change_requests', 'create'), ('change_requests', 'update'), ('change_requests', 'delete'), ('change_requests', 'approve'), ('change_requests', 'assign'), ('change_requests', 'change_status'),
    ('support', 'view'), ('support', 'create'), ('support', 'update'), ('support', 'delete'), ('support', 'manage'), ('support', 'assign'), ('support', 'change_status'), ('support', 'upload'), ('support', 'download'),
    ('systems', 'view'), ('systems', 'create'), ('systems', 'update'), ('systems', 'delete'), ('systems', 'manage'), ('systems', 'export'),
    ('modules', 'view'), ('modules', 'create'), ('modules', 'update'), ('modules', 'delete'), ('modules', 'manage'), ('modules', 'release_modules'),
    ('plans', 'view'), ('plans', 'create'), ('plans', 'update'), ('plans', 'delete'), ('plans', 'manage'), ('plans', 'export'),
    ('licenses', 'view'), ('licenses', 'manage_licenses'), ('licenses', 'release_modules'), ('licenses', 'export'),
    ('accounts_receivable', 'view'), ('accounts_receivable', 'create'), ('accounts_receivable', 'update'), ('accounts_receivable', 'delete'), ('accounts_receivable', 'approve'), ('accounts_receivable', 'export'),
    ('accounts_payable', 'view'), ('accounts_payable', 'create'), ('accounts_payable', 'update'), ('accounts_payable', 'delete'), ('accounts_payable', 'approve'), ('accounts_payable', 'export'),
    ('finance', 'view'), ('finance', 'create'), ('finance', 'update'), ('finance', 'delete'), ('finance', 'manage'), ('finance', 'approve'), ('finance', 'export'),
    ('reports_commercial', 'view'), ('reports_commercial', 'export'),
    ('reports_financial', 'view'), ('reports_financial', 'export'),
    ('team', 'view'),
    ('users', 'manage_users'),
    ('roles', 'manage_roles'),
    ('settings', 'view'), ('settings', 'update'),
    ('appearance', 'view'), ('appearance', 'update'),
    ('audit', 'view_audit'), ('audit', 'export'),
    ('profile', 'view'), ('profile', 'update'),
    ('documents', 'view'), ('documents', 'upload'), ('documents', 'download'),
    ('attachments', 'upload'), ('attachments', 'download'), ('attachments', 'delete'),
    ('notifications', 'view'), ('notifications', 'update'),
    ('badges', 'view'), ('badges', 'manage')
)
insert into public.access_permissions (id, module_name, action_name, is_active)
select gen_random_uuid(), module_name, action_name, true
from valid_permissions
on conflict (module_name, action_name) do update
set is_active = true;

with valid_permissions(module_name, action_name) as (
  values
    ('dashboard', 'view'), ('dashboard_comercial', 'view'),
    ('leads', 'view'), ('leads', 'create'), ('leads', 'update'), ('leads', 'delete'), ('leads', 'assign'), ('leads', 'change_status'), ('leads', 'export'),
    ('clients', 'view'), ('clients', 'create'), ('clients', 'update'), ('clients', 'delete'), ('clients', 'assign'), ('clients', 'export'),
    ('contacts', 'view'), ('contacts', 'create'), ('contacts', 'update'), ('contacts', 'delete'), ('contacts', 'assign'), ('contacts', 'export'),
    ('proposals', 'view'), ('proposals', 'create'), ('proposals', 'update'), ('proposals', 'delete'), ('proposals', 'approve'), ('proposals', 'change_status'), ('proposals', 'export'),
    ('contracts', 'view'), ('contracts', 'create'), ('contracts', 'update'), ('contracts', 'delete'), ('contracts', 'approve'), ('contracts', 'export'),
    ('projects', 'view'), ('projects', 'create'), ('projects', 'update'), ('projects', 'delete'), ('projects', 'archive'), ('projects', 'assign'), ('projects', 'share'), ('projects', 'change_status'),
    ('change_requests', 'view'), ('change_requests', 'create'), ('change_requests', 'update'), ('change_requests', 'delete'), ('change_requests', 'approve'), ('change_requests', 'assign'), ('change_requests', 'change_status'),
    ('support', 'view'), ('support', 'create'), ('support', 'update'), ('support', 'delete'), ('support', 'manage'), ('support', 'assign'), ('support', 'change_status'), ('support', 'upload'), ('support', 'download'),
    ('systems', 'view'), ('systems', 'create'), ('systems', 'update'), ('systems', 'delete'), ('systems', 'manage'), ('systems', 'export'),
    ('modules', 'view'), ('modules', 'create'), ('modules', 'update'), ('modules', 'delete'), ('modules', 'manage'), ('modules', 'release_modules'),
    ('plans', 'view'), ('plans', 'create'), ('plans', 'update'), ('plans', 'delete'), ('plans', 'manage'), ('plans', 'export'),
    ('licenses', 'view'), ('licenses', 'manage_licenses'), ('licenses', 'release_modules'), ('licenses', 'export'),
    ('accounts_receivable', 'view'), ('accounts_receivable', 'create'), ('accounts_receivable', 'update'), ('accounts_receivable', 'delete'), ('accounts_receivable', 'approve'), ('accounts_receivable', 'export'),
    ('accounts_payable', 'view'), ('accounts_payable', 'create'), ('accounts_payable', 'update'), ('accounts_payable', 'delete'), ('accounts_payable', 'approve'), ('accounts_payable', 'export'),
    ('finance', 'view'), ('finance', 'create'), ('finance', 'update'), ('finance', 'delete'), ('finance', 'manage'), ('finance', 'approve'), ('finance', 'export'),
    ('reports_commercial', 'view'), ('reports_commercial', 'export'), ('reports_financial', 'view'), ('reports_financial', 'export'),
    ('team', 'view'), ('users', 'manage_users'), ('roles', 'manage_roles'),
    ('settings', 'view'), ('settings', 'update'), ('appearance', 'view'), ('appearance', 'update'),
    ('audit', 'view_audit'), ('audit', 'export'), ('profile', 'view'), ('profile', 'update'),
    ('documents', 'view'), ('documents', 'upload'), ('documents', 'download'),
    ('attachments', 'upload'), ('attachments', 'download'), ('attachments', 'delete'),
    ('notifications', 'view'), ('notifications', 'update'), ('badges', 'view'), ('badges', 'manage')
)
update public.access_permissions permission
set is_active = exists (
  select 1 from valid_permissions valid
  where valid.module_name = permission.module_name
    and valid.action_name = permission.action_name
)
where permission.is_active is distinct from exists (
  select 1 from valid_permissions valid
  where valid.module_name = permission.module_name
    and valid.action_name = permission.action_name
);

insert into public.role_permissions (role_id, permission_id)
select role_permission.role_id, target_permission.id
from public.role_permissions role_permission
join public.access_roles role on role.id = role_permission.role_id
join public.access_permissions source_permission
  on source_permission.id = role_permission.permission_id
join public.access_permissions target_permission
  on target_permission.is_active
 and (
   (source_permission.module_name = 'projects' and source_permission.action_name = 'assign'
    and target_permission.module_name = 'projects' and target_permission.action_name = 'share')
   or (source_permission.module_name = 'projects' and source_permission.action_name = 'update'
    and target_permission.module_name = 'projects' and target_permission.action_name = 'archive')
   or (source_permission.module_name = 'projects' and source_permission.action_name = 'upload'
    and target_permission.module_name = 'attachments' and target_permission.action_name = 'upload')
   or (source_permission.module_name = 'projects' and source_permission.action_name = 'download'
    and target_permission.module_name = 'attachments' and target_permission.action_name = 'download')
 )
where lower(btrim(role.name)) <> 'admin'
on conflict (role_id, permission_id) do nothing;

create or replace function public.effective_workspace_permission(
  p_member_id uuid,
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
    where member.id = p_member_id
      and lower(trim(both '"' from trim(both '''' from btrim(coalesce(member.status, '')))))
        in ('active', 'ativo', 'enabled', 'habilitado')
      and (
        lower(btrim(coalesce(member.role_name, ''))) = 'admin'
        or coalesce(
          (
            select permission_override.effect = 'allow'
            from public.workspace_member_permission_overrides permission_override
            join public.access_permissions permission
              on permission.id = permission_override.permission_id
            where permission_override.member_id = member.id
              and permission.is_active
              and lower(btrim(permission.module_name)) = lower(btrim(p_module))
              and lower(btrim(permission.action_name)) = lower(btrim(p_action))
            limit 1
          ),
          exists (
            select 1
            from public.access_roles role
            join public.role_permissions role_permission on role_permission.role_id = role.id
            join public.access_permissions permission on permission.id = role_permission.permission_id
            where lower(btrim(role.name)) = lower(btrim(member.role_name))
              and role.is_active
              and permission.is_active
              and lower(btrim(permission.module_name)) = lower(btrim(p_module))
              and lower(btrim(permission.action_name)) = lower(btrim(p_action))
          )
        )
      )
  );
$$;

create or replace function public.reject_inactive_role_permission()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not exists (
    select 1 from public.access_permissions permission
    where permission.id = new.permission_id and permission.is_active
  ) then
    raise exception 'Permission is inactive or unknown' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists role_permissions_active_guard on public.role_permissions;
create trigger role_permissions_active_guard
  before insert or update on public.role_permissions
  for each row execute function public.reject_inactive_role_permission();

create or replace function public.reject_inactive_member_permission_override()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not exists (
    select 1 from public.access_permissions permission
    where permission.id = new.permission_id and permission.is_active
  ) then
    raise exception 'Permission is inactive or unknown' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists workspace_member_permission_active_guard on public.workspace_member_permission_overrides;
create trigger workspace_member_permission_active_guard
  before insert or update on public.workspace_member_permission_overrides
  for each row execute function public.reject_inactive_member_permission_override();

revoke all on function public.effective_workspace_permission(uuid, text, text) from public, anon;
grant execute on function public.effective_workspace_permission(uuid, text, text) to authenticated;

create or replace function public.require_project_archive_permission()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if lower(btrim(coalesce(new.status, ''))) = 'arquivado'
    and lower(btrim(coalesce(old.status, ''))) <> 'arquivado'
    and not public.has_workspace_permission('projects', 'archive') then
    raise exception 'project archive permission required' using errcode = '42501';
  end if;
  if lower(btrim(coalesce(new.status, ''))) = 'arquivado'
    and lower(btrim(coalesce(old.status, ''))) <> 'arquivado'
    and public.has_workspace_permission('projects', 'archive')
    and not public.has_workspace_permission('projects', 'update')
    and (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
    raise exception 'archive-only permission cannot edit project fields' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_require_archive_permission on public.projects;
create trigger projects_require_archive_permission
  before update of status on public.projects
  for each row execute function public.require_project_archive_permission();

drop policy if exists project_access_update on public.projects;
drop policy if exists project_access_update_restrict on public.projects;
create policy project_access_update
  on public.projects for update to authenticated
  using (
    public.has_project_access(id, 'manager')
    and (
      public.has_workspace_permission('projects', 'update')
      or public.has_workspace_permission('projects', 'archive')
    )
  )
  with check (
    public.has_project_access(id, 'manager')
    and (
      public.has_workspace_permission('projects', 'update')
      or (
        lower(btrim(coalesce(status, ''))) = 'arquivado'
        and public.has_workspace_permission('projects', 'archive')
      )
    )
  );
create policy project_access_update_restrict
  on public.projects as restrictive for update to authenticated
  using (
    public.has_project_access(id, 'manager')
    and (
      public.has_workspace_permission('projects', 'update')
      or public.has_workspace_permission('projects', 'archive')
    )
  )
  with check (
    public.has_project_access(id, 'manager')
    and (
      public.has_workspace_permission('projects', 'update')
      or (
        lower(btrim(coalesce(status, ''))) = 'arquivado'
        and public.has_workspace_permission('projects', 'archive')
      )
    )
  );