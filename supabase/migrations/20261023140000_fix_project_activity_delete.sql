-- Corrige a exclusão de projetos e preserva o histórico de atividades.
-- Aplicar manualmente após revisar. Esta migration não é executada pela aplicação.

alter table public.project_activity
  alter column project_id drop not null;

alter table public.project_activity
  drop constraint if exists project_activity_project_id_fkey;

alter table public.project_activity
  add constraint project_activity_project_id_fkey
  foreign key (project_id)
  references public.projects (id)
  on delete set null;

create or replace function public.append_project_activity(
  p_project_id uuid,
  p_task_id uuid,
  p_actor_id uuid,
  p_event_type text,
  p_summary text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Cascades de uma exclusão podem disparar triggers dos filhos depois que
  -- o projeto deixa de estar visível. Não grave uma referência órfã.
  if p_project_id is not null
    and not exists (
      select 1 from public.projects as project where project.id = p_project_id
    ) then
    return;
  end if;

  insert into public.project_activity (
    project_id, task_id, actor_id, event_type, summary, metadata
  ) values (
    p_project_id, p_task_id, p_actor_id, p_event_type, p_summary,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.append_project_activity(uuid, uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;

create or replace function public.log_project_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.append_project_activity(
      null, null, auth.uid(), 'project.deleted', 'Projeto excluído',
      jsonb_build_object('project_id', old.id, 'name', old.name)
    );
    return old;
  end if;

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

drop trigger if exists projects_activity_after_write on public.projects;
create trigger projects_activity_after_write
after insert or update or delete on public.projects
for each row execute function public.log_project_activity();

-- Permite ao autor consultar o evento de exclusão que ficou sem project_id.
drop policy if exists "Project members can view project activity" on public.project_activity;
create policy "Project members can view project activity"
  on public.project_activity for select to authenticated
  using (
    (project_id is null and actor_id = (select auth.uid()))
    or exists (
      select 1
      from public.projects as project
      where project.id = project_id
    )
  );
