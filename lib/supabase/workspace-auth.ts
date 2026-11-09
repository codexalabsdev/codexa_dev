import 'server-only'

import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { applyWorkspacePermissionOverrides, normalizeWorkspaceRoleName } from '@/lib/workspace-access'
import { AdminApiError, createServiceClient } from './server-client'

export type WorkspaceActor = {
  actorId: string
  memberId: string
  roleId: string
  roleName: string
  fullName: string
  supabase: ReturnType<typeof createServiceClient>
  sessionSupabase: SupabaseClient
}

function isActive(status: string | null): boolean {
  const normalized = (status ?? '').replace(/['"]/g, '').trim().toLowerCase()
  return ['active', 'ativo', 'enabled', 'habilitado'].includes(normalized)
}

export async function getWorkspaceActor(): Promise<WorkspaceActor> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new AdminApiError('Servidor sem configuração do Supabase.', 503)

  const cookieStore = await cookies()
  const authClient = createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      // Server Components can read cookies but cannot persist refreshed auth cookies.
      // The write is handled by the request proxy when present; never let it crash the workspace render.
      setAll: (values) => {
        try {
          values.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Expected when getUser refreshes a token during a Server Component render.
        }
      },
    },
  })
  const { data: { user }, error: authError } = await authClient.auth.getUser()
  if (authError || !user) throw new AdminApiError('Autenticação necessária.', 401)

  const supabase = createServiceClient()
  let { data: members, error: memberError } = await supabase
    .from('team_members')
    .select('id,user_id,role_name,status,full_name,email')
    .eq('user_id', user.id)
    .limit(2)
  if (memberError) {
    console.error('Workspace member lookup failed:', memberError.message)
    throw new AdminApiError('Não foi possível verificar o acesso à equipe.', 503)
  }

  // Repair legacy invitations that were inserted before the Auth user was linked.
  // The match is intentionally strict: one exact e-mail and one orphaned membership only.
  if (!members?.length && user.email) {
    const { data: orphanMembers, error: orphanError } = await supabase
      .from('team_members')
      .select('id,user_id,role_name,status,full_name,email')
      .is('user_id', null)
      .ilike('email', user.email.trim().toLowerCase())
      .limit(2)
    if (orphanError) {
      console.error('Workspace orphan membership lookup failed:', orphanError.message)
      throw new AdminApiError('Não foi possível verificar o vínculo de acesso.', 503)
    }
    if (orphanMembers?.length === 1) {
      const { data: repairedMember, error: repairError } = await supabase
        .from('team_members')
        .update({ user_id: user.id, updated_at: new Date().toISOString() })
        .eq('id', orphanMembers[0].id)
        .is('user_id', null)
        .select('id,user_id,role_name,status,full_name,email')
        .single()
      if (repairError || !repairedMember) {
        console.error('Workspace orphan membership repair failed:', repairError?.message ?? 'No repaired member returned')
        throw new AdminApiError('Não foi possível vincular sua conta ao membro da equipe.', 503)
      }
      members = [repairedMember]
    }
  }

  if (!members?.length) throw new AdminApiError('Sua conta não está vinculada a um membro ativo da equipe.', 403)
  if (members.length > 1) throw new AdminApiError('Sua conta possui vínculos de equipe duplicados. Contate um administrador.', 403)
  const member = members[0]
  if (!isActive(member.status)) throw new AdminApiError('Sua conta de equipe está desativada.', 403)

  const { data: roles, error: roleError } = await supabase
    .from('access_roles')
    .select('id,name,is_active')
  if (roleError) {
    console.error('Workspace role lookup failed:', roleError.message)
    throw new AdminApiError('Não foi possível verificar seu cargo. Confira se a migração RBAC foi aplicada.', 503)
  }
  const role = (roles ?? []).find(
    (candidate) => normalizeWorkspaceRoleName(candidate.name) === normalizeWorkspaceRoleName(member.role_name),
  )
  if (!role || !role.is_active) throw new AdminApiError('Seu cargo está inativo ou não foi configurado.', 403)

  return {
    actorId: user.id,
    memberId: member.id,
    roleId: role.id,
    roleName: role.name,
    fullName: member.full_name,
    supabase,
    sessionSupabase: authClient as unknown as SupabaseClient,
  }
}

export async function getWorkspacePermissions(actor: WorkspaceActor): Promise<Set<string>> {
  if (normalizeWorkspaceRoleName(actor.roleName) === 'admin') return new Set(['*'])

  const { data: overrides, error: overridesError } = await actor.supabase
    .from('workspace_member_permission_overrides')
    .select('effect,access_permissions!inner(module_name,action_name,is_active)')
    .eq('member_id', actor.memberId)
    .eq('access_permissions.is_active', true)
  if (overridesError) {
    console.error('Workspace individual permission lookup failed:', overridesError.message)
    throw new AdminApiError('Não foi possível validar as exceções individuais de permissão.', 503)
  }

  const { data: grants, error: grantsError } = await actor.supabase
    .from('role_permissions')
    .select('permission_id')
    .eq('role_id', actor.roleId)
  if (grantsError) {
    console.error('Workspace permission grants lookup failed:', grantsError.message)
    throw new AdminApiError('Não foi possível carregar as permissões.', 503)
  }

  const ids = (grants ?? []).map((grant) => grant.permission_id)
  if (!ids.length) return new Set()
  const { data: permissions, error: permissionsError } = await actor.supabase
    .from('access_permissions')
    .select('module_name,action_name')
    .eq('is_active', true)
    .in('id', ids)
  if (permissionsError) {
    console.error('Workspace permission catalog lookup failed:', permissionsError.message)
    throw new AdminApiError('Não foi possível carregar as permissões.', 503)
  }
  const rolePermissions = (permissions ?? []).map((permission) => `${permission.module_name}:${permission.action_name}`)
  const normalizedOverrides = (overrides ?? []).flatMap((override) => {
    const permission = Array.isArray(override.access_permissions) ? override.access_permissions[0] : override.access_permissions
    return permission && (override.effect === 'allow' || override.effect === 'deny')
      ? [{ module_name: permission.module_name, action_name: permission.action_name, effect: override.effect }]
      : []
  })
  return applyWorkspacePermissionOverrides(rolePermissions, normalizedOverrides)
}

export async function requireWorkspacePermission(
  moduleName: string,
  actionName: string,
): Promise<WorkspaceActor> {
  const actor = await getWorkspaceActor()
  const permissions = await getWorkspacePermissions(actor)
  if (!permissions.has('*') && !permissions.has(`${moduleName}:${actionName}`)) {
    throw new AdminApiError('Você não tem permissão para esta operação.', 403)
  }
  return actor
}

export async function getWorkspaceAccessSnapshot() {
  const actor = await getWorkspaceActor()
  const permissions = await getWorkspacePermissions(actor)
  return {
    actorId: actor.actorId,
    roleName: actor.roleName,
    fullName: actor.fullName,
    permissions: [...permissions],
  }
}
