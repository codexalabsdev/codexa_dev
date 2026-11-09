-- Testes de regressão para a migration
-- 20261023140000_fix_project_activity_delete.sql.
-- Executar manualmente em um ambiente de teste após aplicar a migration.

begin;

-- O modelo precisa aceitar o histórico sem projeto e usar ON DELETE SET NULL.
do $$
declare
  v_nullable text;
  v_delete_rule text;
begin
  select c.is_nullable into v_nullable
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'project_activity'
    and c.column_name = 'project_id';

  if v_nullable <> 'YES' then
    raise exception 'project_activity.project_id ainda é NOT NULL';
  end if;

  select rc.delete_rule into v_delete_rule
  from information_schema.referential_constraints rc
  join information_schema.table_constraints tc
    on tc.constraint_schema = rc.constraint_schema
   and tc.constraint_name = rc.constraint_name
  where tc.constraint_schema = 'public'
    and tc.table_name = 'project_activity'
    and tc.constraint_name = 'project_activity_project_id_fkey';

  if v_delete_rule <> 'SET NULL' then
    raise exception 'FK project_activity_project_id_fkey usa % em vez de SET NULL', v_delete_rule;
  end if;
end;
$$;

-- Confirma que a trigger de projeto cobre DELETE e que a função evita
-- referências inválidas durante cascatas.
do $$
declare
  v_trigger_event text;
  v_function_source text;
begin
  select pg_get_triggerdef(t.oid) into v_trigger_event
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'projects'
    and t.tgname = 'projects_activity_after_write'
    and not t.tgisinternal;

  if v_trigger_event is null or v_trigger_event not ilike '%delete%' then
    raise exception 'trigger projects_activity_after_write não cobre DELETE';
  end if;

  select pg_get_functiondef(p.oid) into v_function_source
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'append_project_activity'
    and pg_get_function_identity_arguments(p.oid) = 'p_project_id uuid, p_task_id uuid, p_actor_id uuid, p_event_type text, p_summary text, p_metadata jsonb';

  if v_function_source is null
     or v_function_source not ilike '%not exists%public.projects%' then
    raise exception 'append_project_activity não possui a proteção contra projeto ausente';
  end if;
end;
$$;

rollback;

-- Teste funcional recomendado em ambiente de teste:
-- 1. Criar um projeto com uma tarefa e confirmar project.created/task.created.
-- 2. Excluir o projeto pela conta administradora.
-- 3. Confirmar que a exclusão retorna sucesso, não há FK violation,
--    project_activity.project_id ficou NULL nos eventos preservados e existe
--    um evento project.deleted com metadata.project_id igual ao projeto excluído.
