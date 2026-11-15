import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import { NextResponse } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import { AdminApiError } from '@/lib/supabase/server-client'
import { getWorkspacePermissions, requireWorkspacePermission } from '@/lib/supabase/workspace-auth'

const bucket = 'private-documents'
const consentText = 'Declaro que li e concordo com o conteúdo deste documento e confirmo minha assinatura eletrônica.'
function getClientAddress(request: Request) {
  const candidate = request.headers.get('x-forwarded-for')?.split(',').map((value) => value.trim()).at(-1)
  return candidate && isIP(candidate) ? candidate : null
}
type RouteContext = { params: Promise<{ signatureId: string }> }

function fail(error: unknown) {
  if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error('Document signing process failed:', error)
  return NextResponse.json({ error: 'Não foi possível acessar este processo de assinatura.' }, { status: 500 })
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const actor = await requireWorkspacePermission('documents', 'signature_evidence')
    const { signatureId } = await context.params
    const { data: process, error } = await actor.supabase.from('document_signing_processes').select('id,title,status,original_storage_path,final_storage_path,original_sha256,final_sha256,page_count,signed_at,created_at,created_by').eq('id', signatureId).maybeSingle()
    if (error) throw error
    if (!process) return NextResponse.json({ error: 'Processo não encontrado.' }, { status: 404 })
    const [{ data: signers, error: signerError }, { data: fields, error: fieldError }, { data: events, error: eventError }] = await Promise.all([
      actor.supabase.from('document_signers').select('id,full_name,email,status,signed_at,authentication_method,consent_text,signing_order').eq('process_id', signatureId).order('signing_order'),
      actor.supabase.from('document_signing_fields').select('id,signer_id,page_number,x_percent,y_percent,width_percent,height_percent,field_type,status').eq('process_id', signatureId),
      actor.supabase.from('document_signing_events').select('id,signer_id,actor_id,event_type,event_data,ip_address,user_agent,created_at').eq('process_id', signatureId).order('created_at', { ascending: true }),
    ])
    if (signerError || fieldError || eventError) throw new AdminApiError('Não foi possível carregar as evidências do processo.', 503)
    const actorIds = [...new Set((events ?? []).map((event) => event.actor_id).filter((id): id is string => Boolean(id)))]
    const { data: teamActors, error: teamActorsError } = actorIds.length
      ? await actor.supabase.from('team_members').select('user_id,full_name').in('user_id', actorIds)
      : { data: [], error: null }
    if (teamActorsError) throw new AdminApiError('Não foi possível identificar os responsáveis pelas evidências.', 503)
    const signedFileDeleted = (events ?? []).some((event) => event.event_data?.action === 'signed_file_deleted')
    const original = await actor.supabase.storage.from(bucket).createSignedUrl(process.original_storage_path, 300)
    const final = process.final_storage_path && !signedFileDeleted ? await actor.supabase.storage.from(bucket).createSignedUrl(process.final_storage_path, 300) : null
    if (original.error) throw new AdminApiError('Não foi possível gerar o acesso temporário ao PDF original.', 503)
    return NextResponse.json({ process: { ...process, signed_file_deleted: signedFileDeleted, original_url: original.data.signedUrl, final_url: final?.data?.signedUrl ?? null, signers: signers ?? [], fields: fields ?? [], events: (events ?? []).map((event) => ({ ...event, actor_name: teamActors?.find((teamActor) => teamActor.user_id === event.actor_id)?.full_name ?? null })) } }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return fail(error) }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const actor = await requireWorkspacePermission('documents', 'signature_prepare')
    const { signatureId } = await context.params
    const body = await request.json()
    const pageNumber = Number(body.page_number)
    const x = Number(body.x_percent)
    const y = Number(body.y_percent)
    const width = Number(body.width_percent)
    const height = Number(body.height_percent)
    const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : null
    if (body.full_name !== undefined && (!fullName || fullName.length < 2 || fullName.length > 160)) {
      return NextResponse.json({ error: 'O nome do signatário deve conter entre 2 e 160 caracteres.' }, { status: 400 })
    }
    if (![pageNumber, x, y, width, height].every(Number.isFinite) || !Number.isInteger(pageNumber) || pageNumber < 1 || x < 0 || y < 0 || width < 1 || height < 1 || x + width > 100 || y + height > 100) {
      return NextResponse.json({ error: 'Posição ou dimensões inválidas.' }, { status: 400 })
    }
    const { data: process, error: processError } = await actor.supabase.from('document_signing_processes').select('id,status,page_count').eq('id', signatureId).maybeSingle()
    if (processError) throw processError
    if (!process || process.status !== 'draft') return NextResponse.json({ error: 'Este processo não pode mais ser preparado.' }, { status: 409 })
    if (pageNumber > process.page_count) return NextResponse.json({ error: 'A página selecionada não existe no documento.' }, { status: 400 })
    if (fullName) {
      const { data: signer, error: signerError } = await actor.supabase.from('document_signers').select('id').eq('process_id', signatureId).eq('user_id', actor.actorId).eq('status', 'pending').maybeSingle()
      if (signerError) throw signerError
      if (!signer) return NextResponse.json({ error: 'O signatário não pode mais ser alterado.' }, { status: 409 })
      const { error: nameError } = await actor.supabase.from('document_signers').update({ full_name: fullName }).eq('id', signer.id)
      if (nameError) throw nameError
      const { error: auditError } = await actor.supabase.from('document_signing_events').insert({ process_id: signatureId, signer_id: signer.id, actor_id: actor.actorId, event_type: 'prepared', event_data: { signer_name_updated: fullName }, ip_address: getClientAddress(request), user_agent: request.headers.get('user-agent')?.slice(0, 500) || null })
      if (auditError) throw auditError
    }
    const { error } = await actor.supabase.rpc('prepare_document_signing_field', {
      p_process_id: signatureId,
      p_actor_id: actor.actorId,
      p_page_number: pageNumber,
      p_x_percent: x,
      p_y_percent: y,
      p_width_percent: width,
      p_height_percent: height,
      p_ip_address: getClientAddress(request),
      p_user_agent: request.headers.get('user-agent')?.slice(0, 500) || null,
    })
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) { return fail(error) }
}

