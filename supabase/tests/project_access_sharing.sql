begin;

do $$
declare
  v_rls_enabled boolean;
  v_has_created_by boolean;
  v_has_unique_membership boolean;
  v_has_access_functions boolean;
  v_has_soft_revocation boolean;
  v_has_task_sharing_functions boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'projects'
      and column_name = 'created_by'
      and udt_name = 'uuid'
  ) into v_has_created_by;
  if not v_has_created_by then
    raise exception 'projects.created_by UUID column is missing';
  end if;

  select c.relrowsecurity into v_rls_enabled
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'project_members';
  if v_rls_enabled is distinct from true then
    raise exception 'project_members row-level security is not enabled';
  end if;

  select exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'project_members_project_user_uidx'
  ) into v_has_unique_membership;
  if not v_has_unique_membership then
    raise exception 'unique project/user membership index is missing';
  end if;

  select count(*) = 2 into v_has_soft_revocation
  from information_schema.columns
  where table_schema = 'public' and table_name = 'project_members'
    and column_name in ('is_active', 'revoked_at');
  if not v_has_soft_revocation then
    raise exception 'project membership soft-revocation columns are missing';
  end if;

  select count(*) = 3 into v_has_access_functions
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('project_access_level', 'has_project_access', 'has_project_task_access')
    and p.prosecdef;
  if not v_has_access_functions then
    raise exception 'security-definer project access functions are missing';
  end if;

  select count(*) = 3 into v_has_task_sharing_functions
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'create_task_transfer_request',
      'respond_task_transfer_request',
      'admin_assign_workspace_task'
    )
    and p.prosecdef;
  if not v_has_task_sharing_functions then
    raise exception 'secure task-sharing functions are missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'projects'
      and policyname = 'project_access_select_restrict'
      and permissive = 'RESTRICTIVE'
  ) then
    raise exception 'restrictive project visibility policy is missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'project_tasks'
      and policyname = 'project_task_access_select_restrict'
      and permissive = 'RESTRICTIVE'
  ) then
    raise exception 'restrictive task visibility policy is missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'entity_attachments'
      and policyname = 'rbac_select_restrict'
      and permissive = 'RESTRICTIVE'
  ) then
    raise exception 'restrictive attachment visibility policy is missing';
  end if;
end;
$$;

rollback;

-- Run authenticated-user integration scenarios in a Supabase test project:
-- 1. User A creates a project; verify created_by = auth.uid() and A resolves as manager.
-- 2. User B without membership cannot select the project, tasks, activity, comments, or attachments.
-- 3. Add B as viewer; B can read project/tasks but cannot insert/update project data.
-- 4. Change B to collaborator; B can update an authorized task but cannot manage members or project fields.
-- 5. Change B to manager; B can edit the project and manage memberships when projects:share is granted.
-- 6. Remove B's membership; repeat all reads and Storage downloads and verify access is denied.
-- 7. Confirm an administrator retains access throughout all scenarios.