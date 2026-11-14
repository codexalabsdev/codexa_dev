import { NextResponse } from 'next/server'
import { createCommercialDocumentPdf } from '@/lib/commercial-documents/pdf'
import { AdminApiError } from '@/lib/supabase/server-client'
import { requireWorkspacePermission } from '@/lib/supabase/workspace-auth'

export const runtime = 'nodejs'
type Context = { params: Promise<{ documentId: string }> }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function fail(error: unknown) {
  if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error('Commercial document action failed:', error)
  return NextResponse.json({ error: 'Não foi possível concluir a ação no documento.' }, { status: 500 })
}

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await requireWorkspacePermission('documents', 'update')
    const { documentId } = await context.params
    if (!uuidPattern.test(documentId)) return NextResponse.json({ error: 'Documento inválido.' }, { status: 400 })
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body || !['draft', 'review'].includes(String(body.status))) return NextResponse.json({ error: 'Estado inválido.' }, { status: 400 })
    const { data: current, error: readError } = await actor.supabase.from('workspace_commercial_documents').select('id,status').eq('id', documentId).maybeSingle()
    if (readError || !current) return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 })
    if (!['draft', 'review'].includes(current.status)) return NextResponse.json({ error: 'Documentos emitidos são imutáveis.' }, { status: 409 })
    const { data, error } = await actor.supabase.from('workspace_commercial_documents').update({ status: body.status, updated_by: actor.actorId, updated_at: new Date().toISOString() }).eq('id', documentId).select('id,status,title').single()
    if (error) throw new AdminApiError('Não foi possível atualizar o estado do documento.', 503)
    const eventType = body.status === 'review' ? 'review_requested' : 'updated'
    await actor.supabase.from('workspace_document_events').insert({ document_id: documentId, actor_id: actor.actorId, event_type: eventType, details: {} })
    return NextResponse.json({ document: data })
  } catch (error) { return fail(error) }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const actor = await requireWorkspacePermission('documents', 'delete')
    const { documentId } = await context.params
    if (!uuidPattern.test(documentId)) return NextResponse.json({ error: 'Documento inválido.' }, { status: 400 })
    const { data: current, error: readError } = await actor.supabase.from('workspace_commercial_documents').select('id,status,deleted_at').eq('id', documentId).maybeSingle()
    if (readError || !current || current.deleted_at) return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 })
    if (!['draft', 'review'].includes(current.status)) return NextResponse.json({ error: 'Somente rascunhos podem ser removidos. Documentos emitidos permanecem no histórico.' }, { status: 409 })
    const { error } = await actor.supabase.from('workspace_commercial_documents').update({ deleted_at: new Date().toISOString(), updated_by: actor.actorId, updated_at: new Date().toISOString() }).eq('id', documentId).is('deleted_at', null)
    if (error) throw new AdminApiError('Não foi possível remover o rascunho.', 503)
    await actor.supabase.from('workspace_document_events').insert({ document_id: documentId, actor_id: actor.actorId, event_type: 'deleted', details: {} })
    return NextResponse.json({ ok: true })
  } catch (error) { return fail(error) }
}

export async function POST(request: Request, context: Context) {
  try {
    const { documentId } = await context.params
    if (!uuidPattern.test(documentId)) return NextResponse.json({ error: 'Documento inválido.' }, { status: 400 })
    const body = await request.json().catch(() => ({})) as { action?: string; reason?: string }
    if (body.action === 'cancel') {
      const actor = await requireWorkspacePermission('documents', 'cancel')
      const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
      if (reason.length < 3 || reason.length > 500) return NextResponse.json({ error: 'Informe um motivo de cancelamento entre 3 e 500 caracteres.' }, { status: 400 })
      const { data: cancelled, error: cancelError } = await actor.supabase.rpc('cancel_workspace_commercial_document', { p_document_id: documentId, p_actor_id: actor.actorId, p_reason: reason })
      if (cancelError || !cancelled) {
        const status = cancelError?.code === '42501' ? 403 : cancelError?.code === 'P0002' ? 404 : cancelError?.code === '22023' ? 409 : 503
        return NextResponse.json({ error: status === 409 ? 'Somente documentos emitidos podem ser cancelados.' : status === 404 ? 'Documento não encontrado.' : status === 403 ? 'Você não tem permissão para cancelar documentos.' : 'O cancelamento não está disponível. Confira a migration pendente.' }, { status })
      }
      return NextResponse.json({ document: cancelled })
    }
    const actor = await requireWorkspacePermission('documents', 'issue')
    const { data, error } = await actor.supabase.rpc('issue_workspace_commercial_document', { p_document_id: documentId, p_actor_id: actor.actorId })
    if (error || !data) {
      const status = error?.code === '42501' ? 403 : error?.code === 'P0002' ? 404 : error?.code === '22023' ? 409 : 503
      return NextResponse.json({ error: status === 409 ? 'Este documento não pode mais ser emitido.' : status === 404 ? 'Documento ou registro vinculado não encontrado.' : status === 403 ? 'Você não tem permissão para emitir documentos.' : 'A emissão não está disponível. Confira a migration pendente e tente novamente.' }, { status })
    }
    const document = data as Record<string, unknown>
    const snapshot = document.issued_snapshot as Record<string, unknown> | null
    if (!snapshot) throw new AdminApiError('O documento foi emitido, mas não foi possível carregar o conteúdo imutável.', 503)
    let pdfWarning: string | undefined
    try {
      const { data: branding, error: brandingError } = await actor.supabase.from('workspace_document_settings').select('issuer_primary_color,issuer_secondary_color').eq('id', true).maybeSingle()
      if (brandingError) throw brandingError
      const issuer = snapshot.issuer && typeof snapshot.issuer === 'object' ? snapshot.issuer as Record<string, unknown> : {}
      const brandedSnapshot = { ...snapshot, issuer: { ...issuer, issuer_primary_color: branding?.issuer_primary_color, issuer_secondary_color: branding?.issuer_secondary_color } }
      const bytes = await createCommercialDocumentPdf(brandedSnapshot)
      const path = `commercial-documents/${documentId}/${String(document.document_number).replace(/[^A-Za-z0-9-]/g, '')}.pdf`
      const upload = await actor.supabase.storage.from('private-documents').upload(path, bytes, { contentType: 'application/pdf', upsert: true })
      if (upload.error) throw upload.error
      const { error: saveError } = await actor.supabase.from('workspace_commercial_documents').update({ pdf_storage_path: path }).eq('id', documentId)
      if (saveError) throw saveError
      document.pdf_storage_path = path
    } catch (error) {
      console.error('Commercial document PDF creation failed:', error)
      pdfWarning = 'Documento emitido; a geração do PDF precisa ser tentada novamente.'
    }
    return NextResponse.json({ document, warning: pdfWarning }, { status: 201 })
  } catch (error) { return fail(error) }
}
