import { NextResponse } from 'next/server'
import { AdminApiError } from '@/lib/supabase/server-client'
import { requireWorkspacePermission } from '@/lib/supabase/workspace-auth'

function fail(error: unknown) {
  if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error('Individual permissions failed:', error)
  return NextResponse.json({ error: 'Não foi possível carregar as permissões individuais.' }, { status: 500 })
}

export async function GET(_: Request, context: { params: Promise<{ memberId: string }> }) {
  try {
    const actor = await requireWorkspacePermission('roles', 'manage_roles')
    const { memberId } = await context.params
    const { data, error } = await actor.supabase.from('workspace_member_permission_overrides')
      .select('permission_id,effect,access_permissions!inner(module_name,action_name,is_active)').eq('member_id', memberId).eq('access_permissions.is_active', true)
    if (error) throw error
    return NextResponse.json({ overrides: data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return fail(error) }
}

export async function PATCH(request: Request, context: { params: Promise<{ memberId: string }> }) {
  try {
    const actor = await requireWorkspacePermission('roles', 'manage_roles')
    const { memberId } = await context.params
    const body = await request.json() as { module?: unknown; action?: unknown; effect?: unknown }
    if (typeof body.module !== 'string' || typeof body.action !== 'string' || !['inherit', 'allow', 'deny'].includes(String(body.effect))) {
      return NextResponse.json({ error: 'Permissão ou efeito inválido.' }, { status: 400 })
    }
    const { data, error } = await actor.supabase.rpc('save_workspace_member_permission_override', {
      p_actor_id: actor.actorId, p_member_id: memberId, p_module: body.module, p_action: body.action, p_effect: body.effect,
    })
    if (error) {
      if (error.code === '42501') throw new AdminApiError('Você não pode alterar exceções de permissões.', 403)
      if (error.code === '22023') throw new AdminApiError('Permissão inválida.', 400)
      throw error
    }
    return NextResponse.json({ override: data })
  } catch (error) { return fail(error) }
}
