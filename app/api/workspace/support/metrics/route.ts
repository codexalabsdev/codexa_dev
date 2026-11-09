import { NextResponse } from 'next/server'
import { AdminApiError } from '@/lib/supabase/server-client'
import { requireWorkspacePermission } from '@/lib/supabase/workspace-auth'

function average(values: number[]) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0
}

export async function GET(request: Request) {
  try {
    const actor = await requireWorkspacePermission('support', 'read')
    const url = new URL(request.url)
    const period = url.searchParams.get('period') ?? '30d'
    const sector = url.searchParams.get('sector')
    const priority = url.searchParams.get('priority')
    const status = url.searchParams.get('status')
    const responsible = url.searchParams.get('responsible')
    const from = new Date()
    if (period === '7d') from.setDate(from.getDate() - 7)
    else if (period === '90d') from.setDate(from.getDate() - 90)
    else from.setDate(from.getDate() - 30)

    let query = actor.supabase
      .from('support_tickets')
      .select('id,status,priority,sector,technical_responsible_id,created_at,first_response_at,resolved_at,due_at,archived_at')
      .is('archived_at', null)
      .gte('created_at', from.toISOString())
    if (sector) query = query.eq('sector', sector)
    if (priority) query = query.eq('priority', priority)
    if (status) query = query.eq('status', status)
    if (responsible) query = query.eq('technical_responsible_id', responsible)
    const { data, error } = await query
    if (error) throw new AdminApiError('Não foi possível carregar as métricas de suporte.', 503)

    const tickets = data ?? []
    const resolved = tickets.filter((ticket) => Boolean(ticket.resolved_at))
    const responseTimes = tickets.filter((ticket) => ticket.first_response_at).map((ticket) => new Date(ticket.first_response_at!).getTime() - new Date(ticket.created_at).getTime())
    const resolutionTimes = resolved.map((ticket) => new Date(ticket.resolved_at!).getTime() - new Date(ticket.created_at).getTime())
    const slaBreaches = tickets.filter((ticket) => ticket.due_at && new Date(ticket.due_at).getTime() < Date.now() && !['Resolvido', 'Fechado', 'Cancelado'].includes(ticket.status)).length

    return NextResponse.json({
      period,
      total: tickets.length,
      open: tickets.filter((ticket) => !['Resolvido', 'Fechado', 'Cancelado'].includes(ticket.status)).length,
      resolved: resolved.length,
      slaBreaches,
      averageFirstResponseMinutes: Math.round(average(responseTimes) / 60000),
      averageResolutionHours: Math.round(average(resolutionTimes) / 3600000),
      resolutionRate: tickets.length ? Math.round((resolved.length / tickets.length) * 100) : 0,
      overdue: slaBreaches,
      byPriority: Object.entries(Object.groupBy(tickets, (ticket) => ticket.priority)).map(([name, rows]) => ({ name, count: rows?.length ?? 0 })),
      byResponsible: Object.entries(Object.groupBy(tickets, (ticket) => ticket.technical_responsible_id ?? 'triagem')).map(([name, rows]) => ({ name, count: rows?.length ?? 0 })),
      byStatus: Object.entries(Object.groupBy(tickets, (ticket) => ticket.status)).map(([status, rows]) => ({ status, count: rows?.length ?? 0 })),
      bySector: Object.entries(Object.groupBy(tickets, (ticket) => ticket.sector)).map(([name, rows]) => ({ name, count: rows?.length ?? 0 })),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Support metrics failed:', error)
    return NextResponse.json({ error: 'Não foi possível carregar as métricas de suporte.' }, { status: 500 })
  }
}
