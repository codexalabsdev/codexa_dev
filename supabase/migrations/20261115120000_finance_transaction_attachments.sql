insert into public.role_permissions (role_id, permission_id)
select distinct role_permission.role_id, attachment_permission.id
from public.role_permissions role_permission
join public.access_permissions finance_permission
  on finance_permission.id = role_permission.permission_id
join public.access_permissions attachment_permission
  on attachment_permission.module_name = 'attachments'
 and attachment_permission.action_name in ('upload', 'download')
where finance_permission.module_name in ('accounts_receivable', 'accounts_payable', 'finance')
  and ((attachment_permission.action_name = 'download' and finance_permission.action_name = 'view')
    or (attachment_permission.action_name = 'upload' and finance_permission.action_name in ('create', 'update')))
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
      select 1 from public.contracts contract
      where contract.id = v_entity_id::uuid
        and public.workspace_row_scope('contracts', to_jsonb(contract))
    );
  end if;

  if v_entity_type = 'project' then
    return exists (
      select 1 from public.projects project
      where project.id = v_entity_id::uuid
        and public.workspace_row_scope('projects', to_jsonb(project))
    );
  end if;

  if v_entity_type = 'task' then
    return exists (
      select 1 from public.project_tasks task
      where task.id = v_entity_id::uuid
        and public.workspace_row_scope('projects', to_jsonb(task))
    );
  end if;

  if v_entity_type = 'accounts_receivable' then
    return exists (
      select 1 from public.accounts_receivable receivable
      where receivable.id = v_entity_id::uuid
        and public.workspace_row_scope('accounts_receivable', to_jsonb(receivable))
    );
  end if;

  if v_entity_type = 'accounts_payable' then
    return exists (
      select 1 from public.accounts_payable payable
      where payable.id = v_entity_id::uuid
        and public.workspace_row_scope('accounts_payable', to_jsonb(payable))
    );
  end if;

  return false;
end;
$function$;
