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
      actor.supabase.from('accounts_receivable').select('description,final_amount,paid_amount,due_date,status').order('due_date', { ascending: true }).limit(20),
      actor.supabase.from('project_activity').select('id,summary,created_at').order('created_at', { ascending: false }).limit(5),
      actor.supabase.from('projects').select('status'),
    ])
    const [membersResult, levelsResult, leadsResult, clientsResult, projectsResult, ticketsResult, contractsResult, messagesResult, receivablesResult, activityResult, projectStatusResult] = results
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
    const upcoming = (receivablesResult.data ?? []).filter((row) => {
      const due = row.due_date ? new Date(`${String(row.due_date).slice(0, 10)}T12:00:00`) : null
      return due && due >= today && due <= new Date(today.getTime() + 30 * 86400000) && !isSettled(row.status) && Number(row.final_amount ?? 0) - Number(row.paid_amount ?? 0) > 0
    }).slice(0, 5).map((row) => ({ description: row.description || 'Lançamento financeiro', due_date: row.due_date, amount: Math.max(Number(row.final_amount ?? 0) - Number(row.paid_amount ?? 0), 0) }))
    const projectStatus = Object.entries((projectStatusResult.data ?? []).reduce<Record<string, number>>((counts, row) => { const status = String(row.status ?? 'Sem status'); counts[status] = (counts[status] ?? 0) + 1; return counts }, {})).map(([status, count]) => ({ status, count }))
    return NextResponse.json({ metrics: { team: membersResult.data?.filter((member) => ['active', 'ativo', 'enabled', 'habilitado'].includes(String(member.status).toLowerCase())).length ?? 0, leads: leadsResult.count ?? 0, clients: clientsResult.count ?? 0, projects: projectsResult.count ?? 0, tickets: ticketsResult.count ?? 0, contracts: contractsResult.count ?? 0, messages: messagesResult.count ?? 0, openReceivables, overdueReceivables, receivedThisMonth }, ranking, activity: activityResult.data ?? [], upcoming, projectStatus, warnings: results.slice(2).filter((result) => result.error).map((result) => result.error?.message) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Dashboard overview failed:', error)
    return NextResponse.json({ error: 'Não foi possível carregar o resumo do dashboard.' }, { status: 500 })
  }
}
