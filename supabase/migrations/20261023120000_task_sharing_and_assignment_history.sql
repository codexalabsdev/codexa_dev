set search_path = public, auth, pg_temp;

create unique index if not exists task_transfer_requests_pending_unique
  on public.task_transfer_requests(task_id, target_id, request_type)
  where status = 'pending';

create or replace function public.is_workspace_admin(p_user uuid)
returns boolean language sql stable security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1 from public.team_members
    where user_id = p_user
      and lower(trim(role_name)) like '%admin%'
      and lower(trim(status)) in ('ativo', 'active', 'enabled', 'habilitado')
  );
$$;

revoke all on function public.is_workspace_admin(uuid) from public, anon;
grant execute on function public.is_workspace_admin(uuid) to authenticated;

create table if not exists public.task_assignment_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  request_id uuid references public.task_transfer_requests(id) on delete set null,
  actor_id uuid not null references auth.users(id) on delete cascade,
  from_responsible_id uuid references auth.users(id) on delete set null,
  to_responsible_id uuid references auth.users(id) on delete set null,
  action_type text not null check (action_type in ('share', 'transfer', 'admin_share', 'admin_transfer')),
  created_at timestamptz not null default now()
);

alter table public.task_assignment_history enable row level security;
revoke all on public.task_assignment_history from public, anon, authenticated;
grant select on public.task_assignment_history to authenticated;
create policy task_assignment_history_participants on public.task_assignment_history
  for select to authenticated
  using (
    actor_id = auth.uid()
    or exists (
      select 1 from public.project_tasks task
      where task.id = task_id
        and (task.responsible_id = auth.uid() or task.participants ? auth.uid()::text)
    )
    or public.is_workspace_admin(auth.uid())
  );

create policy project_tasks_shared_select on public.project_tasks
  for select to authenticated
  using (has_workspace_permission('projects', 'view') and participants ? (select auth.uid()::text));

create policy project_task_shared_attachments_select on public.entity_attachments
  for select to authenticated
  using (
    entity_type = 'task'
    and exists (
      select 1 from public.project_tasks task
      where task.id = entity_attachments.entity_id
        and task.participants ? (select auth.uid()::text)
    )
  );

create policy project_task_shared_attachments_insert on public.entity_attachments
  for insert to authenticated
  with check (
    entity_type = 'task'
    and has_workspace_permission('attachments', 'upload')
    and exists (
      select 1 from public.project_tasks task
      where task.id = entity_attachments.entity_id
        and task.participants ? (select auth.uid()::text)
    )
  );
