import { NextResponse } from 'next/server'
import { getWorkspaceActor, getWorkspacePermissions } from '@/lib/supabase/workspace-auth'
import { AdminApiError } from '@/lib/supabase/server-client'
import { requireContractAttachmentAccess } from '@/lib/supabase/contract-attachment-access'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function failure(error: unknown) {
  if (error instanceof AdminApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error('Contract attachment view failed:', error)
  return NextResponse.json({ error: 'Não foi possível abrir o anexo do contrato.' }, { status: 500 })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ contractId: string; attachmentId: string }> },
) {
  try {
    const { contractId, attachmentId } = await params
    if (!uuidPattern.test(contractId) || !uuidPattern.test(attachmentId)) {
      return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400 })
    }

    const actor = await getWorkspaceActor()
    const permissions = await getWorkspacePermissions(actor)
    await requireContractAttachmentAccess(actor, permissions, contractId, 'download')

    const { data: attachment, error: attachmentError } = await actor.supabase
      .from('entity_attachments')
      .select('file_name,storage_path')
      .eq('id', attachmentId)
      .eq('entity_type', 'contract')
      .eq('entity_id', contractId)
      .maybeSingle()
    if (attachmentError) {
      console.error('Contract attachment lookup failed:', attachmentError.message)
      throw new AdminApiError('Não foi possível localizar o anexo.', 503)
    }
    if (!attachment) throw new AdminApiError('Anexo não encontrado neste contrato.', 404)

    const download = new URL(request.url).searchParams.get('download') === '1'
    const { data, error: signedUrlError } = await actor.supabase.storage
      .from('private-documents')
      .createSignedUrl(attachment.storage_path, 60, { download: download ? attachment.file_name : false })
    if (signedUrlError || !data?.signedUrl) {
      console.error('Contract attachment signed URL failed:', signedUrlError?.message ?? 'No signed URL returned')
      throw new AdminApiError('Não foi possível gerar o link seguro do anexo.', 503)
    }

    return NextResponse.redirect(data.signedUrl, { status: 302 })
  } catch (error) {
    return failure(error)
  }
}
