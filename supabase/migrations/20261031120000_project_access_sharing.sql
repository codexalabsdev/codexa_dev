create or replace function public.has_workspace_permission(
  p_module text,
  p_action text
) returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
  select 1
  from public.team_members member
  where member.user_id = (select auth.uid())
      and lower(trim(both '"' from trim(both '''' from btrim(coalesce(member.status, '')))))
        in ('active', 'ativo', 'enabled', 'habilitado')
      and public.effective_workspace_permission(member.id, p_module, p_action)
  );
$$;

revoke all on function public.has_workspace_permission(text, text) from public, anon;
set search_path = public, auth, pg_temp;

alter table public.projects
  add column if not exists created_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.projects'::regclass
      and conname = 'projects_created_by_fkey'
  ) then
    alter table public.projects
      add constraint projects_created_by_fkey
      foreign key (created_by) references auth.users(id) on delete set null not valid;
  end if;
end;
$$;

with legacy_owners as (
  select project.id,
    (
      select event.actor_id
      from public.project_activity event
      join public.team_members member on member.user_id = event.actor_id
      where event.project_id = project.id
        and event.event_type = 'project.created'
        and lower(trim(both '"' from trim(both '''' from btrim(coalesce(member.status, '')))))
          in ('active', 'ativo', 'enabled', 'habilitado')
      order by event.created_at
      limit 1
    ) as creator_id,
    (
      select member.user_id
      from public.team_members member
      where (member.user_id = project.responsible_id or member.id = project.responsible_id)
        and member.user_id is not null
        and lower(trim(both '"' from trim(both '''' from btrim(coalesce(member.status, '')))))
          in ('active', 'ativo', 'enabled', 'habilitado')
      order by (member.user_id = project.responsible_id) desc
      limit 1
    ) as responsible_user_id
  from public.projects project
)
update public.projects project
set created_by = coalesce(legacy_owners.creator_id, legacy_owners.responsible_user_id)
from legacy_owners
where project.id = legacy_owners.id
  and project.created_by is null
  and coalesce(legacy_owners.creator_id, legacy_owners.responsible_user_id) is not null;

create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  access_level text not null default 'viewer',
  added_by uuid references auth.users(id) on delete set null,
  shared_by uuid references auth.users(id) on delete set null,
  is_active boolean not null default true,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.project_members
  add column if not exists access_level text not null default 'viewer',
  add column if not exists added_by uuid references auth.users(id) on delete set null,
  add column if not exists shared_by uuid references auth.users(id) on delete set null,
  add column if not exists is_active boolean not null default true,
  add column if not exists revoked_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.project_members
set is_active = true
where is_active is null;

update public.project_members
set access_level = 'viewer'
where access_level is null
  or access_level not in ('viewer', 'collaborator', 'manager');

alter table public.project_members
  alter column is_active set default true,
  alter column is_active set not null,
  alter column access_level set default 'viewer',
  alter column access_level set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.project_members'::regclass
      and conname = 'project_members_project_id_fkey'
  ) then
    alter table public.project_members
      add constraint project_members_project_id_fkey
      foreign key (project_id) references public.projects(id) on delete cascade not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.project_members'::regclass
      and conname = 'project_members_user_id_fkey'
  ) then
    alter table public.project_members
      add constraint project_members_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.project_members'::regclass
      and conname = 'project_members_shared_by_fkey'
  ) then
    alter table public.project_members
      add constraint project_members_shared_by_fkey
      foreign key (shared_by) references auth.users(id) on delete set null not valid;
  end if;
end;
$$;

update public.project_members
set shared_by = coalesce(shared_by, added_by)
where shared_by is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.project_members'::regclass
      and conname = 'project_members_access_level_check'
  ) then
    alter table public.project_members
      add constraint project_members_access_level_check
      check (access_level in ('viewer', 'collaborator', 'manager')) not valid;
  end if;
end;
$$;

alter table public.project_members
  validate constraint project_members_access_level_check;

with ranked as (
  select id,
    row_number() over (
      partition by project_id, user_id
      order by case access_level when 'manager' then 3 when 'collaborator' then 2 else 1 end desc,
        updated_at desc, created_at desc, id
    ) as duplicate_rank
  from public.project_members
)
delete from public.project_members member
using ranked
where member.id = ranked.id
  and ranked.duplicate_rank > 1;

create unique index if not exists project_members_project_user_uidx
  on public.project_members (project_id, user_id);
create index if not exists project_members_user_project_idx
  on public.project_members (user_id, project_id);

alter table public.project_members enable row level security;
revoke all on public.project_members from anon, authenticated;
grant select, insert, update on public.project_members to authenticated;

create or replace function public.project_access_level(p_project_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_role_name text;
  v_status text;
  v_creator_id uuid;
  v_access_level text;
  v_membership_active boolean;
begin
  if v_user_id is null then return null; end if;

  select member.role_name, member.status
    into v_role_name, v_status
  from public.team_members member
  where member.user_id = v_user_id
  limit 1;

  if not found or lower(trim(both '"' from trim(both '''' from btrim(coalesce(v_status, '')))))
    not in ('active', 'ativo', 'enabled', 'habilitado') then
    return null;
  end if;

  if lower(btrim(coalesce(v_role_name, ''))) = 'admin' then
    return 'manager';
  end if;

  select project.created_by into v_creator_id
  from public.projects project
  where project.id = p_project_id;

  if v_creator_id = v_user_id then return 'manager'; end if;

  select member.access_level, member.is_active
    into v_access_level, v_membership_active
  from public.project_members member
  where member.project_id = p_project_id
    and member.user_id = v_user_id;

  if found and v_membership_active is distinct from true then return null; end if;
  return v_access_level;
end;
$$;

create or replace function public.has_project_access(
  p_project_id uuid,
  p_required_level text default 'viewer'
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select case public.project_access_level(p_project_id)
    when 'manager' then p_required_level in ('viewer', 'collaborator', 'manager')
    when 'collaborator' then p_required_level in ('viewer', 'collaborator')
    when 'viewer' then p_required_level = 'viewer'
    else false
  end;
$$;

create or replace function public.set_project_creator()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      if new.created_by is null then new.created_by := auth.uid(); end if;
      if new.created_by is distinct from auth.uid()
        and not public.is_workspace_admin(auth.uid()) then
        raise exception 'project creator must be the authenticated user' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'project creator is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_set_creator on public.projects;
create trigger projects_set_creator
  before insert or update of created_by on public.projects
  for each row execute function public.set_project_creator();

create or replace function public.guard_project_member_write()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_project_creator uuid;
  v_member_status text;
begin
  if tg_op = 'INSERT' then
    if v_user_id is null then
      raise exception 'authentication required' using errcode = '42501';
    end if;
    if new.shared_by is null then new.shared_by := v_user_id; end if;
    if new.added_by is null then new.added_by := v_user_id; end if;
    if new.shared_by is distinct from v_user_id or new.added_by is distinct from v_user_id then
      raise exception 'share actor must be the authenticated user' using errcode = '42501';
    end if;
    new.is_active := true;
    new.revoked_at := null;
    select project.created_by into v_project_creator
    from public.projects project where project.id = new.project_id;
    if new.user_id = v_project_creator then
      raise exception 'project creator already has access' using errcode = '23514';
    end if;
    select member.status into v_member_status
    from public.team_members member where member.user_id = new.user_id limit 1;
    if lower(trim(both '"' from trim(both '''' from btrim(coalesce(v_member_status, '')))))
      not in ('active', 'ativo', 'enabled', 'habilitado') then
      raise exception 'project participant must be an active team member' using errcode = '23514';
    end if;
    new.updated_at := now();
    return new;
  end if;

  if new.project_id is distinct from old.project_id
    or new.user_id is distinct from old.user_id
    or new.added_by is distinct from old.added_by
    or new.shared_by is distinct from old.shared_by then
    raise exception 'project member identity is immutable' using errcode = '42501';
  end if;
  if new.is_active and not old.is_active then
    select member.status into v_member_status
    from public.team_members member where member.user_id = new.user_id limit 1;
    if lower(trim(both '"' from trim(both '''' from btrim(coalesce(v_member_status, '')))))
      not in ('active', 'ativo', 'enabled', 'habilitado') then
      raise exception 'project participant must be an active team member' using errcode = '23514';
    end if;
  end if;
  if new.is_active then new.revoked_at := null;
  elsif old.is_active then new.revoked_at := coalesce(new.revoked_at, now());
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists project_members_guard_write on public.project_members;
create trigger project_members_guard_write
  before insert or update on public.project_members
  for each row execute function public.guard_project_member_write();

create or replace function public.log_project_member_activity()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform public.append_project_activity(
      new.project_id, null, auth.uid(), 'project.member_added',
      'Participante adicionado ao projeto',
      jsonb_build_object('user_id', new.user_id, 'access_level', new.access_level)
    );
    return new;
  end if;

  if old.is_active and not new.is_active then
    perform public.append_project_activity(
      new.project_id, null, auth.uid(), 'project.member_revoked',
      'Acesso do participante revogado',
      jsonb_build_object('user_id', new.user_id, 'previous_access_level', old.access_level)
    );
  elsif not old.is_active and new.is_active then
    perform public.append_project_activity(
      new.project_id, null, auth.uid(), 'project.member_reactivated',
      'Acesso do participante reativado',
      jsonb_build_object('user_id', new.user_id, 'access_level', new.access_level)
    );
  elsif old.access_level is distinct from new.access_level then
    perform public.append_project_activity(
      new.project_id, null, auth.uid(), 'project.member_access_changed',
      'Nível de acesso do participante alterado',
      jsonb_build_object('user_id', new.user_id, 'from', old.access_level, 'to', new.access_level)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists project_members_activity_after_write on public.project_members;
create trigger project_members_activity_after_write
  after insert or update on public.project_members
  for each row execute function public.log_project_member_activity();

insert into public.access_permissions (id, module_name, action_name)
values (gen_random_uuid(), 'projects', 'share')
on conflict (module_name, action_name) do nothing;

grant execute on function public.has_workspace_permission(text, text) to authenticated;

insert into public.role_permissions (role_id, permission_id)
select role_permission.role_id, share_permission.id
from public.role_permissions role_permission
join public.access_roles role on role.id = role_permission.role_id
join public.access_permissions assign_permission
  on assign_permission.id = role_permission.permission_id
  and assign_permission.module_name = 'projects'
  and assign_permission.action_name = 'assign'
join public.access_permissions share_permission
  on share_permission.module_name = 'projects'
  and share_permission.action_name = 'share'
where lower(btrim(role.name)) <> 'admin'
on conflict (role_id, permission_id) do nothing;

drop policy if exists project_members_read_access on public.project_members;
drop policy if exists project_members_share_insert on public.project_members;
drop policy if exists project_members_share_update on public.project_members;
drop policy if exists project_members_share_delete on public.project_members;
drop policy if exists project_members_read_access_restrict on public.project_members;
drop policy if exists project_members_share_insert_restrict on public.project_members;
drop policy if exists project_members_share_update_restrict on public.project_members;
drop policy if exists project_members_share_delete_restrict on public.project_members;
create policy project_members_read_access
  on public.project_members for select to authenticated
  using (
    public.has_workspace_permission('projects', 'view')
    and public.has_project_access(project_id, 'viewer')
  );
create policy project_members_read_access_restrict
  on public.project_members as restrictive for select to authenticated
  using (
    public.has_workspace_permission('projects', 'view')
    and public.has_project_access(project_id, 'viewer')
  );

create policy project_members_share_insert
  on public.project_members for insert to authenticated
  with check (
    public.has_workspace_permission('projects', 'share')
    and public.has_project_access(project_id, 'manager')
    and shared_by = (select auth.uid())
    and added_by = (select auth.uid())
  );
create policy project_members_share_insert_restrict
  on public.project_members as restrictive for insert to authenticated
  with check (
    public.has_workspace_permission('projects', 'share')
    and public.has_project_access(project_id, 'manager')
    and shared_by = (select auth.uid())
    and added_by = (select auth.uid())
  );

create policy project_members_share_update
  on public.project_members for update to authenticated
  using (
    public.has_workspace_permission('projects', 'share')
    and public.has_project_access(project_id, 'manager')
  )
  with check (
    public.has_workspace_permission('projects', 'share')
    and public.has_project_access(project_id, 'manager')
  );
create policy project_members_share_update_restrict
  on public.project_members as restrictive for update to authenticated
  using (
    public.has_workspace_permission('projects', 'share')
    and public.has_project_access(project_id, 'manager')
  )
  with check (
    public.has_workspace_permission('projects', 'share')
    and public.has_project_access(project_id, 'manager')
  );

drop policy if exists rbac_select on public.projects;
drop policy if exists rbac_select_restrict on public.projects;
drop policy if exists project_access_select on public.projects;
drop policy if exists project_access_select_restrict on public.projects;
create policy project_access_select
  on public.projects for select to authenticated
  using (
    public.has_workspace_permission('projects', 'view')
    and public.has_project_access(id, 'viewer')
  );
create policy project_access_select_restrict
  on public.projects as restrictive for select to authenticated
  using (
    public.has_workspace_permission('projects', 'view')
    and public.has_project_access(id, 'viewer')
  );

drop policy if exists rbac_insert on public.projects;
drop policy if exists rbac_insert_restrict on public.projects;
drop policy if exists project_access_insert on public.projects;
drop policy if exists project_access_insert_restrict on public.projects;
create policy project_access_insert
  on public.projects for insert to authenticated
  with check (
    public.has_workspace_permission('projects', 'create')
    and created_by = (select auth.uid())
  );
create policy project_access_insert_restrict
  on public.projects as restrictive for insert to authenticated
  with check (
    public.has_workspace_permission('projects', 'create')
    and created_by = (select auth.uid())
  );

drop policy if exists rbac_update on public.projects;
drop policy if exists rbac_update_restrict on public.projects;
drop policy if exists project_access_update on public.projects;
drop policy if exists project_access_update_restrict on public.projects;
create policy project_access_update
  on public.projects for update to authenticated
  using (
    public.has_workspace_permission('projects', 'update')
    and public.has_project_access(id, 'manager')
  )
  with check (
    public.has_workspace_permission('projects', 'update')
    and public.has_project_access(id, 'manager')
  );
create policy project_access_update_restrict
  on public.projects as restrictive for update to authenticated
  using (
    public.has_workspace_permission('projects', 'update')
    and public.has_project_access(id, 'manager')
  )
  with check (
    public.has_workspace_permission('projects', 'update')
    and public.has_project_access(id, 'manager')
  );

drop policy if exists rbac_delete on public.projects;
drop policy if exists rbac_delete_restrict on public.projects;
drop policy if exists project_access_delete on public.projects;
drop policy if exists project_access_delete_restrict on public.projects;
create policy project_access_delete
  on public.projects for delete to authenticated
  using (
    public.has_workspace_permission('projects', 'delete')
    and public.has_project_access(id, 'manager')
  );
create policy project_access_delete_restrict
  on public.projects as restrictive for delete to authenticated
  using (
    public.has_workspace_permission('projects', 'delete')
    and public.has_project_access(id, 'manager')
  );

create or replace function public.workspace_task_row_scope(
  p_row jsonb,
  p_required_level text default 'viewer'
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_member_id uuid := public.current_team_member_id();
  v_project_id uuid := nullif(p_row->>'project_id', '')::uuid;
  v_responsible_id text := p_row->>'responsible_id';
  v_received_from_id text := p_row->>'received_from_user_id';
  v_participants jsonb := coalesce(p_row->'participants', '[]'::jsonb);
begin
  if v_user_id is null then return false; end if;
  if v_project_id is not null then
    if exists (
      select 1 from public.project_members member
      where member.project_id = v_project_id
        and member.user_id = v_user_id
        and not member.is_active
    ) then
      return false;
    end if;
    return public.has_project_access(v_project_id, p_required_level)
      or (
        p_required_level in ('viewer', 'collaborator')
        and (
          v_responsible_id in (v_user_id::text, v_member_id::text)
          or v_participants ? v_user_id::text
        )
      );
  end if;

  return v_responsible_id in (v_user_id::text, v_member_id::text)
    or v_received_from_id = v_user_id::text
    or (p_required_level in ('viewer', 'collaborator') and v_participants ? v_user_id::text);
end;
$$;

create or replace function public.has_project_task_access(
  p_task_id uuid,
  p_required_level text default 'viewer'
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select coalesce((
    select public.workspace_task_row_scope(to_jsonb(task), p_required_level)
    from public.project_tasks task
    where task.id = p_task_id
  ), false);
$$;

drop policy if exists rbac_select on public.project_tasks;
drop policy if exists rbac_select_restrict on public.project_tasks;
drop policy if exists project_tasks_shared_select on public.project_tasks;
drop policy if exists project_task_access_select on public.project_tasks;
drop policy if exists project_task_access_select_restrict on public.project_tasks;
create policy project_task_access_select
  on public.project_tasks for select to authenticated
  using (
    public.has_workspace_permission('projects', 'view')
    and public.workspace_task_row_scope(to_jsonb(project_tasks), 'viewer')
  );
create policy project_task_access_select_restrict
  on public.project_tasks as restrictive for select to authenticated
  using (
    public.has_workspace_permission('projects', 'view')
    and public.workspace_task_row_scope(to_jsonb(project_tasks), 'viewer')
  );

drop policy if exists rbac_insert on public.project_tasks;
drop policy if exists rbac_insert_restrict on public.project_tasks;
drop policy if exists project_task_access_insert on public.project_tasks;
drop policy if exists project_task_access_insert_restrict on public.project_tasks;
create policy project_task_access_insert
  on public.project_tasks for insert to authenticated
  with check (
    public.has_workspace_permission('projects', 'create')
    and (
      (project_id is not null and public.has_project_access(project_id, 'collaborator'))
      or (project_id is null and public.workspace_task_row_scope(to_jsonb(project_tasks), 'collaborator'))
    )
  );
create policy project_task_access_insert_restrict
  on public.project_tasks as restrictive for insert to authenticated
  with check (
    public.has_workspace_permission('projects', 'create')
    and (
      (project_id is not null and public.has_project_access(project_id, 'collaborator'))
      or (project_id is null and public.workspace_task_row_scope(to_jsonb(project_tasks), 'collaborator'))
    )
  );

drop policy if exists rbac_update on public.project_tasks;
drop policy if exists rbac_update_restrict on public.project_tasks;
drop policy if exists project_task_access_update on public.project_tasks;
drop policy if exists project_task_access_update_restrict on public.project_tasks;
create policy project_task_access_update
  on public.project_tasks for update to authenticated
  using (
    public.has_workspace_permission('projects', 'update')
    and public.workspace_task_row_scope(to_jsonb(project_tasks), 'collaborator')
  )
  with check (
    public.has_workspace_permission('projects', 'update')
    and (
      (project_id is not null and public.has_project_access(project_id, 'collaborator'))
      or (project_id is null and public.workspace_task_row_scope(to_jsonb(project_tasks), 'collaborator'))
    )
  );
create policy project_task_access_update_restrict
  on public.project_tasks as restrictive for update to authenticated
  using (
    public.has_workspace_permission('projects', 'update')
    and public.workspace_task_row_scope(to_jsonb(project_tasks), 'collaborator')
  )
  with check (
    public.has_workspace_permission('projects', 'update')
    and (
      (project_id is not null and public.has_project_access(project_id, 'collaborator'))
      or (project_id is null and public.workspace_task_row_scope(to_jsonb(project_tasks), 'collaborator'))
    )
  );

drop policy if exists rbac_delete on public.project_tasks;
drop policy if exists rbac_delete_restrict on public.project_tasks;
drop policy if exists project_task_access_delete on public.project_tasks;
drop policy if exists project_task_access_delete_restrict on public.project_tasks;
create policy project_task_access_delete
  on public.project_tasks for delete to authenticated
  using (
    public.has_workspace_permission('projects', 'delete')
    and public.workspace_task_row_scope(to_jsonb(project_tasks), 'manager')
  );
create policy project_task_access_delete_restrict
  on public.project_tasks as restrictive for delete to authenticated
  using (
    public.has_workspace_permission('projects', 'delete')
    and public.workspace_task_row_scope(to_jsonb(project_tasks), 'manager')
  );

drop policy if exists rbac_select on public.task_comments;
drop policy if exists rbac_select_restrict on public.task_comments;
drop policy if exists "Project members can view task comments" on public.task_comments;
drop policy if exists project_task_comments_select on public.task_comments;
drop policy if exists project_task_comments_select_restrict on public.task_comments;
create policy project_task_comments_select
  on public.task_comments for select to authenticated
  using (
    public.has_workspace_permission('projects', 'view')
    and public.has_project_task_access(task_id, 'viewer')
  );
create policy project_task_comments_select_restrict
  on public.task_comments as restrictive for select to authenticated
  using (
    public.has_workspace_permission('projects', 'view')
    and public.has_project_task_access(task_id, 'viewer')
  );

drop policy if exists rbac_insert on public.task_comments;
drop policy if exists rbac_insert_restrict on public.task_comments;
drop policy if exists "Project members can comment on visible tasks" on public.task_comments;
drop policy if exists project_task_comments_insert on public.task_comments;
drop policy if exists project_task_comments_insert_restrict on public.task_comments;
drop policy if exists rbac_update_restrict on public.task_comments;
drop policy if exists rbac_delete_restrict on public.task_comments;
create policy project_task_comments_insert
  on public.task_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.has_workspace_permission('projects', 'update')
    and public.has_project_task_access(task_id, 'collaborator')
  );
create policy project_task_comments_insert_restrict
  on public.task_comments as restrictive for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.has_workspace_permission('projects', 'update')
    and public.has_project_task_access(task_id, 'collaborator')
  );

drop policy if exists project_task_comments_update_restrict on public.task_comments;
drop policy if exists project_task_comments_delete_restrict on public.task_comments;
create policy project_task_comments_update_restrict
  on public.task_comments as restrictive for update to authenticated
  using (
    author_id = (select auth.uid())
    and public.has_workspace_permission('projects', 'update')
    and public.has_project_task_access(task_id, 'collaborator')
  )
  with check (
    author_id = (select auth.uid())
    and public.has_workspace_permission('projects', 'update')
    and public.has_project_task_access(task_id, 'collaborator')
  );
create policy project_task_comments_delete_restrict
  on public.task_comments as restrictive for delete to authenticated
  using (
    author_id = (select auth.uid())
    and public.has_workspace_permission('projects', 'update')
    and public.has_project_task_access(task_id, 'collaborator')
  );

drop policy if exists rbac_select on public.project_activity;
drop policy if exists rbac_select_restrict on public.project_activity;
drop policy if exists "Project members can view project activity" on public.project_activity;
drop policy if exists project_activity_access_select on public.project_activity;
drop policy if exists project_activity_access_select_restrict on public.project_activity;
create policy project_activity_access_select
  on public.project_activity for select to authenticated
  using (
    public.has_workspace_permission('projects', 'view')
    and public.has_project_access(project_id, 'viewer')
  );
create policy project_activity_access_select_restrict
  on public.project_activity as restrictive for select to authenticated
  using (
    public.has_workspace_permission('projects', 'view')
    and public.has_project_access(project_id, 'viewer')
  );

create or replace function public.workspace_attachment_scope(p_row jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_entity_type text := p_row->>'entity_type';
  v_entity_id uuid := nullif(p_row->>'entity_id', '')::uuid;
begin
  if v_entity_id is null then return false; end if;

  if v_entity_type = 'project' then
    return public.has_project_access(v_entity_id, 'viewer');
  end if;

  if v_entity_type = 'task' then
    return public.has_project_task_access(v_entity_id, 'viewer');
  end if;

  if v_entity_type = 'contract' then
    return exists (
      select 1 from public.contracts contract
      where contract.id = v_entity_id
        and public.workspace_row_scope('contracts', to_jsonb(contract))
    );
  end if;

  return false;
end;
$$;

revoke all on function public.project_access_level(uuid) from public, anon;
revoke all on function public.has_project_access(uuid, text) from public, anon;
revoke all on function public.has_project_task_access(uuid, text) from public, anon;
revoke all on function public.workspace_task_row_scope(jsonb, text) from public, anon;
revoke all on function public.workspace_attachment_scope(jsonb) from public, anon;
grant execute on function public.project_access_level(uuid) to authenticated;
grant execute on function public.has_project_access(uuid, text) to authenticated;
grant execute on function public.has_project_task_access(uuid, text) to authenticated;
grant execute on function public.workspace_task_row_scope(jsonb, text) to authenticated;
grant execute on function public.workspace_attachment_scope(jsonb) to authenticated;