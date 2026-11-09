import { NextResponse } from 'next/server'
import { AdminApiError } from '@/lib/supabase/server-client'
import { requireWorkspacePermission } from '@/lib/supabase/workspace-auth'

const categories = new Set(['geral', 'contratos', 'avisos', 'metas', 'processos', 'financeiro'])
type Context = { params: Promise<{ documentId: string }> }

function fail(error: unknown) {
  if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error('Internal document action failed:', error)
  return NextResponse.json({ error: 'Não foi possível atualizar o documento.' }, { status: 500 })
}

export async function PUT(request: Request, context: Context) {
  try {
    const actor = await requireWorkspacePermission('documents', 'update')
    const { documentId } = await context.params
    const form = await request.formData()
    const title = String(form.get('title') ?? '').trim()
    const description = String(form.get('description') ?? '').trim()
    const category = String(form.get('category') ?? 'geral')
    const file = form.get('file')
    if (title.length < 2 || title.length > 160 || description.length > 500 || !categories.has(category)) return NextResponse.json({ error: 'Revise título, descrição e categoria.' }, { status: 400 })
    const { data: document, error: readError } = await actor.supabase.from('internal_documents').select('id,storage_path').eq('id', documentId).maybeSingle()
    if (readError || !document) throw new AdminApiError('Documento não encontrado.', 404)
    const update: Record<string, string | number> = { title, description, category }
    let replacementPath: string | null = null
    if (file instanceof File && file.size > 0) {
      if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: 'O arquivo deve ter no máximo 20 MB.' }, { status: 400 })
      replacementPath = `internal-documents/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
      const upload = await actor.supabase.storage.from('private-documents').upload(replacementPath, file, { contentType: file.type || 'application/octet-stream', upsert: false })
      if (upload.error) throw new AdminApiError('Não foi possível armazenar o novo arquivo.', 503)
      Object.assign(update, { file_name: file.name, storage_path: replacementPath, mime_type: file.type || 'application/octet-stream', file_size: file.size })
    }
    const { data, error } = await actor.supabase.from('internal_documents').update(update).eq('id', documentId).select('id,title,description,category,file_name,mime_type,file_size,storage_path,created_at,created_by').single()
    if (error) {
      if (replacementPath) await actor.supabase.storage.from('private-documents').remove([replacementPath])
      throw new AdminApiError('Não foi possível atualizar o documento.', 503)
    }
    if (replacementPath) await actor.supabase.storage.from('private-documents').remove([document.storage_path])
    return NextResponse.json({ document: data })
  } catch (error) { return fail(error) }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const actor = await requireWorkspacePermission('documents', 'delete')
    const { documentId } = await context.params
    const { data: document, error: readError } = await actor.supabase.from('internal_documents').select('id,storage_path').eq('id', documentId).maybeSingle()
    if (readError || !document) throw new AdminApiError('Documento não encontrado.', 404)
    const { error } = await actor.supabase.from('internal_documents').delete().eq('id', documentId)
    if (error) throw new AdminApiError('Não foi possível excluir o documento.', 503)
    const { error: storageError } = await actor.supabase.storage.from('private-documents').remove([document.storage_path])
    if (storageError) return NextResponse.json({ warning: 'Documento excluído, mas o arquivo não pôde ser removido do armazenamento.' })
    return NextResponse.json({ ok: true })
  } catch (error) { return fail(error) }
}
