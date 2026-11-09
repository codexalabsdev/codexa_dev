import { NextResponse } from 'next/server'
import { AdminApiError } from '@/lib/supabase/server-client'
import { getWorkspaceActor } from '@/lib/supabase/workspace-auth'

const actions = new Set(['resolve_ticket', 'complete_task', 'complete_task_on_time', 'deliver_project', 'deliver_project_milestone', 'close_sale', 'close_contract', 'win_lead', 'create_task', 'resolve_support_ticket', 'approve_change_request', 'create_document', 'assign_badge', 'receive_positive_feedback', 'achieve_goal'])
const entities = new Set(['support_ticket', 'task', 'project', 'sale', 'contract', 'lead', 'change_request', 'document', 'badge', 'feedback', 'goal'])
export async function POST(request: Request) {
  try {
    const actor = await getWorkspaceActor()
    const body = await request.json() as { actionKey?: string; entityType?: string; entityId?: string }
    if (!body.actionKey || !actions.has(body.actionKey) || !body.entityType || !entities.has(body.entityType) || !body.entityId) return NextResponse.json({ error: 'Evento de XP inválido.' }, { status: 400 })
    const { data, error } = await actor.supabase.rpc('award_xp', { p_member_id: actor.memberId, p_action_key: body.actionKey, p_entity_type: body.entityType, p_entity_id: body.entityId })
    if (error) throw new AdminApiError('Não foi possível registrar o XP. A migração do motor de XP precisa estar aplicada.', 503)
    return NextResponse.json({ awarded: Number(data ?? 0) })
  } catch (error) { if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status }); return NextResponse.json({ error: 'Não foi possível registrar o XP.' }, { status: 500 }) }
}
