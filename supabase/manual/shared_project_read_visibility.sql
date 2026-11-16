-- Allow project participants to read only the client and team-member rows
-- needed to identify linked clients, project owners, and activity actors.
-- Requires the existing workspace RBAC and project-sharing functions/policies.
-- Apply manually after the corresponding project-sharing setup is installed.

begin;

grant select on public.clients, public.team_members, public.project_activity to authenticated;

-- Keep the existing client visibility rules and add narrowly scoped visibility
-- for clients linked to projects the current user can access.
drop policy if exists rbac_select on public.clients;
create policy rbac_select
  on public.clients as permissive for select to authenticated
  using (
    (
      public.has_workspace_permission('clients', 'view')
      and public.workspace_row_scope('clients', to_jsonb(clients))
    )
    or (
      public.has_workspace_permission('projects', 'view')
      and exists (
        select 1
        from public.projects project
        where project.client_id = clients.id
          and public.has_project_access(project.id, 'viewer')
      )
    )
  );

drop policy if exists rbac_select_restrict on public.clients;
create policy rbac_select_restrict
  on public.clients as restrictive for select to authenticated
  using (
    (
      public.has_workspace_permission('clients', 'view')
      and public.workspace_row_scope('clients', to_jsonb(clients))
    )
    or (
      public.has_workspace_permission('projects', 'view')
      and exists (
        select 1
        from public.projects project
        where project.client_id = clients.id
          and public.has_project_access(project.id, 'viewer')
      )
    )
  );

-- Keep the existing team directory scope and expose names only for members
-- responsible for, or recorded as actors on, projects the user can access.
drop policy if exists rbac_select on public.team_members;
create policy rbac_select
  on public.team_members as permissive for select to authenticated
  using (
    (
      public.has_workspace_permission('team', 'view')
      and public.workspace_row_scope('team', to_jsonb(team_members))
    )
    or (
      public.has_workspace_permission('projects', 'view')
      and (
        exists (
          select 1
          from public.projects project
          where project.responsible_id in (team_members.id, team_members.user_id)
            and public.has_project_access(project.id, 'viewer')
        )
        or exists (
          select 1
          from public.project_activity activity
          where activity.actor_id = team_members.user_id
            and public.has_project_access(activity.project_id, 'viewer')
        )
      )
    )
  );

drop policy if exists rbac_select_restrict on public.team_members;
create policy rbac_select_restrict
  on public.team_members as restrictive for select to authenticated
  using (
    (
      public.has_workspace_permission('team', 'view')
      and public.workspace_row_scope('team', to_jsonb(team_members))
    )
    or (
      public.has_workspace_permission('projects', 'view')
      and (
        exists (
          select 1
          from public.projects project
          where project.responsible_id in (team_members.id, team_members.user_id)
            and public.has_project_access(project.id, 'viewer')
        )
        or exists (
          select 1
          from public.project_activity activity
          where activity.actor_id = team_members.user_id
            and public.has_project_access(activity.project_id, 'viewer')
        )
      )
    )
  );

-- Ensure the history is readable by authorized project participants regardless
-- of who generated each event; this does not grant access to other projects.
drop policy if exists rbac_select on public.project_activity;
drop policy if exists rbac_select_restrict on public.project_activity;
drop policy if exists "Project members can view project activity" on public.project_activity;
drop policy if exists project_activity_access_select on public.project_activity;
drop policy if exists project_activity_access_select_restrict on public.project_activity;
create policy project_activity_access_select
  on public.project_activity as permissive for select to authenticated
  using (
    public.has_workspace_permission('projects', 'view')
    and public.has_project_access(project_id, 'viewer')
  );
create policy project_activity_access_select_restrict
  on public.project_activity as restrictive for select to authenticated
  using (
    public.has_workspace_permission('projects', 'view')
    and public.has_project_access(project_id, 'viewer')
  );

commit;
