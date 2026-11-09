import { NextResponse } from 'next/server'
import { AdminApiError } from '@/lib/supabase/server-client'
import { requireWorkspacePermission } from '@/lib/supabase/workspace-auth'

type Context = { params: Promise<{ documentId: string }> }
const entityTypes = new Set(['project', 'task', 'contract', 'support_ticket', 'financial'])

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireWorkspacePermission('documents', 'upload')
    const { documentId } = await context.params
    const body = await request.json() as { entity_type?: string; entity_id?: string }
    if (!body.entity_type || !entityTypes.has(body.entity_type) || !body.entity_id) return NextResponse.json({ error: 'Informe o tipo e o ID do registro.' }, { status: 400 })
    const { error } = await actor.supabase.from('document_links').insert({ document_id: documentId, entity_type: body.entity_type, entity_id: body.entity_id, linked_by: actor.actorId })
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'Este documento já está vinculado a esse registro.' : 'Não foi possível criar o vínculo.' }, { status: 400 })
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Document link failed:', error)
    return NextResponse.json({ error: 'Não foi possível vincular o documento.' }, { status: 500 })
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const actor = await requireWorkspacePermission('documents', 'upload')
    const { documentId } = await context.params
    const { searchParams } = new URL(request.url)
    const linkId = searchParams.get('linkId')
    if (!linkId) return NextResponse.json({ error: 'Vínculo inválido.' }, { status: 400 })
    const { error } = await actor.supabase.from('document_links').delete().eq('id', linkId).eq('document_id', documentId)
    if (error) throw new AdminApiError('Não foi possível remover o vínculo.', 503)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'Não foi possível remover o vínculo.' }, { status: 500 })
  }
}
