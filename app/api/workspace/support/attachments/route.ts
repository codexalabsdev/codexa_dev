import { del, put } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { AdminApiError } from '@/lib/supabase/server-client'
import { requireWorkspacePermission } from '@/lib/supabase/workspace-auth'

const MAX_FILE_SIZE = 10 * 1024 * 1024

export async function GET(request: Request) {
  try {
    const actor = await requireWorkspacePermission('support', 'read')
    const ticketId = new URL(request.url).searchParams.get('ticketId')
    if (!ticketId) return NextResponse.json({ error: 'Chamado obrigatório.' }, { status: 400 })
    const { data, error } = await actor.supabase.from('support_attachments').select('id,ticket_id,filename,content_type,byte_size,created_at').eq('ticket_id', ticketId).order('created_at', { ascending: false })
    if (error) throw new AdminApiError('Não foi possível carregar os anexos.', 503)
    return NextResponse.json(data ?? [], { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'Não foi possível carregar os anexos.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  let pathname: string | null = null
  try {
    const actor = await requireWorkspacePermission('support', 'update')
    const formData = await request.formData()
    const ticketId = String(formData.get('ticketId') ?? '')
    const file = formData.get('file')
    if (!ticketId || !(file instanceof File)) return NextResponse.json({ error: 'Chamado e arquivo são obrigatórios.' }, { status: 400 })
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'O arquivo deve ter entre 1 byte e 10 MB.' }, { status: 400 })

    const { data: ticket, error: ticketError } = await actor.supabase.from('support_tickets').select('id').eq('id', ticketId).maybeSingle()
    if (ticketError || !ticket) return NextResponse.json({ error: 'Chamado não encontrado.' }, { status: 404 })

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'anexo'
    const blob = await put(`support/${ticketId}/${crypto.randomUUID()}-${safeName}`, file, { access: 'private', addRandomSuffix: false })
    pathname = blob.pathname
    const { data: userData } = await actor.supabase.auth.getUser()
    const { data: attachment, error } = await actor.supabase.from('support_attachments').insert({
      ticket_id: ticketId,
      pathname: blob.pathname,
      filename: safeName,
      content_type: file.type || 'application/octet-stream',
      byte_size: file.size,
      uploaded_by: userData.user?.id ?? null,
    }).select('id,ticket_id,filename,content_type,byte_size,created_at').single()
    if (error) throw new AdminApiError('Não foi possível registrar o anexo.', 503)
    return NextResponse.json(attachment, { status: 201 })
  } catch (error) {
    if (pathname) await del(pathname).catch(() => undefined)
    if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Support attachment upload failed:', error)
    return NextResponse.json({ error: 'Não foi possível enviar o anexo.' }, { status: 500 })
  }
}
