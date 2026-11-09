import { get } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { AdminApiError } from '@/lib/supabase/server-client'
import { requireWorkspacePermission } from '@/lib/supabase/workspace-auth'

export async function GET(request: Request) {
  try {
    const actor = await requireWorkspacePermission('support', 'read')
    const pathname = new URL(request.url).searchParams.get('pathname')
    if (!pathname || !pathname.startsWith('support/')) return NextResponse.json({ error: 'Anexo inválido.' }, { status: 400 })
    const { data: attachment, error } = await actor.supabase.from('support_attachments').select('pathname,content_type,filename').eq('pathname', pathname).maybeSingle()
    if (error || !attachment) return NextResponse.json({ error: 'Anexo não encontrado.' }, { status: 404 })
    const result = await get(attachment.pathname, { access: 'private', ifNoneMatch: request.headers.get('if-none-match') ?? undefined })
    if (!result) return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 })
    if (result.statusCode === 304) return new NextResponse(null, { status: 304, headers: { ETag: result.blob.etag, 'Cache-Control': 'private, no-cache' } })
    return new NextResponse(result.stream, { headers: { 'Content-Type': attachment.content_type, 'Content-Disposition': `attachment; filename="${attachment.filename.replace(/"/g, '')}"`, ETag: result.blob.etag, 'Cache-Control': 'private, no-cache' } })
  } catch (error) {
    if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Support attachment download failed:', error)
    return NextResponse.json({ error: 'Não foi possível baixar o anexo.' }, { status: 500 })
  }
}
