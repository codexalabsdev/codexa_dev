import { NextResponse } from 'next/server'
import { AdminApiError } from '@/lib/supabase/server-client'
import { requireWorkspacePermission } from '@/lib/supabase/workspace-auth'

function fail(error: unknown) {
  if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error('Role administration failed:', error)
  return NextResponse.json({ error: 'Não foi possível concluir a operação de cargos.' }, { status: 500 })
}

type RoleInput = { name?: unknown; description?: unknown; permissions?: unknown }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function validPermissions(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && /^[a-z_]+:[a-z_]+$/.test(item))
}

async function saveRole(
  actor: Awaited<ReturnType<typeof requireWorkspacePermission>>,
  input: { id: string | null; name: string; description: string; isActive: boolean; permissions: string[] },
) {
  const { data, error } = await actor.supabase.rpc('save_workspace_role', {
    p_actor_id: actor.actorId,
    p_role_id: input.id,
    p_name: input.name,
    p_description: input.description,
    p_is_active: input.isActive,
    p_permissions: [...new Set(input.permissions)],
  })
  if (error) {
    if (error.code === '42501') throw new AdminApiError('Você não pode conceder privilégios superiores aos seus.', 403)
    if (error.code === '22023') throw new AdminApiError('A lista contém campos ou permissões inválidos.', 400)
    if (error.code === '23505') throw new AdminApiError('Já existe um cargo com esse nome.', 409)
    if (error.code === 'P0002') throw new AdminApiError('Cargo não encontrado.', 404)
    console.error('Atomic role save failed:', error.message)
    throw new AdminApiError('Não foi possível salvar o cargo.', 503)
  }
  if (!data || typeof data !== 'object' || !('role' in data)) {
    throw new AdminApiError('O banco não confirmou a gravação do cargo.', 503)
  }
  return data.role
}

