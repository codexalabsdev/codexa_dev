import { NextResponse } from 'next/server'
import { getWorkspacePermissions, getWorkspaceActor } from '@/lib/supabase/workspace-auth'
import { AdminApiError } from '@/lib/supabase/server-client'
import { requireContractAttachmentAccess } from '@/lib/supabase/contract-attachment-access'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const maxFileSize = 10 * 1024 * 1024

function failure(error: unknown) {
  if (error instanceof AdminApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error('Contract attachment upload failed:', error)
  return NextResponse.json({ error: 'Não foi possível salvar o anexo do contrato.' }, { status: 500 })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ contractId: string }> },
) {
  try {
    const { contractId } = await params
    if (!uuidPattern.test(contractId)) {
      return NextResponse.json({ error: 'Identificador de contrato inválido.' }, { status: 400 })
    }

    const actor = await getWorkspaceActor()
    const permissions = await getWorkspacePermissions(actor)
    const contract = await requireContractAttachmentAccess(actor, permissions, contractId, 'upload')

    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Selecione um arquivo PDF.' }, { status: 400 })
    }
    if ((file.type && file.type !== 'application/pdf') || !file.name.toLowerCase().endsWith('.pdf') || file.size < 5 || file.size > maxFileSize) {
      return NextResponse.json({ error: 'O documento deve ser PDF, não estar vazio e ter no máximo 10 MB.' }, { status: 400 })
    }
    const fileBytes = new Uint8Array(await file.arrayBuffer())
    if (new TextDecoder().decode(fileBytes.slice(0, 5)) !== '%PDF-') {
      return NextResponse.json({ error: 'O conteúdo selecionado não é um PDF válido.' }, { status: 400 })
    }

    const safeFileName = file.name.replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0, 180)
    const storagePath = `${actor.actorId}/contract/${contract.id}/${crypto.randomUUID()}-${safeFileName || 'contrato.pdf'}`
    const { error: uploadError } = await actor.supabase.storage
      .from('private-documents')
      .upload(storagePath, fileBytes, {
        contentType: 'application/pdf',
        upsert: false,
      })
    if (uploadError) {
      console.error('Contract attachment storage upload failed:', uploadError.message)
      throw new AdminApiError(`Não foi possível enviar o PDF: ${uploadError.message}`, 503)
    }

    const { error: attachmentError } = await actor.supabase.from('entity_attachments').insert({
      entity_type: 'contract',
      entity_id: contract.id,
      file_name: file.name,
      storage_path: storagePath,
      mime_type: 'application/pdf',
      file_size: file.size,
      uploaded_by: actor.actorId,
    })
    if (attachmentError) {
      const { error: cleanupError } = await actor.supabase.storage.from('private-documents').remove([storagePath])
      if (cleanupError) console.error('Contract attachment storage rollback failed:', cleanupError.message)
      console.error('Contract attachment metadata insert failed:', attachmentError.message)
      throw new AdminApiError(`O PDF foi enviado, mas não foi possível registrar o anexo: ${attachmentError.message}`, 503)
    }

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    return failure(error)
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ contractId: string }> },
) {
  try {
    const { contractId } = await params
    if (!uuidPattern.test(contractId)) {
      return NextResponse.json({ error: 'Identificador de contrato inválido.' }, { status: 400 })
    }

    const actor = await getWorkspaceActor()
    const permissions = await getWorkspacePermissions(actor)
    await requireContractAttachmentAccess(actor, permissions, contractId, 'download')

    const { data, error } = await actor.supabase
      .from('entity_attachments')
      .select('id,file_name,storage_path,mime_type,file_size,uploaded_by,created_at')
      .eq('entity_type', 'contract')
      .eq('entity_id', contractId)
      .order('created_at', { ascending: false })
    if (error) {
      console.error('Contract attachment list failed:', error.message)
      throw new AdminApiError('Não foi possível carregar os anexos do contrato.', 503)
    }
    return NextResponse.json({ attachments: data ?? [] })
  } catch (error) {
    return failure(error)
  }
}
