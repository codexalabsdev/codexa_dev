create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.project_tasks (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index task_comments_task_created_idx
  on public.task_comments (task_id, created_at);

create or replace function public.set_collaboration_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger task_comments_set_updated_at
  before update on public.task_comments
  for each row execute function public.set_collaboration_updated_at();

alter table public.task_comments enable row level security;
grant select, insert, update, delete on public.task_comments to authenticated;

create policy "Project members can view task comments"
  on public.task_comments for select to authenticated
  using (
    exists (
      select 1
      from public.project_tasks task
      where task.id = task_id
    )
  );

create policy "Project members can comment on visible tasks"
  on public.task_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.project_tasks task
      where task.id = task_id
    )
  );

create policy "Authors can edit their task comments"
  on public.task_comments for update to authenticated
  using (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.project_tasks task
      where task.id = task_id
    )
  )
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.project_tasks task
      where task.id = task_id
    )
  );

create policy "Authors can delete their task comments"
  on public.task_comments for delete to authenticated
  using (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.project_tasks task
      where task.id = task_id
    )
  );

create table public.project_activity (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  task_id uuid references public.project_tasks (id) on delete set null,
  actor_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index project_activity_project_created_idx
  on public.project_activity (project_id, created_at desc);

alter table public.project_activity enable row level security;
grant select on public.project_activity to authenticated;

create policy "Project members can view project activity"
  on public.project_activity for select to authenticated
  using (
    exists (
      select 1
      from public.projects project
      where project.id = project_id
    )
  );

create or replace function public.append_project_activity(
  p_project_id uuid,
  p_task_id uuid,
  p_actor_id uuid,
  p_event_type text,
  p_summary text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.project_activity (
    project_id, task_id, actor_id, event_type, summary, metadata
  ) values (
    p_project_id, p_task_id, p_actor_id, p_event_type, p_summary,
    coalesce(p_metadata, '{}'::jsonb)
  );
$$;

revoke all on function public.append_project_activity(uuid, uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;

create or replace function public.log_project_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform public.append_project_activity(
      new.id, null, auth.uid(), 'project.created', 'Projeto criado',
      jsonb_build_object('name', new.name, 'status', new.status)
    );
    return new;
  end if;

  if old.name is distinct from new.name
    or old.description is distinct from new.description
    or old.status is distinct from new.status
    or old.priority is distinct from new.priority
    or old.due_date is distinct from new.due_date
    or old.responsible_id is distinct from new.responsible_id
    or old.client_id is distinct from new.client_id then
    perform public.append_project_activity(
      new.id, null, auth.uid(), 'project.updated', 'Projeto atualizado',
      jsonb_build_object(
        'name_changed', old.name is distinct from new.name,
        'status_changed', old.status is distinct from new.status,
        'priority_changed', old.priority is distinct from new.priority,
        'due_date_changed', old.due_date is distinct from new.due_date,
        'responsible_changed', old.responsible_id is distinct from new.responsible_id,
        'client_changed', old.client_id is distinct from new.client_id
      )
    );
  end if;
  return new;
end;
$$;

create trigger projects_activity_after_write
  after insert or update on public.projects
  for each row execute function public.log_project_activity();

create or replace function public.log_project_task_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform public.append_project_activity(
      new.project_id, new.id, auth.uid(), 'task.created', 'Tarefa criada',
      jsonb_build_object('title', new.title, 'status', new.status)
    );
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.append_project_activity(
      old.project_id, null, auth.uid(), 'task.deleted', 'Tarefa removida',
      jsonb_build_object('title', old.title)
    );
    return old;
  end if;

  if old.status is distinct from new.status then
    perform public.append_project_activity(
      new.project_id, new.id, auth.uid(), 'task.status_changed',
      'Tarefa movida para ' || new.status,
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;
  if old.responsible_id is distinct from new.responsible_id then
    perform public.append_project_activity(
      new.project_id, new.id, auth.uid(), 'task.responsible_changed',
      'Responsável da tarefa alterado',
      jsonb_build_object('from', old.responsible_id, 'to', new.responsible_id)
    );
  end if;
  if old.priority is distinct from new.priority then
    perform public.append_project_activity(
      new.project_id, new.id, auth.uid(), 'task.priority_changed',
      'Prioridade da tarefa alterada',
      jsonb_build_object('from', old.priority, 'to', new.priority)
    );
  end if;
  if old.due_date is distinct from new.due_date then
    perform public.append_project_activity(
      new.project_id, new.id, auth.uid(), 'task.due_date_changed',
      'Prazo da tarefa alterado',
      jsonb_build_object('from', old.due_date, 'to', new.due_date)
    );
  end if;
  if old.title is distinct from new.title
    or old.description is distinct from new.description then
    perform public.append_project_activity(
      new.project_id, new.id, auth.uid(), 'task.updated', 'Tarefa editada',
      jsonb_build_object('title_changed', old.title is distinct from new.title)
    );
  end if;
  return new;
end;
$$;

create trigger project_tasks_activity_after_write
  after insert or update or delete on public.project_tasks
  for each row execute function public.log_project_task_activity();

create trigger project_tasks_set_updated_at
  before update on public.project_tasks
  for each row execute function public.set_collaboration_updated_at();

create or replace function public.log_task_comment_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task_id uuid;
  v_project_id uuid;
  v_comment_id uuid;
begin
  if tg_op = 'DELETE' then
    v_task_id := old.task_id;
    v_comment_id := old.id;
  else
    v_task_id := new.task_id;
    v_comment_id := new.id;
  end if;

  select task.project_id into v_project_id
  from public.project_tasks task
  where task.id = v_task_id;

  if v_project_id is not null then
    perform public.append_project_activity(
      v_project_id, v_task_id, auth.uid(),
      case tg_op
        when 'INSERT' then 'comment.created'
        when 'UPDATE' then 'comment.updated'
        else 'comment.deleted'
      end,
      case tg_op
        when 'INSERT' then 'Comentário publicado'
        when 'UPDATE' then 'Comentário editado'
        else 'Comentário removido'
      end,
      jsonb_build_object('comment_id', v_comment_id)
    );
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger task_comments_activity_after_write
  after insert or update or delete on public.task_comments
  for each row execute function public.log_task_comment_activity();

create or replace function public.log_entity_attachment_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entity_type text;
  v_entity_id text;
  v_file_name text;
  v_actor_id uuid;
  v_project_id uuid;
  v_task_id uuid;
begin
  if tg_op = 'DELETE' then
    v_entity_type := old.entity_type;
    v_entity_id := old.entity_id::text;
    v_file_name := old.file_name;
    v_actor_id := auth.uid();
  else
    v_entity_type := new.entity_type;
    v_entity_id := new.entity_id::text;
    v_file_name := new.file_name;
    v_actor_id := coalesce(auth.uid(), new.uploaded_by);
  end if;

  if v_entity_type = 'project' then
    v_project_id := v_entity_id::uuid;
  elsif v_entity_type = 'task' then
    v_task_id := v_entity_id::uuid;
    select task.project_id into v_project_id
    from public.project_tasks task
    where task.id = v_task_id;
  else
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if v_project_id is not null then
    perform public.append_project_activity(
      v_project_id, v_task_id, v_actor_id,
      case tg_op when 'DELETE' then 'file.deleted' else 'file.uploaded' end,
      case tg_op when 'DELETE' then 'Arquivo removido' else 'Arquivo anexado' end,
      jsonb_build_object('file_name', v_file_name)
    );
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger entity_attachments_project_activity_after_write
  after insert or delete on public.entity_attachments
  for each row execute function public.log_entity_attachment_activity();
