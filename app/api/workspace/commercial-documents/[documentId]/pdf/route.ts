import { NextResponse } from 'next/server'
import { AdminApiError } from '@/lib/supabase/server-client'
import { requireWorkspacePermission } from '@/lib/supabase/workspace-auth'

export const runtime = 'nodejs'
type Context = { params: Promise<{ documentId: string }> }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(_request: Request, context: Context) {
  try {
    const actor = await requireWorkspacePermission('documents', 'download')
    const { documentId } = await context.params
    if (!uuidPattern.test(documentId)) return NextResponse.json({ error: 'Documento inválido.' }, { status: 400 })
    const { data: document, error } = await actor.supabase.from('workspace_commercial_documents').select('id,status,pdf_storage_path,document_number').eq('id', documentId).maybeSingle()
    if (error || !document) return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 })
    if (document.status !== 'issued' && document.status !== 'cancelled') return NextResponse.json({ error: 'O PDF só fica disponível após a emissão.' }, { status: 409 })
    if (!document.pdf_storage_path) return NextResponse.json({ error: 'O PDF ainda não está disponível. Gere o arquivo novamente pela emissão.' }, { status: 404 })
    const { data: signed, error: signingError } = await actor.supabase.storage.from('private-documents').createSignedUrl(document.pdf_storage_path, 300, { download: `${document.document_number}.pdf` })
    if (signingError || !signed?.signedUrl) throw new AdminApiError('Não foi possível preparar o download privado.', 503)
    await actor.supabase.from('workspace_document_events').insert({ document_id: documentId, actor_id: actor.actorId, event_type: 'pdf_downloaded', details: {} })
    return NextResponse.json({ url: signed.signedUrl, expiresIn: 300 })
  } catch (error) {
    if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Commercial document PDF access failed:', error)
    return NextResponse.json({ error: 'Não foi possível preparar o PDF.' }, { status: 500 })
  }
}
