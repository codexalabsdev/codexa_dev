import { createHash } from 'node:crypto'
import JSZip from 'jszip'
import { NextResponse } from 'next/server'
import { AdminApiError } from '@/lib/supabase/server-client'
import { requireWorkspacePermission } from '@/lib/supabase/workspace-auth'

const bucket = 'private-documents'
type RouteContext = { params: Promise<{ signatureId: string }> }

export async function GET(_request: Request, context: RouteContext) {
  try {
    const actor = await requireWorkspacePermission('documents', 'signature_evidence')
    const { signatureId } = await context.params
    const { data: process, error } = await actor.supabase.from('document_signing_processes').select('id,title,status,original_storage_path,final_storage_path,original_sha256,final_sha256,page_count,created_by,signed_at,created_at').eq('id', signatureId).maybeSingle()
    if (error) throw new AdminApiError('Não foi possível consultar o processo.', 503)
    if (!process || process.status !== 'signed' || !process.final_storage_path || !process.final_sha256) return NextResponse.json({ error: 'O pacote de evidências fica disponível após a assinatura.' }, { status: 409 })

    const [originalResult, finalResult, signersResult, fieldsResult, eventsResult] = await Promise.all([
      actor.supabase.storage.from(bucket).download(process.original_storage_path),
      actor.supabase.storage.from(bucket).download(process.final_storage_path),
      actor.supabase.from('document_signers').select('full_name,email,signer_type,signing_order,status,authentication_method,consent_text,signed_at').eq('process_id', signatureId).order('signing_order'),
      actor.supabase.from('document_signing_fields').select('page_number,x_percent,y_percent,width_percent,height_percent,field_type,status').eq('process_id', signatureId),
      actor.supabase.from('document_signing_events').select('actor_id,event_type,event_data,ip_address,user_agent,created_at').eq('process_id', signatureId).order('created_at', { ascending: true }),
    ])
    if (originalResult.error || !originalResult.data || finalResult.error || !finalResult.data || signersResult.error || fieldsResult.error || eventsResult.error) throw new AdminApiError('Não foi possível reunir os arquivos e evidências do processo.', 503)
    const original = Buffer.from(await originalResult.data.arrayBuffer())
    const signed = Buffer.from(await finalResult.data.arrayBuffer())
    const originalSha256 = createHash('sha256').update(original).digest('hex')
    const finalSha256 = createHash('sha256').update(signed).digest('hex')
    if (originalSha256 !== process.original_sha256 || finalSha256 !== process.final_sha256) throw new AdminApiError('A integridade dos arquivos não confere com os hashes registrados.', 409)

    const actorIds = [...new Set((eventsResult.data ?? []).map((event) => event.actor_id).filter((id): id is string => Boolean(id)))]
    const { data: teamActors, error: teamActorsError } = actorIds.length
      ? await actor.supabase.from('team_members').select('user_id,full_name').in('user_id', actorIds)
      : { data: [], error: null }
    if (teamActorsError) throw new AdminApiError('Não foi possível identificar os responsáveis pelas evidências.', 503)

    const zip = new JSZip()
    zip.file('documento-original.pdf', original)
    zip.file('documento-assinado.pdf', signed)
    zip.file('evidencias.json', JSON.stringify({
      schema: 'codexa.document-signature-evidence.v1',
      process: { id: process.id, title: process.title, status: process.status, page_count: process.page_count, created_at: process.created_at, signed_at: process.signed_at, created_by: process.created_by },
      integrity: { algorithm: 'SHA-256', original: originalSha256, signed: finalSha256, verified_at: new Date().toISOString() },
      signers: signersResult.data ?? [],
      fields: fieldsResult.data ?? [],
      events: (eventsResult.data ?? []).map((event) => ({ ...event, actor_name: teamActors?.find((teamActor) => teamActor.user_id === event.actor_id)?.full_name ?? null })),
    }, null, 2))
    const archive = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } })
    return new NextResponse(archive, { headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="codexa-assinatura-${signatureId}.zip"`,
      'Content-Length': String(archive.byteLength),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    } })
  } catch (error) {
    if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Document signing evidence package failed:', error)
    return NextResponse.json({ error: 'Não foi possível gerar o pacote de evidências.' }, { status: 500 })
  }
}