export async function POST(request: Request, context: RouteContext) {
  let finalStoragePath: string | undefined
  let processId: string | undefined
  try {
    const actor = await requireWorkspacePermission('documents', 'signature_sign')
    const { data: { user } } = await actor.sessionSupabase.auth.getUser()
    if (!user) throw new AdminApiError('Autenticação necessária.', 401)
    const { signatureId } = await context.params
    processId = signatureId
    const body = await request.json()
    if (body.confirmed !== true || body.consent_text !== consentText) return NextResponse.json({ error: 'Confirme expressamente a declaração antes de assinar.' }, { status: 400 })
    if (typeof body.signature_png !== 'string' || body.signature_png.length > 1_000_000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(body.signature_png) || !['drawn', 'typed'].includes(body.signature_type)) return NextResponse.json({ error: 'A assinatura desenhada é inválida.' }, { status: 400 })
    const { data: process, error: processError } = await actor.supabase.from('document_signing_processes').select('id,title,status,original_storage_path,original_sha256,page_count,created_by').eq('id', signatureId).maybeSingle()
    if (processError) throw processError
    if (!process || process.status !== 'draft') return NextResponse.json({ error: 'Este processo não está aguardando assinatura.' }, { status: 409 })
    const { data: signer, error: signerError } = await actor.supabase.from('document_signers').select('id,full_name,email,status').eq('process_id', signatureId).eq('user_id', actor.actorId).maybeSingle()
    if (signerError) throw signerError
    if (!signer || signer.status !== 'pending') return NextResponse.json({ error: 'Não há uma etapa pendente para este usuário.' }, { status: 403 })
    const { data: claimed, error: claimError } = await actor.supabase.from('document_signing_processes').update({ status: 'processing', updated_at: new Date().toISOString() }).eq('id', signatureId).eq('status', 'draft').select('id').maybeSingle()
    if (claimError) throw claimError
    if (!claimed) return NextResponse.json({ error: 'Este processo já foi iniciado ou concluído.' }, { status: 409 })
    const { data: field, error: fieldError } = await actor.supabase.from('document_signing_fields').select('page_number,x_percent,y_percent,width_percent,height_percent').eq('process_id', signatureId).eq('signer_id', signer.id).maybeSingle()
    if (fieldError || !field) throw new AdminApiError('Campo de assinatura não encontrado.', 409)

    const { data: originalFile, error: downloadError } = await actor.supabase.storage.from(bucket).download(process.original_storage_path)
    if (downloadError || !originalFile) throw new AdminApiError('Não foi possível recuperar o PDF original.', 503)
    const originalBytes = Buffer.from(await originalFile.arrayBuffer())
    const verifiedHash = createHash('sha256').update(originalBytes).digest('hex')
    if (verifiedHash !== process.original_sha256) throw new AdminApiError('A integridade do PDF original não confere.', 409)
    const pdf = await PDFDocument.load(originalBytes)
    if (field.page_number < 1 || field.page_number > pdf.getPageCount()) throw new AdminApiError('A página do campo não existe no PDF.', 409)
    const page = pdf.getPage(field.page_number - 1)
    const pageSize = page.getSize()
    const pngData = Buffer.from(body.signature_png.slice('data:image/png;base64,'.length), 'base64')
    const image = await pdf.embedPng(pngData)
    const width = pageSize.width * Number(field.width_percent) / 100
    const height = Math.min(pageSize.height * Number(field.height_percent) / 100, width / image.width * image.height)
    page.drawImage(image, {
      x: pageSize.width * Number(field.x_percent) / 100,
      y: pageSize.height * (1 - (Number(field.y_percent) + Number(field.height_percent)) / 100),
      width,
      height,
    })
    const finalBytes = Buffer.from(await pdf.save())
    const finalSha256 = createHash('sha256').update(finalBytes).digest('hex')
    finalStoragePath = `document-signatures/${signatureId}/signed.pdf`
    const upload = await actor.supabase.storage.from(bucket).upload(finalStoragePath, finalBytes, { contentType: 'application/pdf', upsert: false })
    if (upload.error) throw new AdminApiError('Não foi possível armazenar o PDF final.', 503)

    const { error: finalizeError } = await actor.supabase.rpc('finalize_document_signature', {
      p_process_id: signatureId,
      p_signer_id: signer.id,
      p_actor_id: actor.actorId,
      p_final_storage_path: finalStoragePath,
      p_final_sha256: finalSha256,
      p_consent_text: consentText,
      p_signature_type: body.signature_type,
      p_ip_address: getClientAddress(request),
      p_user_agent: request.headers.get('user-agent')?.slice(0, 500) || null,
      p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
    if (finalizeError) throw finalizeError
    return NextResponse.json({ ok: true, final_sha256: finalSha256, signed_at: new Date().toISOString() })
  } catch (error) {
    if (processId) {
      try {
        const actor = await requireWorkspacePermission('documents', 'signature_sign')
        const { data: current } = await actor.supabase.from('document_signing_processes').select('status,final_storage_path').eq('id', processId).maybeSingle()
        const finalized = current?.status === 'signed' && current.final_storage_path === finalStoragePath
        if (finalStoragePath && !finalized) await actor.supabase.storage.from(bucket).remove([finalStoragePath])
        if (current?.status === 'processing') await actor.supabase.from('document_signing_processes').update({ status: 'draft', updated_at: new Date().toISOString() }).eq('id', processId).eq('status', 'processing')
      } catch { /* Keep the original failure visible; an interrupted claim can be reviewed by an administrator. */ }
    }
    return fail(error)
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const actor = await requireWorkspacePermission('documents', 'signature_cancel')
    const { signatureId } = await context.params
    const { data: process, error: processError } = await actor.supabase.from('document_signing_processes').select('id,status,final_storage_path,final_sha256').eq('id', signatureId).maybeSingle()
    if (processError) throw processError
    if (!process) return NextResponse.json({ error: 'Processo não encontrado.' }, { status: 404 })

    if (process.status === 'signed') {
      if (!process.final_storage_path) return NextResponse.json({ error: 'O PDF assinado já foi removido.' }, { status: 409 })
      const { data: events, error: eventLookupError } = await actor.supabase.from('document_signing_events').select('event_data').eq('process_id', signatureId)
      if (eventLookupError) throw eventLookupError
      if ((events ?? []).some((event) => event.event_data?.action === 'signed_file_deleted')) return NextResponse.json({ error: 'O PDF assinado já foi removido.' }, { status: 409 })

      const { error: removeError } = await actor.supabase.storage.from(bucket).remove([process.final_storage_path])
      if (removeError) throw new AdminApiError('Não foi possível remover o PDF assinado.', 503)
      const { error: auditError } = await actor.supabase.from('document_signing_events').insert({
        process_id: signatureId,
        actor_id: actor.actorId,
        event_type: 'finalized',
        event_data: { action: 'signed_file_deleted', final_sha256: process.final_sha256, history_preserved: true },
        ip_address: getClientAddress(request),
        user_agent: request.headers.get('user-agent')?.slice(0, 500) || null,
      })
      if (auditError) throw auditError
      return NextResponse.json({ ok: true, signed_file_deleted: true })
    }

    const { data: cancelled, error } = await actor.supabase.rpc('cancel_document_signing_process', { p_process_id: signatureId, p_actor_id: actor.actorId, p_ip_address: getClientAddress(request), p_user_agent: request.headers.get('user-agent')?.slice(0, 500) || null })
    if (error) throw error
    if (!cancelled) return NextResponse.json({ error: 'Este processo não pode ser cancelado.' }, { status: 409 })
    return NextResponse.json({ ok: true })
  } catch (error) { return fail(error) }
}
