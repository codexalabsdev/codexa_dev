-- Reforça o modelo de permissões sem remover dados legados.
-- Aplicar depois das migrations de RBAC e exceções individuais.

set search_path = public, auth, pg_temp;

-- Evita registros órfãos e mantém uma única exceção por usuário/permissão.
create unique index if not exists workspace_member_permission_overrides_member_permission_uidx
  on public.workspace_member_permission_overrides (member_id, permission_id);

-- Normaliza consultas de autorização para evitar divergência por espaços ou caixa.
create index if not exists access_permissions_module_action_lookup_idx
  on public.access_permissions (lower(module_name), lower(action_name));

-- A função central deve aplicar sempre a exceção individual antes da herança do cargo:
-- allow concede, deny bloqueia e a ausência de exceção herda do cargo.
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
            select override.effect = 'allow'
            from public.workspace_member_permission_overrides override
            join public.access_permissions permission
              on permission.id = override.permission_id
            where override.member_id = member.id
              and lower(btrim(permission.module_name)) = lower(btrim(p_module))
              and lower(btrim(permission.action_name)) = lower(btrim(p_action))
            limit 1
          ),
          exists (
            select 1
            from public.access_roles role
            join public.role_permissions role_permission
              on role_permission.role_id = role.id
            join public.access_permissions permission
              on permission.id = role_permission.permission_id
            where lower(btrim(role.name)) = lower(btrim(member.role_name))
              and role.is_active
              and lower(btrim(permission.module_name)) = lower(btrim(p_module))
              and lower(btrim(permission.action_name)) = lower(btrim(p_action))
          )
        )
      )
  );
$$;

-- Garante que apenas usuários autenticados consultem a função central.
revoke all on function public.effective_workspace_permission(uuid, text, text) from public;
grant execute on function public.effective_workspace_permission(uuid, text, text) to authenticated;

-- A tabela continua sem escrita direta pelo cliente; alterações passam pela RPC validada.
revoke all on public.workspace_member_permission_overrides from anon, authenticated;
grant select on public.workspace_member_permission_overrides to authenticated;

-- Atualiza a RPC de gravação para validar o alvo e impedir autoelevação.
create or replace function public.save_workspace_member_permission_override(
  p_actor_id uuid,
  p_member_id uuid,
  p_module text,
  p_action text,
  p_effect text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_permission_id uuid;
  v_actor_member_id uuid;
  v_actor_role text;
begin
  if p_actor_id is distinct from (select auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select member.id, member.role_name
    into v_actor_member_id, v_actor_role
  from public.team_members member
  where member.user_id = (select auth.uid())
    and lower(trim(both '"' from trim(both '''' from btrim(coalesce(member.status, '')))))
      in ('active', 'ativo', 'enabled', 'habilitado')
  limit 1;

  if v_actor_member_id is null
    or not public.has_workspace_permission('roles', 'manage_roles') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_member_id = v_actor_member_id then
    raise exception 'cannot edit own permissions' using errcode = '42501';
  end if;

  if not exists (select 1 from public.team_members where id = p_member_id) then
    raise exception 'member not found' using errcode = '22023';
  end if;

  select permission.id
    into v_permission_id
  from public.access_permissions permission
  where lower(btrim(permission.module_name)) = lower(btrim(p_module))
    and lower(btrim(permission.action_name)) = lower(btrim(p_action))
  limit 1;

  if v_permission_id is null or p_effect not in ('inherit', 'allow', 'deny') then
    raise exception 'invalid permission' using errcode = '22023';
  end if;

  if p_effect = 'allow'
    and lower(btrim(coalesce(v_actor_role, ''))) <> 'admin'
    and not public.has_workspace_permission(p_module, p_action) then
    raise exception 'cannot grant permission actor does not have' using errcode = '42501';
  end if;

  if p_effect = 'inherit' then
    delete from public.workspace_member_permission_overrides
    where member_id = p_member_id
      and permission_id = v_permission_id;
  else
    insert into public.workspace_member_permission_overrides (member_id, permission_id, effect)
    values (p_member_id, v_permission_id, p_effect)
    on conflict (member_id, permission_id)
    do update set effect = excluded.effect, updated_at = now();
  end if;

  return jsonb_build_object(
    'member_id', p_member_id,
    'module_name', p_module,
    'action_name', p_action,
    'effect', p_effect
  );
end;
$$;

revoke all on function public.save_workspace_member_permission_override(uuid, uuid, text, text, text) from public;
grant execute on function public.save_workspace_member_permission_override(uuid, uuid, text, text, text) to authenticated;
