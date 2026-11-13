import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server-client'

const sectors = ['Suporte Técnico', 'Financeiro', 'Comercial', 'Operações'] as const
const activeStatuses = new Set(['active', 'ativo', 'enabled', 'habilitado'])
type ContactMemberRow = { id: string; full_name: string | null; email: string | null; role_name: string | null; status: string | null; phone_e164?: string | null; whatsapp_enabled?: boolean | null }

function isMissingContactSchemaError(error: { code?: string | null; message?: string | null } | null | undefined) {
  return Boolean(error && (
    ['42703', 'PGRST204', 'PGRST205'].includes(error.code ?? '')
    || /phone_e164|whatsapp_enabled/i.test(error.message ?? '')
  ))
}

const roleSectors: Record<string, (typeof sectors)[number]> = {
  suporte: 'Suporte Técnico',
  financeiro: 'Financeiro',
  comercial: 'Comercial',
  operacional: 'Operações',
}

export async function POST(request: Request) {
  let body: { code?: unknown }
  try {
    body = await request.json() as { code?: unknown }
  } catch {
    return NextResponse.json({ error: 'Código inválido ou revogado.' }, { status: 401 })
  }

  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  if (!/^CX-[A-F0-9]{32}$/.test(code)) {
    return NextResponse.json({ error: 'Código inválido ou revogado.' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data: validCode, error: codeError } = await supabase
    .from('client_contact_codes')
    .select('id')
    .eq('code', code)
    .is('revoked_at', null)
    .maybeSingle()

  if (codeError) {
    const schemaUnavailable = ['42P01', 'PGRST205'].includes(codeError.code ?? '')
    return NextResponse.json(
      { error: schemaUnavailable ? 'A estrutura de códigos de cliente ainda não foi aplicada no Supabase.' : 'Não foi possível validar o código.' },
      { status: 503 },
    )
  }
  if (!validCode) {
    return NextResponse.json({ error: 'Código inválido ou revogado.' }, { status: 401 })
  }

  const memberResult = await supabase
    .from('team_members')
    .select('id,full_name,email,role_name,status,phone_e164,whatsapp_enabled')
    .order('full_name')
  let members = memberResult.data as ContactMemberRow[] | null
  if (memberResult.error && isMissingContactSchemaError(memberResult.error)) {
    const fallback = await supabase.from('team_members').select('id,full_name,email,role_name,status').order('full_name')
    if (fallback.error) return NextResponse.json({ error: 'Não foi possível carregar os contatos da equipe.' }, { status: 503 })
    members = fallback.data as ContactMemberRow[] | null
  } else if (memberResult.error) {
    return NextResponse.json({ error: 'Não foi possível carregar os contatos da equipe.' }, { status: 503 })
  }

  const employees = new Map<string, { name: string; sector: string; jobTitle: null; email: string | null; phone: string | null; whatsappEnabled: boolean }>()
  for (const member of members ?? []) {
    const status = String(member.status ?? '').trim().toLowerCase().replaceAll('"', '')
    if (!activeStatuses.has(status)) continue

    const sector = roleSectors[String(member.role_name ?? '').trim().toLowerCase()]
    if (!sector) continue

    const candidatePhone = typeof member.phone_e164 === 'string' && /^\+[1-9]\d{7,14}$/.test(member.phone_e164) ? member.phone_e164 : null
    employees.set(member.id, {
      name: String(member.full_name ?? '').trim() || 'Equipe Codexa',
      sector,
      jobTitle: null,
      email: String(member.email ?? '').trim() || null,
      phone: candidatePhone,
      whatsappEnabled: Boolean(candidatePhone && member.whatsapp_enabled),
    })
  }

  return NextResponse.json(
    { employees: [...employees.values()] },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
