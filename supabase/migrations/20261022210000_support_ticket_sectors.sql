alter table public.support_tickets
  add column if not exists sector text;

update public.support_tickets
set sector = 'Suporte Técnico'
where sector is null;

alter table public.support_tickets
  alter column sector set not null;

alter table public.support_tickets
  add constraint support_tickets_sector_check
  check (sector in ('Suporte Técnico', 'Financeiro', 'Comercial', 'Operações'));

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.access_roles roles
cross join public.access_permissions permissions
where lower(btrim(roles.name)) in ('financeiro', 'comercial', 'operacional')
  and permissions.module_name = 'support'
  and permissions.action_name in ('view', 'update')
on conflict (role_id, permission_id) do nothing;

create or replace function public.assign_support_ticket_responsible(p_sector text)
returns uuid
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_role_name text;
  v_responsible_id uuid;
begin
  v_role_name := case p_sector
    when 'Suporte Técnico' then 'suporte'
    when 'Financeiro' then 'financeiro'
    when 'Comercial' then 'comercial'
    when 'Operações' then 'operacional'
    else null
  end;

  if v_role_name is null then
    raise exception 'Setor do chamado inválido.' using errcode = '23514';
  end if;

  select member.id
  into v_responsible_id
  from public.team_members member
  left join lateral (
    select count(*) as active_ticket_count
    from public.support_tickets ticket
    where ticket.technical_responsible_id = member.id
      and lower(btrim(ticket.status)) not in ('resolvido', 'fechado')
  ) workload on true
  where lower(btrim(member.role_name)) = v_role_name
    and lower(trim(both '"' from trim(both '''' from btrim(member.status)))) in ('active', 'ativo', 'enabled', 'habilitado')
  order by workload.active_ticket_count, member.id
  limit 1;

  if v_responsible_id is null then
    raise exception 'Não há responsável ativo no setor %.', p_sector using errcode = '23514';
  end if;

  return v_responsible_id;
end;
$$;

create or replace function public.route_support_ticket()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_assignee_role text;
  v_assignee_active boolean;
begin
  if tg_op = 'INSERT' then
    new.technical_responsible_id := public.assign_support_ticket_responsible(new.sector);
    return new;
  end if;

  if new.sector is distinct from old.sector then
    if not public.has_workspace_permission('support', 'assign') then
      raise exception 'Permissão para alterar o setor do chamado necessária.' using errcode = '42501';
    end if;
    new.technical_responsible_id := public.assign_support_ticket_responsible(new.sector);
  elsif new.technical_responsible_id is distinct from old.technical_responsible_id then
    if not public.has_workspace_permission('support', 'assign') then
      raise exception 'Permissão para reatribuir o chamado necessária.' using errcode = '42501';
    end if;

    if new.technical_responsible_id is null then
      new.technical_responsible_id := public.assign_support_ticket_responsible(new.sector);
    else
      select lower(btrim(member.role_name)),
             lower(trim(both '"' from trim(both '''' from btrim(member.status)))) in ('active', 'ativo', 'enabled', 'habilitado')
      into v_assignee_role, v_assignee_active
      from public.team_members member
      where member.id = new.technical_responsible_id;

      if not coalesce(v_assignee_active, false) or v_assignee_role is distinct from (case new.sector
        when 'Suporte Técnico' then 'suporte'
        when 'Financeiro' then 'financeiro'
        when 'Comercial' then 'comercial'
        when 'Operações' then 'operacional'
        else null
      end) then
        raise exception 'O responsável deve ser membro ativo do setor selecionado.' using errcode = '23514';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists support_ticket_sector_routing on public.support_tickets;
create trigger support_ticket_sector_routing
  before insert or update on public.support_tickets
  for each row execute function public.route_support_ticket();

create or replace function public.workspace_support_ticket_scope(p_row jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_member_id uuid;
  v_role_name text;
  v_sector text := p_row->>'sector';
  v_assignee_id uuid := nullif(p_row->>'technical_responsible_id', '')::uuid;
begin
  if v_user_id is null or not public.has_workspace_permission('support', 'view') then
    return false;
  end if;

  select member.id, lower(btrim(member.role_name))
  into v_member_id, v_role_name
  from public.team_members member
  where member.user_id = v_user_id
    and lower(trim(both '"' from trim(both '''' from btrim(member.status)))) in ('active', 'ativo', 'enabled', 'habilitado')
  limit 1;

  if v_role_name = 'admin' or v_role_name in ('suporte', 'consulta', 'leitura e auditoria') then
    return true;
  end if;

  if v_assignee_id in (v_user_id, v_member_id) then
    return true;
  end if;

  return case v_sector
    when 'Financeiro' then v_role_name = 'financeiro'
    when 'Comercial' then v_role_name = 'comercial'
    when 'Operações' then v_role_name = 'operacional'
    else false
  end;
end;
$$;

create or replace function public.audit_support_ticket_routing()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    insert into public.admin_audit_events (
      actor_id, action_name, entity_type, entity_id, previous_data, new_data, result
    ) values (
      auth.uid(),
      'support_ticket.created',
      'support_ticket',
      new.id,
      null,
      jsonb_build_object(
        'sector', new.sector,
        'category', new.category,
        'technical_responsible_id', new.technical_responsible_id
      ),
      'success'
    );
  elsif new.sector is distinct from old.sector
    or new.technical_responsible_id is distinct from old.technical_responsible_id then
    insert into public.admin_audit_events (
      actor_id, action_name, entity_type, entity_id, previous_data, new_data, result
    ) values (
      auth.uid(),
      case when new.sector is distinct from old.sector
        then 'support_ticket.sector_changed'
        when new.category is distinct from old.category
          then 'support_ticket.category_changed'
        else 'support_ticket.assigned'
      end,
      'support_ticket',
      new.id,
      jsonb_build_object(
        'sector', old.sector,
        'technical_responsible_id', old.technical_responsible_id
      ),
      jsonb_build_object(
        'sector', new.sector,
        'technical_responsible_id', new.technical_responsible_id
      ),
      'success'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists support_ticket_routing_audit on public.support_tickets;
create trigger support_ticket_routing_audit
  after insert or update on public.support_tickets
  for each row execute function public.audit_support_ticket_routing();

drop policy if exists rbac_select on public.support_tickets;
create policy rbac_select on public.support_tickets
  as permissive for select to authenticated
  using (public.has_workspace_permission('support', 'view') and public.workspace_support_ticket_scope(to_jsonb(support_tickets)));
drop policy if exists rbac_select_restrict on public.support_tickets;
create policy rbac_select_restrict on public.support_tickets
  as restrictive for select to authenticated
  using (public.has_workspace_permission('support', 'view') and public.workspace_support_ticket_scope(to_jsonb(support_tickets)));

drop policy if exists rbac_insert on public.support_tickets;
create policy rbac_insert on public.support_tickets
  as permissive for insert to authenticated
  with check (public.has_workspace_permission('support', 'create'));
drop policy if exists rbac_insert_restrict on public.support_tickets;
create policy rbac_insert_restrict on public.support_tickets
  as restrictive for insert to authenticated
  with check (public.has_workspace_permission('support', 'create'));

drop policy if exists rbac_update on public.support_tickets;
create policy rbac_update on public.support_tickets
  as permissive for update to authenticated
  using (
    public.has_workspace_permission('support', 'view')
    and public.has_workspace_permission('support', 'update')
    and public.workspace_support_ticket_scope(to_jsonb(support_tickets))
  )
  with check (
    public.has_workspace_permission('support', 'update')
    and public.workspace_support_ticket_scope(to_jsonb(support_tickets))
  );
drop policy if exists rbac_update_restrict on public.support_tickets;
create policy rbac_update_restrict on public.support_tickets
  as restrictive for update to authenticated
  using (
    public.has_workspace_permission('support', 'view')
    and public.has_workspace_permission('support', 'update')
    and public.workspace_support_ticket_scope(to_jsonb(support_tickets))
  )
  with check (
    public.has_workspace_permission('support', 'update')
    and public.workspace_support_ticket_scope(to_jsonb(support_tickets))
  );

drop policy if exists rbac_delete on public.support_tickets;
create policy rbac_delete on public.support_tickets
  as permissive for delete to authenticated
  using (
    public.has_workspace_permission('support', 'delete')
    and public.workspace_support_ticket_scope(to_jsonb(support_tickets))
  );
drop policy if exists rbac_delete_restrict on public.support_tickets;
create policy rbac_delete_restrict on public.support_tickets
  as restrictive for delete to authenticated
  using (
    public.has_workspace_permission('support', 'delete')
    and public.workspace_support_ticket_scope(to_jsonb(support_tickets))
  );

revoke all on function public.assign_support_ticket_responsible(text) from public, anon, authenticated;
grant execute on function public.assign_support_ticket_responsible(text) to service_role;
revoke all on function public.workspace_support_ticket_scope(jsonb) from public, anon;
grant execute on function public.workspace_support_ticket_scope(jsonb) to authenticated, service_role;
revoke all on function public.route_support_ticket() from public, anon, authenticated;
revoke all on function public.audit_support_ticket_routing() from public, anon, authenticated;