export async function GET() {
  try {
    const { supabase } = await requireWorkspacePermission('roles', 'manage_roles')
    const [{ data: roles, error: rolesError }, { data: permissions, error: permissionsError }, { data: members, error: membersError }, { data: assignments, error: assignmentsError }] = await Promise.all([
      supabase.from('access_roles').select('id,name,description,is_system,is_active,created_at,updated_at').order('name'),
      supabase.from('access_permissions').select('id,module_name,action_name').eq('is_active', true).order('module_name').order('action_name'),
      supabase.from('team_members').select('role_name').limit(5000),
      supabase.from('role_permissions').select('role_id,permission_id').limit(10000),
    ])
    const error = rolesError ?? permissionsError ?? membersError ?? assignmentsError
    if (error) {
      console.error('Role catalog load failed:', error.message)
      return NextResponse.json({ error: 'Não foi possível carregar os cargos e permissões.' }, { status: 503 })
    }
    const roleCounts = new Map<string, number>()
    for (const member of members ?? []) roleCounts.set(member.role_name, (roleCounts.get(member.role_name) ?? 0) + 1)
    const permissionNames = new Map((permissions ?? []).map((permission) => [permission.id, `${permission.module_name}:${permission.action_name}`]))
    const roleGrants = new Map<string, string[]>()
    for (const assignment of assignments ?? []) {
      const name = permissionNames.get(assignment.permission_id)
      if (name) roleGrants.set(assignment.role_id, [...(roleGrants.get(assignment.role_id) ?? []), name])
    }
    return NextResponse.json({
      roles: (roles ?? []).map((role) => ({
        ...role,
        memberCount: roleCounts.get(role.name) ?? 0,
        permissions: role.name.toLowerCase() === 'admin'
          ? (permissions ?? []).map((permission) => `${permission.module_name}:${permission.action_name}`)
          : roleGrants.get(role.id) ?? [],
      })),
      permissions: permissions ?? [],
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return fail(error)
  }
}

export async function POST(request: Request) {
  let body: RoleInput
  try {
    body = await request.json() as RoleInput
  } catch {
    return NextResponse.json({ error: 'Corpo da solicitação inválido.' }, { status: 400 })
  }
  if (typeof body.name !== 'string' || !/^[\p{L}\p{N}][\p{L}\p{N} _-]{1,49}$/u.test(body.name.trim())
    || body.name.trim().toLowerCase() === 'admin' || typeof body.description !== 'string'
    || !validPermissions(body.permissions)) {
    return NextResponse.json({ error: 'Nome, descrição ou permissões inválidos.' }, { status: 400 })
  }

  try {
    const actor = await requireWorkspacePermission('roles', 'manage_roles')
    const role = await saveRole(actor, {
      id: null,
      name: body.name.trim(),
      description: body.description.trim(),
      isActive: true,
      permissions: body.permissions,
    })
    return NextResponse.json({ role }, { status: 201 })
  } catch (error) {
    return fail(error)
  }
}

export async function PUT(request: Request) {
  let body: RoleInput & { id?: unknown; isActive?: unknown }
  try {
    body = await request.json() as RoleInput & { id?: unknown; isActive?: unknown }
  } catch {
    return NextResponse.json({ error: 'Corpo da solicitação inválido.' }, { status: 400 })
  }
  if (typeof body.id !== 'string' || !uuidPattern.test(body.id)
    || typeof body.name !== 'string' || typeof body.description !== 'string'
    || !validPermissions(body.permissions) || typeof body.isActive !== 'boolean') {
    return NextResponse.json({ error: 'Cargo ou permissões inválidos.' }, { status: 400 })
  }

  try {
    const actor = await requireWorkspacePermission('roles', 'manage_roles')
    if (!/^[\p{L}\p{N}][\p{L}\p{N} _-]{1,49}$/u.test(body.name.trim())
      || body.name.trim().toLowerCase() === 'admin') {
      return NextResponse.json({ error: 'O nome Admin é reservado.' }, { status: 400 })
    }
    const role = await saveRole(actor, {
      id: body.id,
      name: body.name.trim(),
      description: body.description.trim(),
      isActive: body.isActive,
      permissions: body.permissions,
    })
    return NextResponse.json({ role })
  } catch (error) {
    return fail(error)
  }
}

export async function DELETE(request: Request) {
  let body: { id?: unknown; reassignToRoleId?: unknown }
  try {
    body = await request.json() as { id?: unknown; reassignToRoleId?: unknown }
  } catch {
    return NextResponse.json({ error: 'Corpo da solicitação inválido.' }, { status: 400 })
  }
  if (typeof body.id !== 'string' || !uuidPattern.test(body.id)
    || (body.reassignToRoleId !== undefined
      && body.reassignToRoleId !== null
      && (typeof body.reassignToRoleId !== 'string' || !uuidPattern.test(body.reassignToRoleId)))) {
    return NextResponse.json({ error: 'Cargo ou cargo de destino inválido.' }, { status: 400 })
  }

  try {
    const actor = await requireWorkspacePermission('roles', 'manage_roles')
    const { data, error } = await actor.supabase.rpc('delete_workspace_role', {
      p_actor_id: actor.actorId,
      p_role_id: body.id,
      p_reassign_role_id: typeof body.reassignToRoleId === 'string' ? body.reassignToRoleId : null,
    })
    if (error) {
      if (error.code === '42501') {
        return NextResponse.json({ error: 'Você não tem permissão para excluir este cargo ou atribuir o cargo de destino.' }, { status: 403 })
      }
      if (error.code === '22023') {
        return NextResponse.json({ error: 'O cargo de destino está inativo, é inválido ou não pode ser usado.' }, { status: 400 })
      }
      if (error.code === 'P0002') return NextResponse.json({ error: 'Cargo não encontrado.' }, { status: 404 })
      if (error.code === '23514') {
        const memberCount = typeof error.details === 'string' && /^\d+$/.test(error.details)
          ? Number(error.details)
          : null
        return NextResponse.json({
          error: 'Este cargo possui usuários vinculados. Escolha um cargo ativo para reatribuí-los antes de excluir.',
          ...(memberCount !== null && Number.isSafeInteger(memberCount) ? { memberCount } : {}),
        }, { status: 409 })
      }
      console.error('Atomic role deletion failed:', error.message)
      return NextResponse.json({ error: 'Não foi possível excluir o cargo.' }, { status: 503 })
    }
    if (!data || typeof data !== 'object' || !('role_id' in data)) {
      throw new AdminApiError('O banco não confirmou a exclusão do cargo.', 503)
    }
    return NextResponse.json(data)
  } catch (error) {
    return fail(error)
  }
}
