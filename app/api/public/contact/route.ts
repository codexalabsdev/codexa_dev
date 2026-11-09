import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server-client'

const sectors = new Set(['Comercial', 'Suporte Técnico', 'Financeiro', 'Operações'])
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function GET(request: Request) {
  const sector = new URL(request.url).searchParams.get('sector') ?? ''
  if (!sectors.has(sector)) return NextResponse.json({ employees: [] })
  const supabase = createServiceClient()
  const { data, error } = await supabase.from('team_members').select('id, full_name, role_name, status')
  if (error) return NextResponse.json({ error: 'Não foi possível carregar os destinatários.' }, { status: 500 })
  const sectorRole = sector === 'Suporte Técnico' ? 'suporte' : sector === 'Operações' ? 'operacional' : sector.toLowerCase()
  const activeStatuses = new Set(['active', 'ativo', 'enabled', 'habilitado'])
  const uniqueEmployees = new Map<string, { id: string; name: string; sector: string }>()
  for (const member of data ?? []) {
    const role = String(member.role_name ?? '').trim().toLowerCase()
    const status = String(member.status ?? '').trim().toLowerCase().replaceAll('"', '')
    if (!activeStatuses.has(status) || role !== sectorRole) continue
    const key = String(member.full_name ?? '').trim().toLowerCase()
    if (!uniqueEmployees.has(key)) uniqueEmployees.set(key, { id: member.id, name: member.full_name ?? 'Equipe Codexa', sector })
  }
  const employees = [...uniqueEmployees.values()]
  return NextResponse.json({ employees })
}

export async function POST(request: Request) {
  const form = await request.formData()
  const kind = String(form.get('kind') ?? '')
  const name = String(form.get('name') ?? '').trim()
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  const subject = String(form.get('subject') ?? '').trim()
  const body = String(form.get('body') ?? '').trim()
  const company = String(form.get('company') ?? '').trim() || null
  if (!['message', 'support'].includes(kind) || name.length < 2 || name.length > 120 || !emailPattern.test(email) || subject.length < 2 || subject.length > 180 || body.length < 10 || body.length > 5000 || form.get('consent') !== 'on') return NextResponse.json({ error: 'Revise os campos obrigatórios e o consentimento.' }, { status: 400 })
  const supabase = createServiceClient()
  if (kind === 'message') {
    const sector = String(form.get('sector') ?? '')
    if (!sectors.has(sector)) return NextResponse.json({ error: 'Escolha um setor válido.' }, { status: 400 })
    const employeeId = String(form.get('employee_id') ?? '') || null
    let recipientUserId: string | null = null
    if (employeeId) {
      const { data } = await supabase.from('team_members').select('id, user_id, role_name, status').eq('id', employeeId).maybeSingle()
      const expectedRole = sector === 'Suporte Técnico' ? 'suporte' : sector === 'Operações' ? 'operacional' : sector.toLowerCase()
      const normalizedStatus = String(data?.status ?? '').trim().toLowerCase().replaceAll('"', '')
      if (!data || !data.user_id || !['active', 'ativo', 'enabled', 'habilitado'].includes(normalizedStatus) || String(data.role_name ?? '').trim().toLowerCase() !== expectedRole) return NextResponse.json({ error: 'O destinatário não está disponível para receber mensagens.' }, { status: 400 })
      recipientUserId = data.user_id
    }
    const { data: savedMessage, error } = await supabase.from('public_contact_messages').insert({ sender_name: name, sender_email: email, company, sector, employee_id: employeeId, subject, body, source: 'landing_page' }).select('id').single()
    if (error || !savedMessage) return NextResponse.json({ error: 'Não foi possível registrar a mensagem.' }, { status: 500 })
    if (!recipientUserId) return NextResponse.json({ error: 'O destinatário não possui uma conta ativa para receber a mensagem.' }, { status: 409 })
    const { error: notificationError } = await supabase.from('notifications').insert({ recipient_id: recipientUserId, notification_type: 'public_contact_message', entity_type: 'public_contact_message', entity_id: savedMessage.id, message: `Nova mensagem de ${name}: ${subject}`, link_path: '/admin' })
    if (notificationError) return NextResponse.json({ error: 'A mensagem foi registrada, mas não foi possível entregá-la ao destinatário.' }, { status: 502 })
  } else {
    const category = String(form.get('category') ?? 'Técnico')
    const { error } = await supabase.from('public_support_requests').insert({ requester_name: name, requester_email: email, company, category, subject, description: body, urgency: 'normal', status: 'pending_review', source: 'landing_page' })
    if (error) return NextResponse.json({ error: 'Não foi possível registrar a solicitação.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
