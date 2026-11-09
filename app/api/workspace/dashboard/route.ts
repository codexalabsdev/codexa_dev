import { NextResponse } from 'next/server'
import { AdminApiError } from '@/lib/supabase/server-client'
import { requireWorkspacePermission } from '@/lib/supabase/workspace-auth'
import { computeLevelState } from '@/lib/gamification'

export async function GET() {
  try {
    const actor = await requireWorkspacePermission('dashboard', 'view')
    const results = await Promise.all([
      actor.supabase.from('team_members').select('id,full_name,role_name,xp,level,status').order('xp', { ascending: false }).limit(5),
      actor.supabase.from('gamification_levels').select('level,name,min_xp').eq('is_active', true).order('min_xp'),
      actor.supabase.from('leads').select('id', { count: 'exact', head: true }),
      actor.supabase.from('clients').select('id', { count: 'exact', head: true }),
      actor.supabase.from('projects').select('id', { count: 'exact', head: true }),
      actor.supabase.from('support_tickets').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress', 'pending']),
      actor.supabase.from('contracts').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      actor.supabase.from('public_contact_messages').select('id', { count: 'exact', head: true }).eq('status', 'new'),
      actor.supabase.from('accounts_receivable').select('final_amount,paid_amount,due_date,status'),
    ])
    const [membersResult, levelsResult, leadsResult, clientsResult, projectsResult, ticketsResult, contractsResult, messagesResult, receivablesResult] = results
    if (membersResult.error) throw new AdminApiError('Não foi possível carregar o ranking da equipe.', 503)
    const levels = (levelsResult.data ?? []).filter((level) => (level as { is_active?: boolean | null }).is_active !== false)
    const ranking = (membersResult.data ?? []).map((member) => {
      const xp = Number(member.xp ?? 0)
      const milestone = computeLevelState(xp, levels)
      return { ...member, milestone_name: milestone.levelName, level: milestone.level }
    })
    const today = new Date()
    const isSettled = (status: unknown) => ['pago', 'recebido', 'quitado', 'paid', 'received', 'settled'].includes(String(status ?? '').trim().toLocaleLowerCase('pt-BR'))
    const receivableRows = receivablesResult.data ?? []
    const openReceivables = receivableRows.reduce((sum, row) => Math.max(Number(row.final_amount ?? 0) - Number(row.paid_amount ?? 0), 0) + sum, 0)
    const overdueReceivables = receivableRows.reduce((sum, row) => {
      const open = Math.max(Number(row.final_amount ?? 0) - Number(row.paid_amount ?? 0), 0)
      const due = row.due_date ? new Date(`${String(row.due_date).slice(0, 10)}T12:00:00`) : null
      return open > 0 && due && due < today && !isSettled(row.status) ? sum + open : sum
    }, 0)
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const receivedThisMonth = receivableRows.reduce((sum, row) => {
      const due = row.due_date ? new Date(`${String(row.due_date).slice(0, 10)}T12:00:00`) : null
      return due && due >= monthStart && due <= today ? sum + Number(row.paid_amount ?? 0) : sum
    }, 0)
    return NextResponse.json({ metrics: { team: membersResult.data?.filter((member) => ['active', 'ativo', 'enabled', 'habilitado'].includes(String(member.status).toLowerCase())).length ?? 0, leads: leadsResult.count ?? 0, clients: clientsResult.count ?? 0, projects: projectsResult.count ?? 0, tickets: ticketsResult.count ?? 0, contracts: contractsResult.count ?? 0, messages: messagesResult.count ?? 0, openReceivables, overdueReceivables, receivedThisMonth }, ranking, warnings: results.slice(2).filter((result) => result.error).map((result) => result.error?.message) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Dashboard overview failed:', error)
    return NextResponse.json({ error: 'Não foi possível carregar o resumo do dashboard.' }, { status: 500 })
  }
}
