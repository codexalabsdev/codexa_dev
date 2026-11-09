set search_path = public, auth, pg_temp;

insert into public.access_permissions (id, module_name, action_name)
values (gen_random_uuid(), 'contracts', 'update')
on conflict (module_name, action_name) do nothing;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.access_roles roles
join public.access_permissions permissions
  on permissions.module_name = 'contracts'
  and permissions.action_name = 'update'
where roles.name = 'Comercial'
on conflict (role_id, permission_id) do nothing;
