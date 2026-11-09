# Workspace access control

The workspace uses `team_members.role_name` as each member's primary role and the existing `access_roles`, `access_permissions`, and `role_permissions` tables as its permission catalog. Role matching ignores surrounding whitespace and letter case, and permission grants are read through the resolved role ID so legacy name formatting cannot silently remove a member's access. Access is denied when there is no active member, no active role, or no explicit permission. The `admin` role is the only built-in full-access role.

Effective-permission precedence is: an active administrator receives the protected wildcard; otherwise, an active individual `allow` or `deny` overrides only that module/action, and `inherit` (or no override) uses the role grant. If the server cannot load the individual override set, it fails closed instead of silently falling back to the role. Database RLS uses the same effective-permission function; project membership is an additional row-level boundary and does not replace the global project permission.

## Applying the database changes

The relevant RBAC/project migration chain includes these files; apply all other required application migrations with intervening timestamps as well. Test in a non-production Supabase project first:

1. `supabase/migrations/20261021220000_project_collaboration.sql`
2. `supabase/migrations/20261022100000_license_management.sql`
3. `supabase/migrations/20261022120000_workspace_rbac.sql`
4. `supabase/migrations/20261022140000_commercial_contract_creation.sql`
5. `supabase/migrations/20261022150000_fix_contract_owner_trigger.sql`
6. `supabase/migrations/20261022160000_commercial_contract_updates.sql`
7. `supabase/migrations/20261022170000_support_ticket_details.sql`
8. `supabase/migrations/20261022180000_workspace_role_deletion.sql`
9. `supabase/migrations/20261022190000_contract_attachment_permissions.sql`
10. `supabase/migrations/20261022200000_activity_attachment_storage_scope.sql`
11. `supabase/migrations/20261022210000_support_ticket_sectors.sql`
12. `supabase/migrations/20261023100000_individual_workspace_permissions.sql` (manual prerequisite)
13. `supabase/migrations/20261023120000_task_sharing_and_assignment_history.sql`
14. `supabase/migrations/20261023140000_fix_project_activity_delete.sql`
15. `supabase/migrations/20261023160000_fix_individual_permission_precedence.sql`
16. `supabase/migrations/20261023180000_permission_security_hardening.sql`
17. `supabase/migrations/20261031120000_project_access_sharing.sql`
18. `supabase/migrations/20261031125000_project_task_sharing.sql`
19. `supabase/migrations/20261031130000_workspace_permission_catalog.sql`

The RBAC migration seeds the standard roles and permission catalog, installs table and Storage RLS policies, protects the built-in administrator role and audit logs, and creates transactional RPCs used by role and member administration. It must be reviewed against the target project's existing policies and schema before deployment. The existing policies in the connected Supabase project have not been independently enumerated, and the migration has not been applied or exercised against that database.

## Server configuration

Protected APIs validate the signed-in Supabase user and active team membership before using the server-only `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`). Never expose either key to browser code. Role edits and member role/status changes execute through database RPCs so the database update and audit event are committed or rolled back together.

Custom roles can be deleted only by users with `roles:manage_roles`. The database rejects deletion of every `is_system` role and checks current member assignments in the same transaction. A role with assigned members requires an active replacement role; reassignment, role deletion, and the audit event are committed together. Replacement-role permissions cannot exceed the acting user's grants.

Contract attachment access requires both `contracts:view` and `attachments:download`, plus access to the specific contract. Contract files remain in the private `private-documents` bucket; the authenticated server route checks the contract and attachment before issuing a 60-second signed URL. The `20261022190000_contract_attachment_permissions.sql` migration grants download permission to the system Financeiro, Relacionamento, Consulta, and Leitura e auditoria roles, which already have contract-view permission. Custom roles continue to require an explicit grant.

Project and task attachments use private Storage paths prefixed with the authenticated uploader ID, followed by entity type and ID. Storage read and delete policies authorize access against the linked project or task and the caller's attachment permissions, while inserts require the caller-owned path and matching author metadata. The scope migration continues to accept existing legacy paths for reads and deletes.

Project and Kanban controls honor the existing `projects:create`, `projects:update`, `projects:delete`, and `projects:assign` grants. Read-only members can open task details without getting task edit, status-move, comment, deletion, or assignment controls; the Kanban date filter starts unset so older tasks remain visible by default.

Project visibility is now scoped by `projects.created_by` or an active `project_members` row keyed by `auth.users.id`. Membership levels are `viewer`, `collaborator`, and `manager`; global role/individual permissions still apply in addition to the project level. Revocation is a soft state change retained for audit, overrides direct task assignment for the revoked user within that project, cancels pending task-share requests, and blocks project/task attachment proxy reads. Task-only shares keep their `project_id` and grant visibility to that task only.

The permission catalog now has an explicit module/action matrix. `access_permissions.is_active=false` archives obsolete combinations without deleting historical role assignments; role editing, effective permission evaluation, and individual overrides use active catalog entries only. Project archive and share are separate actions, with legacy `projects:update` and `projects:assign` grants copied to those capabilities during migration.

The license page displays the effective state, including expired active licenses. Users with `licenses:view` can inspect status, expiration, and module entitlements; creation, status/expiration changes, module changes, and deletion are shown only to users with `licenses:manage_licenses`. The generated license key remains one-time display only and is stored as a hash.

Reports now have separate commercial and financial views, each shown only with its corresponding `reports_*:view` grant. CSV exports additionally require the matching `reports_*:export` grant and include only records visible to the signed-in account through existing RLS.

Support tickets require a sector: Suporte Técnico, Financeiro, Comercial, or Operações. New tickets are routed to an active member of the matching role with the fewest unresolved tickets; sector teams can update their own tickets, while users with `support:assign` can reassign only to an active member of that sector or change its sector. Ticket visibility is limited by sector, with support administrators and read-only audit roles retaining cross-sector visibility. Existing tickets are retained and classified under Suporte Técnico without changing their current assignees. Creation, category/sector changes, and reassignments are written to the admin audit log.

Admins with `users:manage_users` can create a confirmed account and team membership from the Users panel by setting an initial password, or link an existing Supabase account by leaving the password blank. An existing unlinked team record with the same email is linked instead of duplicated. The panel also supports editing a member's name and email; email changes are synchronized with Supabase Auth. Share initial passwords with users through a secure channel. Account creation, profile changes, role changes, and status changes are audited.

## Verification limits

Run the route-to-permission unit tests with `node --experimental-strip-types --test tests/rbac/workspace-access.test.mjs`. The SQL files under `supabase/tests/` are structural regression checks and must be run against a staging Supabase project. They do not replace multi-account integration tests: before production, test each role's allowed and denied reads/writes, row ownership boundaries, Storage access, immediate project-membership revocation, administrator protection, and audit immutability with separate authenticated accounts. The new migrations have not been applied or exercised against the connected Supabase database in this workspace; SQL parsing and application build are not proof that RLS works in the live schema.
