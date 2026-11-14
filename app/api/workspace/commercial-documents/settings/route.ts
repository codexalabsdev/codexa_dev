import { NextResponse } from 'next/server'
import { AdminApiError } from '@/lib/supabase/server-client'
import { requireWorkspacePermission } from '@/lib/supabase/workspace-auth'

function fail(error: unknown) {
  if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error('Document issuer settings failed:', error)
  return NextResponse.json({ error: 'Não foi possível atualizar os dados do emissor.' }, { status: 500 })
}

export async function PUT(request: Request) {
  try {
    const actor = await requireWorkspacePermission('documents', 'configure')
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const fields = ['issuer_name', 'issuer_tax_id', 'issuer_email', 'issuer_phone', 'issuer_address', 'issuer_primary_color', 'issuer_secondary_color'] as const
    if (!body || fields.some((field) => typeof body[field] !== 'string')) return NextResponse.json({ error: 'Preencha os dados do emissor.' }, { status: 400 })
    const values = Object.fromEntries(fields.map((field) => [field, String(body[field]).trim()]))
    if (values.issuer_name.length < 2 || values.issuer_name.length > 160 || values.issuer_tax_id.length > 40 || values.issuer_email.length > 254 || values.issuer_phone.length > 60 || values.issuer_address.length > 500) return NextResponse.json({ error: 'Confira os limites dos dados informados.' }, { status: 400 })
    if (!/^#[0-9A-Fa-f]{6}$/.test(values.issuer_primary_color) || !/^#[0-9A-Fa-f]{6}$/.test(values.issuer_secondary_color)) return NextResponse.json({ error: 'Informe cores válidas no formato hexadecimal.' }, { status: 400 })
    if (values.issuer_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.issuer_email)) return NextResponse.json({ error: 'Informe um e-mail válido.' }, { status: 400 })
    const { data, error } = await actor.supabase.from('workspace_document_settings').upsert({ id: true, ...values, updated_by: actor.actorId, updated_at: new Date().toISOString() }).select('issuer_name,issuer_tax_id,issuer_email,issuer_phone,issuer_address,issuer_primary_color,issuer_secondary_color,updated_at').single()
    if (error) throw new AdminApiError('Não foi possível salvar. Confira se a migration pendente foi aplicada.', 503)
    return NextResponse.json({ settings: data })
  } catch (error) { return fail(error) }
}
