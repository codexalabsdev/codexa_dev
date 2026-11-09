create table if not exists public.task_transfer_requests (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references auth.users(id) on delete cascade,
  request_type text not null check (request_type in ('share', 'transfer')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

alter table public.task_transfer_requests enable row level security;
revoke all on public.task_transfer_requests from anon, authenticated;
grant select on public.task_transfer_requests to authenticated;

create unique index if not exists task_transfer_requests_pending_unique
  on public.task_transfer_requests (task_id, target_id, request_type)
  where status = 'pending';

drop policy if exists task_transfer_requests_participant_read on public.task_transfer_requests;
drop policy if exists task_transfer_requests_participant_read_restrict on public.task_transfer_requests;
create policy task_transfer_requests_participant_read
  on public.task_transfer_requests for select to authenticated
  using (
    requester_id = (select auth.uid())
    or target_id = (select auth.uid())
    or public.is_workspace_admin((select auth.uid()))
  );
create policy task_transfer_requests_participant_read_restrict
  on public.task_transfer_requests as restrictive for select to authenticated
  using (
    requester_id = (select auth.uid())
    or target_id = (select auth.uid())
    or public.is_workspace_admin((select auth.uid()))
  );

drop function if exists public.create_task_transfer_request(uuid, uuid, text);
drop function if exists public.respond_task_transfer_request(uuid, text);
drop function if exists public.admin_assign_workspace_task(uuid, uuid, text);

create or replace function public.create_task_transfer_request(
  p_task_id uuid,
  p_target_id uuid,
  p_request_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_task public.project_tasks%rowtype;
  v_request public.task_transfer_requests%rowtype;
  v_target_status text;
begin
  if v_actor_id is null or p_target_id is null or p_target_id = v_actor_id
    or p_request_type is null or p_request_type not in ('share', 'transfer') then
    raise exception 'invalid task sharing request' using errcode = '22023';
  end if;
  if not public.has_workspace_permission('projects', 'view')
    or not public.has_workspace_permission('projects', 'update')
    or not public.has_project_task_access(p_task_id, 'collaborator') then
    raise exception 'not authorized to share this task' using errcode = '42501';
  end if;

  select member.status into v_target_status
  from public.team_members member
  where member.user_id = p_target_id
  limit 1;
  if lower(trim(both '"' from trim(both '''' from btrim(coalesce(v_target_status, '')))))
    not in ('active', 'ativo', 'enabled', 'habilitado') then
    raise exception 'target must be an active team member' using errcode = '22023';
  end if;

  select * into v_task from public.project_tasks task
  where task.id = p_task_id for update;
  if not found then raise exception 'task not found' using errcode = 'P0002'; end if;
  if v_task.project_id is not null and exists (
    select 1 from public.project_members member
    where member.project_id = v_task.project_id
      and member.user_id = p_target_id
      and not member.is_active
  ) then
    raise exception 'target project access was revoked' using errcode = '42501';
  end if;
  if v_task.responsible_id = p_target_id
    or coalesce(v_task.participants, '[]'::jsonb) ? p_target_id::text then
    raise exception 'target already has task access' using errcode = '23505';
  end if;

  insert into public.task_transfer_requests (task_id, requester_id, target_id, request_type)
  values (p_task_id, v_actor_id, p_target_id, p_request_type)
  returning * into v_request;

  insert into public.notifications (
    recipient_id, notification_type, message, entity_type, entity_id, link_path
  ) values (
    p_target_id,
    case p_request_type when 'share' then 'task_share_request' else 'task_transfer_request' end,
    case p_request_type when 'share' then 'Uma tarefa foi compartilhada com você.' else 'Uma tarefa foi transferida para você.' end,
    'task', p_task_id, '/workspace/projetos'
  );

  return jsonb_build_object('id', v_request.id, 'status', v_request.status);
exception
  when unique_violation then
    raise exception 'pending request already exists' using errcode = '23505';
end;
$$;

create or replace function public.respond_task_transfer_request(
  p_request_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_request public.task_transfer_requests%rowtype;
  v_task public.project_tasks%rowtype;
  v_membership_revoked boolean;
  v_participants jsonb;
begin
  if v_actor_id is null or p_status is null or p_status not in ('accepted', 'rejected') then
    raise exception 'invalid task sharing response' using errcode = '22023';
  end if;
  select * into v_request
  from public.task_transfer_requests request
  where request.id = p_request_id and request.target_id = v_actor_id
    and request.status = 'pending'
  for update;
  if not found then raise exception 'pending request not found' using errcode = 'P0002'; end if;

  if p_status = 'accepted' then
    select * into v_task from public.project_tasks task
    where task.id = v_request.task_id for update;
    if not found then raise exception 'task not found' using errcode = 'P0002'; end if;
    if not exists (
      select 1 from public.team_members member
      where member.user_id = v_actor_id
        and lower(trim(both '"' from trim(both '''' from btrim(coalesce(member.status, '')))))
          in ('active', 'ativo', 'enabled', 'habilitado')
    ) then
      raise exception 'target is no longer an active team member' using errcode = '42501';
    end if;
    if v_task.project_id is not null then
      select exists (
        select 1 from public.project_members member
        where member.project_id = v_task.project_id
          and member.user_id in (v_request.requester_id, v_request.target_id)
          and not member.is_active
      ) into v_membership_revoked;
      if v_membership_revoked then
        update public.task_transfer_requests
        set status = 'rejected', responded_at = now()
        where id = v_request.id;
        return jsonb_build_object('id', v_request.id, 'status', 'rejected');
      end if;
    end if;

    if v_request.request_type = 'transfer' then
      update public.project_tasks
      set responsible_id = v_request.target_id,
          received_from_user_id = v_request.requester_id,
          received_via = 'task_transfer'
      where id = v_task.id;
    else
      select coalesce(jsonb_agg(participant), '[]'::jsonb) into v_participants
      from (
        select distinct participant
        from jsonb_array_elements_text(coalesce(v_task.participants, '[]'::jsonb)) as current_participants(participant)
        union
        select v_request.target_id::text
      ) participant_rows;
      update public.project_tasks
      set participants = v_participants,
          received_from_user_id = v_request.requester_id,
          received_via = 'task_share'
      where id = v_task.id;
    end if;

    insert into public.task_assignment_history (
      task_id, request_id, actor_id, from_responsible_id, to_responsible_id, action_type
    ) values (
      v_task.id, v_request.id, v_actor_id, v_task.responsible_id,
      v_request.target_id,
      case v_request.request_type when 'share' then 'share' else 'transfer' end
    );
  end if;

  update public.task_transfer_requests
  set status = p_status, responded_at = now()
  where id = v_request.id
  returning * into v_request;

  insert into public.notifications (
    recipient_id, notification_type, message, entity_type, entity_id, link_path
  ) values (
    v_request.requester_id,
    'task_' || v_request.request_type || '_' || p_status,
    case p_status when 'accepted' then 'Sua solicitação de tarefa foi aceita.' else 'Sua solicitação de tarefa foi recusada.' end,
    'task', v_request.task_id, '/workspace/projetos'
  );

  return jsonb_build_object('id', v_request.id, 'status', v_request.status);
end;
$$;

create or replace function public.admin_assign_workspace_task(
  p_task_id uuid,
  p_target_id uuid,
  p_request_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_task public.project_tasks%rowtype;
  v_participants jsonb;
begin
  if v_actor_id is null or not public.is_workspace_admin(v_actor_id)
    or p_target_id is null or p_target_id = v_actor_id
    or p_request_type is null or p_request_type not in ('share', 'transfer') then
    raise exception 'administrator task assignment required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.team_members member
    where member.user_id = p_target_id
      and lower(trim(both '"' from trim(both '''' from btrim(coalesce(member.status, '')))))
        in ('active', 'ativo', 'enabled', 'habilitado')
  ) then
    raise exception 'target must be an active team member' using errcode = '22023';
  end if;
  select * into v_task from public.project_tasks task
  where task.id = p_task_id for update;
  if not found then raise exception 'task not found' using errcode = 'P0002'; end if;
  if v_task.project_id is not null and exists (
    select 1 from public.project_members member
    where member.project_id = v_task.project_id
      and member.user_id = p_target_id
      and not member.is_active
  ) then
    raise exception 'target project access was revoked' using errcode = '42501';
  end if;

  if p_request_type = 'transfer' then
    update public.project_tasks
    set responsible_id = p_target_id,
        received_from_user_id = v_actor_id,
        received_via = 'admin_transfer'
    where id = v_task.id;
  else
    select coalesce(jsonb_agg(participant), '[]'::jsonb) into v_participants
    from (
      select distinct participant
      from jsonb_array_elements_text(coalesce(v_task.participants, '[]'::jsonb)) as current_participants(participant)
      union
      select p_target_id::text
    ) participant_rows;
    update public.project_tasks
    set participants = v_participants,
        received_from_user_id = v_actor_id,
        received_via = 'admin_share'
    where id = v_task.id;
  end if;

  insert into public.task_assignment_history (
    task_id, actor_id, from_responsible_id, to_responsible_id, action_type
  ) values (
    v_task.id, v_actor_id, v_task.responsible_id, p_target_id,
    case p_request_type when 'share' then 'admin_share' else 'admin_transfer' end
  );
  insert into public.notifications (
    recipient_id, notification_type, message, entity_type, entity_id, link_path
  ) values (
    p_target_id,
    case p_request_type when 'share' then 'task_admin_share' else 'task_admin_transfer' end,
    case p_request_type when 'share' then 'Um administrador compartilhou uma tarefa com você.' else 'Um administrador transferiu uma tarefa para você.' end,
    'task', p_task_id, '/workspace/projetos'
  );
  return jsonb_build_object('task_id', p_task_id, 'target_id', p_target_id);
end;
$$;

create or replace function public.cancel_project_task_requests_on_revocation()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if old.is_active and not new.is_active then
    update public.task_transfer_requests request
    set status = 'rejected', responded_at = now()
    where request.status = 'pending'
      and (request.requester_id = old.user_id or request.target_id = old.user_id)
      and exists (
        select 1 from public.project_tasks task
        where task.id = request.task_id and task.project_id = old.project_id
      );
  end if;
  return new;
end;
$$;

drop trigger if exists project_members_cancel_task_requests on public.project_members;
create trigger project_members_cancel_task_requests
  after update of is_active on public.project_members
  for each row execute function public.cancel_project_task_requests_on_revocation();

create or replace function public.log_shared_task_participants()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if new.project_id is not null and old.participants is distinct from new.participants then
    perform public.append_project_activity(
      new.project_id, new.id, auth.uid(), 'task.participants_changed',
      'Participantes da tarefa alterados',
      jsonb_build_object('from', old.participants, 'to', new.participants)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists project_tasks_participants_activity on public.project_tasks;
create trigger project_tasks_participants_activity
  after update of participants on public.project_tasks
  for each row execute function public.log_shared_task_participants();

revoke all on function public.create_task_transfer_request(uuid, uuid, text) from public, anon;
revoke all on function public.respond_task_transfer_request(uuid, text) from public, anon;
revoke all on function public.admin_assign_workspace_task(uuid, uuid, text) from public, anon;
grant execute on function public.create_task_transfer_request(uuid, uuid, text) to authenticated;
grant execute on function public.respond_task_transfer_request(uuid, text) to authenticated;
grant execute on function public.admin_assign_workspace_task(uuid, uuid, text) to authenticated;