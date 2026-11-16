import { NextResponse } from 'next/server'
import { AdminApiError } from '@/lib/supabase/server-client'
import { getWorkspacePermissions, requireWorkspacePermission } from '@/lib/supabase/workspace-auth'
import { computeLevelState } from '@/lib/gamification'

function toLocalDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export async function GET() {
  try {
    const actor = await requireWorkspacePermission('dashboard', 'view')
    const permissions = await getWorkspacePermissions(actor)
    const canReadReceivables = permissions.has('*') || permissions.has('accounts_receivable:view')
    const canReadPayables = permissions.has('*') || permissions.has('accounts_payable:view')
    const results = await Promise.all([
      actor.supabase.from('team_members').select('id,full_name,role_name,xp,level,status').order('xp', { ascending: false }).limit(5),
      actor.supabase.from('gamification_levels').select('level,name,min_xp').eq('is_active', true).order('min_xp'),
      actor.supabase.from('leads').select('id', { count: 'exact', head: true }),
      actor.supabase.from('clients').select('id', { count: 'exact', head: true }),
      actor.supabase.from('projects').select('id', { count: 'exact', head: true }),
      actor.supabase.from('support_tickets').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress', 'pending']),
      actor.supabase.from('contracts').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      actor.supabase.from('public_contact_messages').select('id', { count: 'exact', head: true }).eq('status', 'new'),
      canReadReceivables ? actor.supabase.from('accounts_receivable').select('id,description,category,final_amount,paid_amount,due_date,status').order('due_date', { ascending: true }) : Promise.resolve({ data: [], error: null }),
      canReadPayables ? actor.supabase.from('accounts_payable').select('id,description,beneficiary,amount,paid_amount,due_date,status').order('due_date', { ascending: true }) : Promise.resolve({ data: [], error: null }),
      actor.supabase.from('project_activity').select('id,summary,actor_id,created_at').order('created_at', { ascending: false }).limit(8),
      canReadReceivables || canReadPayables ? actor.supabase.from('finance_payment_events').select('account_type,amount,payment_date').in('account_type', [...(canReadReceivables ? ['receivable'] : []), ...(canReadPayables ? ['payable'] : [])]).gte('payment_date', toLocalDateKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1))).lte('payment_date', toLocalDateKey(new Date())) : Promise.resolve({ data: [], error: null }),
      actor.supabase.from('projects').select('status'),
    ])
    const [membersResult, levelsResult, leadsResult, clientsResult, projectsResult, ticketsResult, contractsResult, messagesResult, receivablesResult, payablesResult, activityResult, paymentsResult, projectStatusResult] = results
    if (membersResult.error) throw new AdminApiError('Não foi possível carregar o ranking da equipe.', 503)
    const levels = (levelsResult.data ?? []).filter((level) => (level as { is_active?: boolean | null }).is_active !== false)
    const ranking = (membersResult.data ?? []).map((member) => {
      const xp = Number(member.xp ?? 0)
      const milestone = computeLevelState(xp, levels)
      return { ...member, milestone_name: milestone.levelName, level: milestone.level }
    })
    const today = new Date()
    const todayKey = toLocalDateKey(today)
    const inThirtyDays = toLocalDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30))
    const isSettled = (status: unknown) => ['pago', 'paga', 'recebido', 'recebida', 'quitado', 'paid', 'received', 'settled'].includes(String(status ?? '').trim().toLocaleLowerCase('pt-BR'))
    const isCancelled = (status: unknown) => ['cancelado', 'cancelada', 'canceled', 'cancelled'].includes(String(status ?? '').trim().toLocaleLowerCase('pt-BR'))
    const effectiveStatus = (status: unknown, dueDate: string | null) => isSettled(status) ? 'Pago' : isCancelled(status) ? 'Cancelado' : dueDate && dueDate < todayKey ? 'Em atraso' : String(status || 'Pendente')
    const receivableRows = receivablesResult.data ?? []
    const payableRows = payablesResult.data ?? []
    const getOpen = (total: unknown, paid: unknown, status: unknown) => isSettled(status) || isCancelled(status) ? 0 : Math.max(Number(total ?? 0) - Number(paid ?? 0), 0)
    const receivableOpen = receivableRows.map((row) => ({ id: row.id, description: row.description || 'Receita', kind: 'receita', party: row.category || 'Sem categoria', due_date: row.due_date, total: Number(row.final_amount ?? 0), paid: Number(row.paid_amount ?? 0), amount: getOpen(row.final_amount, row.paid_amount, row.status), status: effectiveStatus(row.status, row.due_date) }))
    const payableOpen = payableRows.map((row) => ({ id: row.id, description: row.description || 'Despesa', kind: 'despesa', party: row.beneficiary || 'Beneficiário não informado', due_date: row.due_date, total: Number(row.amount ?? 0), paid: Number(row.paid_amount ?? 0), amount: getOpen(row.amount, row.paid_amount, row.status), status: effectiveStatus(row.status, row.due_date) }))
    const financialItems = [...receivableOpen, ...payableOpen]
    const openReceivables = receivableOpen.reduce((sum, row) => sum + row.amount, 0)
    const overdueReceivables = receivableOpen.filter((row) => row.due_date && row.due_date < todayKey).reduce((sum, row) => sum + row.amount, 0)
    const openPayables = payableOpen.reduce((sum, row) => sum + row.amount, 0)
    const overduePayables = payableOpen.filter((row) => row.due_date && row.due_date < todayKey).reduce((sum, row) => sum + row.amount, 0)
    const receivedThisMonth = (paymentsResult.data ?? []).filter((event) => event.account_type === 'receivable').reduce((sum, event) => sum + Number(event.amount ?? 0), 0)
    const upcoming = financialItems.filter((row) => row.amount > 0 && row.due_date && row.due_date >= todayKey && row.due_date <= inThirtyDays).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 8)
    const overdueItems = financialItems.filter((row) => row.amount > 0 && row.due_date && row.due_date < todayKey).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 8)
    const activityRows = activityResult.data ?? []
    const actorIds = [...new Set(activityRows.map((event) => event.actor_id).filter((id): id is string => Boolean(id)))]
    const actorResult = actorIds.length ? await actor.supabase.from('team_members').select('user_id,full_name').in('user_id', actorIds) : { data: [], error: null }
    const actorNames = new Map((actorResult.data ?? []).map((member) => [member.user_id, member.full_name]))
    const activity = activityRows.map((event) => ({ ...event, actor_name: event.actor_id ? actorNames.get(event.actor_id) ?? 'Membro da equipe' : 'Sistema' }))
    const projectStatus = Object.entries((projectStatusResult.data ?? []).reduce<Record<string, number>>((counts, row) => { const status = String(row.status ?? 'Sem status'); counts[status] = (counts[status] ?? 0) + 1; return counts }, {})).map(([status, count]) => ({ status, count }))
    return NextResponse.json({ metrics: { team: membersResult.data?.filter((member) => ['active', 'ativo', 'enabled', 'habilitado'].includes(String(member.status).toLowerCase())).length ?? 0, leads: leadsResult.count ?? 0, clients: clientsResult.count ?? 0, projects: projectsResult.count ?? 0, tickets: ticketsResult.count ?? 0, contracts: contractsResult.count ?? 0, messages: messagesResult.count ?? 0, openReceivables, overdueReceivables, openPayables, overduePayables, receivedThisMonth }, ranking, activity, upcoming, overdueItems, financialItems, projectStatus, warnings: results.slice(2).filter((result) => result.error).map((result) => result.error?.message) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Dashboard overview failed:', error)
    return NextResponse.json({ error: 'Não foi possível carregar o resumo do dashboard.' }, { status: 500 })
  }
}
