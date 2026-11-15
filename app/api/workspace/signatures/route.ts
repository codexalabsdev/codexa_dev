import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import { NextResponse } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import { AdminApiError } from '@/lib/supabase/server-client'
import { getWorkspacePermissions, requireWorkspacePermission } from '@/lib/supabase/workspace-auth'

const bucket = 'private-documents'
const maxFileSize = 20 * 1024 * 1024

function getClientAddress(request: Request) {
  const candidate = request.headers.get('x-forwarded-for')?.split(',').map((value) => value.trim()).at(-1)
  return candidate && isIP(candidate) ? candidate : null
}

function fail(error: unknown) {
  if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error('Document signing request failed:', error)
  return NextResponse.json({ error: 'Não foi possível processar a assinatura do documento.' }, { status: 500 })
}

export async function GET() {
  try {
    const actor = await requireWorkspacePermission('documents', 'view')
    const { data: processes, error } = await actor.supabase
      .from('document_signing_processes')
      .select('id,title,status,original_sha256,final_sha256,page_count,created_at,signed_at,created_by')
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw new AdminApiError('Aplique a migration de assinaturas para habilitar este módulo.', 503)
    const permissions = await getWorkspacePermissions(actor)
    const canDownload = permissions.has('*') || permissions.has('documents:download')
    const libraryResult = canDownload
      ? await actor.supabase.from('internal_documents').select('id,title,file_name,created_at').eq('mime_type', 'application/pdf').order('created_at', { ascending: false }).limit(100)
      : { data: [], error: null }
    if (libraryResult.error) throw new AdminApiError('Não foi possível carregar os PDFs da biblioteca.', 503)
    const ids = (processes ?? []).map((process) => process.id)
    const { data: signers, error: signerError } = ids.length
      ? await actor.supabase.from('document_signers').select('id,process_id,full_name,email,status,signed_at,signing_order').in('process_id', ids)
      : { data: [], error: null }
    if (signerError) throw new AdminApiError('Não foi possível carregar os signatários.', 503)
    return NextResponse.json({ processes: (processes ?? []).map((process) => ({ ...process, signers: (signers ?? []).filter((signer) => signer.process_id === process.id) })), libraryDocuments: libraryResult.data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return fail(error) }
}

export async function POST(request: Request) {
  let storagePath: string | undefined
  let processId: string | undefined
  try {
    const actor = await requireWorkspacePermission('documents', 'signature_upload')
    const { data: { user } } = await actor.sessionSupabase.auth.getUser()
    if (!user?.email) throw new AdminApiError('Não foi possível validar sua conta.', 401)
    const form = await request.formData()
    let title = String(form.get('title') ?? '').trim()
    const file = form.get('file')
    const documentId = String(form.get('document_id') ?? '').trim()
    let sourceDocumentId: string | null = null
    let fileName = ''
    let bytes: Buffer
    if (documentId) {
      const libraryActor = await requireWorkspacePermission('documents', 'download')
      const { data: document, error: documentError } = await libraryActor.supabase.from('internal_documents').select('id,title,file_name,storage_path,mime_type,file_size').eq('id', documentId).maybeSingle()
      if (documentError) throw new AdminApiError('Não foi possível consultar o arquivo da biblioteca.', 503)
      if (!document || document.mime_type !== 'application/pdf' || document.file_size < 8 || document.file_size > maxFileSize) return NextResponse.json({ error: 'O arquivo selecionado não é um PDF válido ou excede 20 MB.' }, { status: 400 })
      const { data: sourceFile, error: sourceError } = await libraryActor.supabase.storage.from(bucket).download(document.storage_path)
      if (sourceError || !sourceFile) throw new AdminApiError('Não foi possível ler o PDF selecionado na biblioteca.', 503)
      bytes = Buffer.from(await sourceFile.arrayBuffer())
      sourceDocumentId = document.id
      fileName = document.file_name.slice(0, 255)
      if (!title) title = document.title
    } else if (file instanceof File && file.size >= 8 && file.size <= maxFileSize) {
      bytes = Buffer.from(await file.arrayBuffer())
      fileName = file.name.slice(0, 255)
    } else {
      return NextResponse.json({ error: 'Informe um nome e selecione um PDF de até 20 MB, ou escolha um PDF da biblioteca.' }, { status: 400 })
    }
    if (title.length < 2 || title.length > 160) return NextResponse.json({ error: 'O nome do processo deve conter entre 2 e 160 caracteres.' }, { status: 400 })
    if (bytes.length < 8 || bytes.length > maxFileSize) return NextResponse.json({ error: 'O PDF deve ter entre 8 bytes e 20 MB.' }, { status: 400 })
    if (bytes.subarray(0, 5).toString() !== '%PDF-') return NextResponse.json({ error: 'O arquivo não parece ser um PDF válido.' }, { status: 400 })
    let pdf: PDFDocument
    try { pdf = await PDFDocument.load(bytes, { updateMetadata: false }) } catch { return NextResponse.json({ error: 'Não foi possível abrir o PDF. Verifique se ele não está corrompido ou protegido por senha.' }, { status: 400 }) }
    const pageCount = pdf.getPageCount()
    if (!pageCount || pageCount > 500) return NextResponse.json({ error: 'O PDF deve conter entre 1 e 500 páginas.' }, { status: 400 })

    processId = crypto.randomUUID()
    storagePath = `document-signatures/${processId}/original.pdf`
    const upload = await actor.supabase.storage.from(bucket).upload(storagePath, bytes, { contentType: 'application/pdf', upsert: false })
    if (upload.error) throw new AdminApiError('Não foi possível armazenar o PDF original no espaço privado.', 503)

    const originalSha256 = createHash('sha256').update(bytes).digest('hex')
    const { error: processError } = await actor.supabase.rpc('create_document_signing_process', {
      p_process_id: processId,
      p_title: title,
      p_source_document_id: sourceDocumentId,
      p_storage_path: storagePath,
      p_original_sha256: originalSha256,
      p_page_count: pageCount,
      p_actor_id: actor.actorId,
      p_signer_name: actor.fullName,
      p_signer_email: user.email,
      p_file_name: fileName,
      p_ip_address: getClientAddress(request),
      p_user_agent: request.headers.get('user-agent')?.slice(0, 500) || null,
    })
    if (processError) throw new AdminApiError('Não foi possível registrar o processo. Aplique a migration de assinaturas.', 503)
    return NextResponse.json({ process: { id: processId, title, status: 'draft', page_count: pageCount, original_sha256: originalSha256 } }, { status: 201 })
  } catch (error) {
    if (processId) {
      try {
        const actor = await requireWorkspacePermission('documents', 'signature_upload')
        const { data: persisted } = await actor.supabase.from('document_signing_processes').select('id').eq('id', processId).maybeSingle()
        if (!persisted && storagePath) await actor.supabase.storage.from(bucket).remove([storagePath])
      } catch { /* Preserve the private object for administrator review when request status is uncertain. */ }
    }
    return fail(error)
  }
}
