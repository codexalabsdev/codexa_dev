set search_path = public, auth, pg_temp;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.access_roles roles
join public.access_permissions permissions
  on permissions.module_name = 'attachments'
  and permissions.action_name = 'download'
where roles.is_system
  and lower(btrim(roles.name)) in (
    'financeiro',
    'relacionamento',
    'consulta',
    'leitura e auditoria'
  )
on conflict (role_id, permission_id) do nothing;
