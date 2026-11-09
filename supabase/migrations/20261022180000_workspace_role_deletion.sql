set search_path = public, auth, pg_temp;

create or replace function public.protect_admin_access_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' and old.is_system then
    raise exception using errcode = '42501', message = 'System roles cannot be deleted';
  end if;

  if lower(coalesce(old.name, '')) = 'admin' then
    if tg_op = 'DELETE' then
      raise exception using errcode = '42501', message = 'The system administrator role cannot be deleted';
    end if;
    if (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
      raise exception using errcode = '42501', message = 'The system administrator role is protected';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.serialize_workspace_role_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtext('workspace-admin-members'));

  if not exists (
    select 1
    from public.access_roles role
    where lower(btrim(role.name)) = lower(btrim(new.role_name))
  ) then
    raise exception using errcode = '23503', message = 'Assigned workspace role does not exist';
  end if;
  return new;
end;
$$;

drop trigger if exists serialize_workspace_role_assignment on public.team_members;
create trigger serialize_workspace_role_assignment
  before insert or update of role_name on public.team_members
  for each row execute function public.serialize_workspace_role_assignment();

revoke all on function public.protect_admin_access_role() from public, anon, authenticated;
revoke all on function public.serialize_workspace_role_assignment() from public, anon, authenticated;

create or replace function public.delete_workspace_role(
  p_actor_id uuid,
  p_role_id uuid,
  p_reassign_role_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor_role text;
  v_role public.access_roles%rowtype;
  v_target_role public.access_roles%rowtype;
  v_member_count integer;
  v_reassigned_count integer := 0;
  v_previous jsonb;
begin
  select * into v_role
  from public.access_roles
  where id = p_role_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Role not found';
  end if;
  if v_role.is_system or lower(v_role.name) = 'admin' then
    raise exception using errcode = '42501', message = 'System roles cannot be deleted';
  end if;

  perform pg_advisory_xact_lock(hashtext('workspace-admin-members'));

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
    from public.access_roles actor_role
    join public.role_permissions actor_grant on actor_grant.role_id = actor_role.id
    join public.access_permissions permission on permission.id = actor_grant.permission_id
    where lower(btrim(actor_role.name)) = lower(btrim(v_actor_role))
      and actor_role.is_active
      and permission.module_name = 'roles'
      and permission.action_name = 'manage_roles'
  ) then
    raise exception using errcode = '42501', message = 'Role management permission required';
  end if;

  select count(*)::integer into v_member_count
  from public.team_members member
  where lower(btrim(member.role_name)) = lower(btrim(v_role.name));

  if v_member_count > 0 and p_reassign_role_id is null then
    raise exception using errcode = '23514',
      message = 'Role has assigned members and requires reassignment',
      detail = v_member_count::text;
  end if;
  if v_member_count = 0 and p_reassign_role_id is not null then
    raise exception using errcode = '22023', message = 'No role reassignment is needed';
  end if;

  if p_reassign_role_id is not null then
    if p_reassign_role_id = p_role_id then
      raise exception using errcode = '22023', message = 'A role cannot be reassigned to itself';
    end if;

    select * into v_target_role
    from public.access_roles
    where id = p_reassign_role_id
      and is_active
    for update;
    if not found then
      raise exception using errcode = '22023', message = 'Replacement role must be active';
    end if;
    if lower(v_target_role.name) = 'admin' and lower(v_actor_role) <> 'admin' then
      raise exception using errcode = '42501', message = 'Only an administrator may assign the administrator role';
    end if;

    if lower(v_actor_role) <> 'admin' and exists (
      select 1
      from public.role_permissions target_grant
      join public.access_permissions target_permission on target_permission.id = target_grant.permission_id
      where target_grant.role_id = v_target_role.id
        and not exists (
          select 1
          from public.access_roles actor_role
          join public.role_permissions actor_grant on actor_grant.role_id = actor_role.id
          join public.access_permissions actor_permission on actor_permission.id = actor_grant.permission_id
          where lower(btrim(actor_role.name)) = lower(btrim(v_actor_role))
            and actor_permission.module_name = target_permission.module_name
            and actor_permission.action_name = target_permission.action_name
        )
    ) then
      raise exception using errcode = '42501', message = 'Cannot assign a role with greater permissions';
    end if;
  end if;

  select to_jsonb(v_role) || jsonb_build_object(
    'permissions',
    coalesce((
      select jsonb_agg(permission.module_name || ':' || permission.action_name)
      from public.role_permissions role_grant
      join public.access_permissions permission on permission.id = role_grant.permission_id
      where role_grant.role_id = v_role.id
    ), '[]'::jsonb)
  ) into v_previous;

  if v_member_count > 0 then
    update public.team_members
    set role_name = v_target_role.name,
        updated_at = now()
    where lower(btrim(role_name)) = lower(btrim(v_role.name));
    get diagnostics v_reassigned_count = row_count;
  end if;

  delete from public.role_permissions where role_id = v_role.id;
  delete from public.access_roles where id = v_role.id;

  insert into public.admin_audit_events (
    actor_id, action_name, entity_type, entity_id, previous_data, new_data, result
  ) values (
    p_actor_id,
    'role.deleted',
    'access_role',
    v_role.id,
    v_previous,
    jsonb_build_object(
      'reassigned_to_role_id', case when p_reassign_role_id is null then null else v_target_role.id end,
      'reassigned_to_role_name', case when p_reassign_role_id is null then null else v_target_role.name end,
      'reassigned_member_count', v_reassigned_count
    ),
    'success'
  );

  return jsonb_build_object(
    'role_id', v_role.id,
    'reassigned_member_count', v_reassigned_count
  );
end;
$$;

revoke all on function public.delete_workspace_role(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_workspace_role(uuid, uuid, uuid) to service_role;
