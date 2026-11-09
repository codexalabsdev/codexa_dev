insert into storage.buckets (id, name, public)
values ('private-documents', 'private-documents', false)
on conflict (id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.access_roles role
cross join (values
  ('contracts', 'create'),
  ('attachments', 'upload'),
  ('attachments', 'download')
) as grants(module_name, action_name)
join public.access_permissions permission
  on permission.module_name = grants.module_name
  and permission.action_name = grants.action_name
where lower(btrim(role.name)) = 'comercial'
on conflict (role_id, permission_id) do nothing;

create or replace function public.workspace_attachment_scope(p_row jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_entity_type text := p_row->>'entity_type';
  v_entity_id text := nullif(p_row->>'entity_id', '');
begin
  if v_entity_id is null
    or v_entity_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;

  if v_entity_type = 'contract' then
    return exists (
      select 1
      from public.contracts contract
      where contract.id = v_entity_id::uuid
        and public.workspace_row_scope('contracts', to_jsonb(contract))
    );
  end if;

  if v_entity_type = 'project' then
    return exists (
      select 1
      from public.projects project
      where project.id = v_entity_id::uuid
        and public.workspace_row_scope('projects', to_jsonb(project))
    );
  end if;

  if v_entity_type = 'task' then
    return exists (
      select 1
      from public.project_tasks task
      where task.id = v_entity_id::uuid
        and public.workspace_row_scope('projects', to_jsonb(task))
    );
  end if;

  return false;
end;
$function$;

revoke all on function public.workspace_attachment_scope(jsonb) from public, anon;
grant execute on function public.workspace_attachment_scope(jsonb) to authenticated;

drop policy if exists rbac_select on public.entity_attachments;
drop policy if exists rbac_select_restrict on public.entity_attachments;
create policy rbac_select on public.entity_attachments
  as permissive for select to authenticated
  using (public.has_workspace_permission('attachments', 'download') and public.workspace_attachment_scope(to_jsonb(entity_attachments)));
create policy rbac_select_restrict on public.entity_attachments
  as restrictive for select to authenticated
  using (public.has_workspace_permission('attachments', 'download') and public.workspace_attachment_scope(to_jsonb(entity_attachments)));

drop policy if exists rbac_insert on public.entity_attachments;
drop policy if exists rbac_insert_restrict on public.entity_attachments;
create policy rbac_insert on public.entity_attachments
  as permissive for insert to authenticated
  with check (public.has_workspace_permission('attachments', 'upload') and public.workspace_attachment_scope(to_jsonb(entity_attachments)));
create policy rbac_insert_restrict on public.entity_attachments
  as restrictive for insert to authenticated
  with check (public.has_workspace_permission('attachments', 'upload') and public.workspace_attachment_scope(to_jsonb(entity_attachments)));

drop policy if exists rbac_update on public.entity_attachments;
drop policy if exists rbac_update_restrict on public.entity_attachments;
create policy rbac_update on public.entity_attachments
  as permissive for update to authenticated
  using (public.has_workspace_permission('attachments', 'download') and public.has_workspace_permission('attachments', 'update') and public.workspace_attachment_scope(to_jsonb(entity_attachments)))
  with check (public.has_workspace_permission('attachments', 'update') and public.workspace_attachment_scope(to_jsonb(entity_attachments)));
create policy rbac_update_restrict on public.entity_attachments
  as restrictive for update to authenticated
  using (public.has_workspace_permission('attachments', 'download') and public.has_workspace_permission('attachments', 'update') and public.workspace_attachment_scope(to_jsonb(entity_attachments)))
  with check (public.has_workspace_permission('attachments', 'update') and public.workspace_attachment_scope(to_jsonb(entity_attachments)));

drop policy if exists rbac_delete on public.entity_attachments;
drop policy if exists rbac_delete_restrict on public.entity_attachments;
create policy rbac_delete on public.entity_attachments
  as permissive for delete to authenticated
  using (public.has_workspace_permission('attachments', 'delete') and public.workspace_attachment_scope(to_jsonb(entity_attachments)));
create policy rbac_delete_restrict on public.entity_attachments
  as restrictive for delete to authenticated
  using (public.has_workspace_permission('attachments', 'delete') and public.workspace_attachment_scope(to_jsonb(entity_attachments)));

create or replace function public.workspace_storage_scope(p_name text, p_action text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
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
    and public.workspace_attachment_scope(jsonb_build_object(
      'entity_type', v_entity_type,
      'entity_id', v_entity_id
    ));
end;
$function$;
