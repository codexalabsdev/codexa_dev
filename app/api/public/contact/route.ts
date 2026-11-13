import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server-client'

const sectors = ['Suporte Técnico', 'Financeiro', 'Comercial', 'Operações'] as const
const activeStatuses = new Set(['active', 'ativo', 'enabled', 'habilitado'])
const roleSectors: Record<string, (typeof sectors)[number]> = {
  suporte: 'Suporte Técnico',
  financeiro: 'Financeiro',
  comercial: 'Comercial',
  operacional: 'Operações',
}

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('team_members')
    .select('id,full_name,email,phone,job_title,department,role_name,status')
    .order('full_name')

  if (error) {
    return NextResponse.json({ error: 'Não foi possível carregar os contatos da equipe.' }, { status: 503 })
  }

  const employees = new Map<string, { name: string; sector: string; jobTitle: string | null; email: string | null; phone: string | null }>()

  for (const member of data ?? []) {
    const status = String(member.status ?? '').trim().toLowerCase().replaceAll('"', '')
    if (!activeStatuses.has(status)) continue

    const department = String(member.department ?? '').trim()
    const sector = sectors.find((item) => item.toLowerCase() === department.toLowerCase())
      ?? roleSectors[String(member.role_name ?? '').trim().toLowerCase()]
    if (!sector) continue

    employees.set(member.id, {
      name: String(member.full_name ?? '').trim() || 'Equipe Codexa',
      sector,
      jobTitle: String(member.job_title ?? '').trim() || null,
      email: String(member.email ?? '').trim() || null,
      phone: String(member.phone ?? '').trim() || null,
    })
  }

  return NextResponse.json(
    { employees: [...employees.values()] },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
