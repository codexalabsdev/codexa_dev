-- Garante a permissão de exclusão no módulo Financeiro.
-- Execute este script no Supabase SQL Editor.
-- A permissão passa a aparecer na matriz de cargos e nas exceções individuais.

insert into public.access_permissions (id, module_name, action_name, is_active)
values (gen_random_uuid(), 'finance', 'delete', true)
on conflict (module_name, action_name) do update
set is_active = true;

-- O cargo Financeiro recebe as permissões do módulo Financeiro.
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.access_roles role
cross join public.access_permissions permission
where lower(role.name) = 'financeiro'
  and permission.module_name = 'finance'
  and permission.is_active
on conflict (role_id, permission_id) do nothing;

-- O administrador continua com acesso integral, independentemente da matriz.
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.access_roles role
cross join public.access_permissions permission
where lower(role.name) = 'admin'
  and permission.is_active
on conflict (role_id, permission_id) do nothing;
