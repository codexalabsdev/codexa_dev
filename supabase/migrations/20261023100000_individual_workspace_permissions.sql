-- Aplicar depois de 20261022120000_workspace_rbac.sql.
-- Esta migration NÃO é executada pela aplicação; revise e aplique manualmente.
set search_path = public, auth, pg_temp;

create table if not exists public.workspace_member_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.team_members(id) on delete cascade,
  permission_id uuid not null references public.access_permissions(id) on delete cascade,
  effect text not null check (effect in ('allow', 'deny')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, permission_id)
);

create index if not exists workspace_member_permission_overrides_member_idx
  on public.workspace_member_permission_overrides(member_id);

alter table public.workspace_member_permission_overrides enable row level security;

-- A escrita é feita somente pelas funções abaixo, após validar o cargo do ator.
revoke all on public.workspace_member_permission_overrides from anon, authenticated;
grant select on public.workspace_member_permission_overrides to authenticated;

drop function if exists public.effective_workspace_permission(uuid, text, text);
create or replace function public.effective_workspace_permission(p_member_id uuid, p_module text, p_action text)
returns boolean language sql stable security definer set search_path = public, auth, pg_temp as $$
  select exists (
    select 1 from public.team_members member
    where member.id = p_member_id
      and lower(trim(both '"' from trim(both '''' from btrim(member.status)))) in ('active','ativo','enabled','habilitado')
      and (lower(btrim(member.role_name)) = 'admin' or exists (
        select 1 from public.access_roles role
        join public.role_permissions rp on rp.role_id = role.id
        join public.access_permissions permission on permission.id = rp.permission_id
        where lower(btrim(role.name)) = lower(btrim(member.role_name)) and role.is_active
          and permission.module_name = p_module and permission.action_name = p_action
      ))
      and coalesce((select o.effect = 'allow' from public.workspace_member_permission_overrides o
        join public.access_permissions p on p.id = o.permission_id
        where o.member_id = member.id and p.module_name = p_module and p.action_name = p_action),
        lower(btrim(member.role_name)) = 'admin' or exists (
          select 1 from public.role_permissions rp join public.access_roles role on role.id = rp.role_id
          join public.access_permissions p on p.id = rp.permission_id
          where lower(btrim(role.name)) = lower(btrim(member.role_name)) and role.is_active
            and p.module_name = p_module and p.action_name = p_action
        ))
  );
$$;

create or replace function public.has_workspace_permission(p_module text, p_action text)
returns boolean language sql stable security definer set search_path = public, auth, pg_temp as $$
  select public.effective_workspace_permission((select id from public.team_members where user_id = (select auth.uid()) limit 1), p_module, p_action);
$$;

create or replace function public.save_workspace_member_permission_override(p_actor_id uuid, p_member_id uuid, p_module text, p_action text, p_effect text)
returns jsonb language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v_permission uuid; v_actor uuid; begin
  if p_actor_id is distinct from (select auth.uid()) then raise exception 'not authorized' using errcode='42501'; end if;
  if not public.has_workspace_permission('roles','manage_roles') then raise exception 'not authorized' using errcode='42501'; end if;
  select id into v_permission from public.access_permissions where module_name=p_module and action_name=p_action;
  if v_permission is null or p_effect not in ('inherit','allow','deny') then raise exception 'invalid permission' using errcode='22023'; end if;
  if p_effect = 'inherit' then delete from public.workspace_member_permission_overrides where member_id=p_member_id and permission_id=v_permission;
  else insert into public.workspace_member_permission_overrides(member_id,permission_id,effect) values(p_member_id,v_permission,p_effect)
    on conflict(member_id,permission_id) do update set effect=excluded.effect, updated_at=now(); end if;
  return jsonb_build_object('member_id',p_member_id,'module_name',p_module,'action_name',p_action,'effect',p_effect);
end; $$;

-- A função é o único caminho de escrita e só administradores de permissões podem chamá-la.
revoke all on function public.save_workspace_member_permission_override(uuid,uuid,text,text,text) from public;
grant execute on function public.save_workspace_member_permission_override(uuid,uuid,text,text,text) to authenticated;
