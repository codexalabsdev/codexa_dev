'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ClipboardList, Eye, FolderKanban, Headphones, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { ProjectListWorkspace } from '@/components/project-list-workspace'
import { hasWorkspaceAccess } from '@/lib/workspace-access'

type Module = 'projects' | 'change_requests' | 'support_tickets'
type ChangeRequest = { id: string; title: string; requester: string; description: string | null; status: string; priority: string; category: string; effort_hours: number | null; due_at: string | null; decision_notes: string | null; updated_at: string | null }
const changeRequestStatuses = ['Recebida', 'Em análise', 'Aprovada', 'Em desenvolvimento', 'Em validação', 'Concluída', 'Recusada', 'Cancelada']
const changeRequestPriorities = ['Baixa', 'Média', 'Alta', 'Crítica']
type Ticket = {
  id: string
  ticket_number: string
  subject: string
  requester: string
  description: string | null
  status: string
  priority: string
  category: string
  sector: string
  technical_responsible_id: string | null
  due_at: string | null
  scheduled_at: string | null
  resolution: string | null
  resolved_at: string | null
  first_response_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  closed_at?: string | null
  archived_at?: string | null
}
type Member = { id: string; user_id?: string | null; full_name: string; role_name: string; status?: string | null }
type OperationalRecord = ChangeRequest | Ticket

type SupportMessage = {
  id: string
  ticket_id: string
  message_type: 'internal' | 'external' | 'system' | string
  content: string
  created_at: string
  actor_name?: string | null
  author_name?: string | null
  created_by?: string | null
}

type SupportAttachment = { id: string; ticket_id: string; pathname: string; filename: string; content_type: string; byte_size: number; created_at: string }
type SupportViewMode = 'lista' | 'kanban'

const modules = [
  ['projects', FolderKanban, 'Projetos'],
  ['change_requests', ClipboardList, 'Alterações'],
  ['support_tickets', Headphones, 'Suporte'],
] as const
const inputClass = 'w-full rounded-lg border border-white/10 bg-[#151b24] p-3 text-sm text-white'
const supportStatusOrder = ['Novo', 'Triagem', 'Aberto', 'Em atendimento', 'Aguardando cliente', 'Aguardando equipe interna', 'Aguardando terceiro', 'Em desenvolvimento', 'Em validação', 'Agendado', 'Resolvido', 'Fechado', 'Cancelado']
const supportStatuses = [...supportStatusOrder]
const supportSectors = ['Suporte Técnico', 'Financeiro', 'Comercial', 'Operações']
const supportPriorities = ['Baixa', 'Média', 'Alta', 'Crítica']
const supportPriorityColors = {
  Baixa: 'bg-emerald-500/10 text-emerald-300 border border-emerald-400/20',
  Média: 'bg-amber-500/10 text-amber-300 border border-amber-400/20',
  Alta: 'bg-orange-500/10 text-orange-300 border border-orange-400/20',
  Crítica: 'bg-rose-500/10 text-rose-300 border border-rose-400/20',
  Urgente: 'bg-rose-500/10 text-rose-300 border border-rose-400/20',
}
const supportStatusColors = {
  Novo: 'bg-slate-500/10 text-slate-300',
  Triagem: 'bg-cyan-500/10 text-cyan-300',
  Aberto: 'bg-blue-500/10 text-blue-300',
  'Em atendimento': 'bg-violet-500/10 text-violet-300',
  'Aguardando cliente': 'bg-amber-500/10 text-amber-300',
  'Aguardando equipe interna': 'bg-orange-500/10 text-orange-300',
  Agendado: 'bg-indigo-500/10 text-indigo-300',
  Resolvido: 'bg-emerald-500/10 text-emerald-300',
  Fechado: 'bg-slate-500/10 text-slate-200',
  Cancelado: 'bg-red-500/10 text-red-300',
}

function normalizeSupportStatus(value: string | null | undefined) {
  const status = String(value ?? '').trim()
  if (!status) return 'Novo'
  const normalized = status.toLowerCase()
  const map: Record<string, string> = {
    novo: 'Novo',
    triagem: 'Triagem',
    aberto: 'Aberto',
    'em andamento': 'Em atendimento',
    'em atendimento': 'Em atendimento',
    'aguardando cliente': 'Aguardando cliente',
    'aguardando equipe': 'Aguardando equipe interna',
    'aguardando equipe interna': 'Aguardando equipe interna',
    agendado: 'Agendado',
    resolvido: 'Resolvido',
    fechado: 'Fechado',
    cancelado: 'Cancelado',
    pendente: 'Aguardando cliente',
    pending: 'Aguardando cliente',
    in_progress: 'Em atendimento',
    inprogress: 'Em atendimento',
    open: 'Aberto',
    closed: 'Fechado',
    resolved: 'Resolvido',
  }
  return map[normalized] ?? status
}

function rolesForSector(sector: string) {
  if (sector === 'Suporte Técnico') return ['suporte']
  if (sector === 'Financeiro') return ['financeiro']
  if (sector === 'Comercial') return ['comercial']
  if (sector === 'Operações') return ['operacional']
  return []
}

async function awardXp(actionKey: string, entityType: string, entityId: string) {
  await fetch('/api/workspace/xp/award', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actionKey, entityType, entityId }) })
}

function toLocalDateTime(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

function toIsoDateTime(value: FormDataEntryValue | undefined) {
  if (typeof value !== 'string' || !value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}

function getPeriodStart(period: string) {
  const now = new Date()
  if (!period) return null
  if (period === '7d') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  if (period === '30d') return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  if (period === '90d') return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
  return null
}

export function OperationsWorkspace({ initialModule = 'projects', permissions }: { initialModule?: Module; permissions: string[] }) {
  const [module, setModule] = useState<Module>(initialModule)
  const [requests, setRequests] = useState<ChangeRequest[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [sectorFilter, setSectorFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [responsibleFilter, setResponsibleFilter] = useState('')
  const [periodFilter, setPeriodFilter] = useState('')
  const [supportView, setSupportView] = useState<SupportViewMode>('lista')
  const [editingSector, setEditingSector] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modal, setModal] = useState(false)
  const [record, setRecord] = useState<OperationalRecord | null>(null)
  const [editingRecord, setEditingRecord] = useState(false)
  const [ticketMessages, setTicketMessages] = useState<SupportMessage[]>([])
  const [ticketAttachments, setTicketAttachments] = useState<SupportAttachment[]>([])
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [attachmentSaving, setAttachmentSaving] = useState(false)
  const [messageDraft, setMessageDraft] = useState('')
  const [messageType, setMessageType] = useState<'internal' | 'external'>('internal')
  const [messageSaving, setMessageSaving] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const permissionModule = module === 'support_tickets' ? 'support' : module
  const canCreate = permissions.includes('*') || permissions.includes(`${permissionModule}:create`)
  const canUpdate = permissions.includes('*') || permissions.includes(`${permissionModule}:update`)
  const canDelete = permissions.includes('*') || permissions.includes(`${permissionModule}:delete`)
  const canAssign = permissions.includes('*') || permissions.includes('support:assign')
  const canDeleteTicket = (item: Ticket) => canDelete || Boolean(currentUserId && item.technical_responsible_id === currentUserId)
  const availableModules = modules.filter(([key]) => hasWorkspaceAccess(permissions, key === 'support_tickets' ? 'suporte' : key === 'change_requests' ? 'solicitacoes' : 'projetos'))

  useEffect(() => {
    void (async () => {
      const { data } = await createClient().auth.getUser()
      setCurrentUserId(data.user?.id ?? null)
    })()
    setModule(initialModule)
    setQuery('')
    setCategoryFilter('')
    setSectorFilter('')
    setStatusFilter('')
    setPriorityFilter('')
    setResponsibleFilter('')
    setPeriodFilter('')
    setSupportView('lista')
    setError('')
    setModal(false)
    setRecord(null)
  }, [initialModule])

  async function loadData() {
    setLoading(true)
    setError('')
    const supabase = createClient()
    if (module === 'change_requests') {
      const { data, error: queryError } = await supabase.from('change_requests')
        .select('id,title,requester,description,status,priority,category,effort_hours,due_at,decision_notes,updated_at')
        .order('created_at', { ascending: false })
      if (queryError) setError(`Não foi possível carregar as solicitações: ${queryError.message}`)
      else setRequests((data ?? []) as ChangeRequest[])
    } else {
      const { data, error: queryError } = await supabase.from('support_tickets')
        .select('id,ticket_number,subject,requester,description,status,priority,category,sector,technical_responsible_id,due_at,scheduled_at,resolution,resolved_at,first_response_at,created_at,updated_at,archived_at')
        .is('archived_at', null)
        .order('created_at', { ascending: false })
      if (queryError) setError(`Não foi possível carregar os chamados: ${queryError.message}`)
      else setTickets((data ?? []) as Ticket[])

      if (canAssign) {
        const { data: memberRows, error: membersError } = await supabase.from('team_members')
          .select('id,user_id,full_name,role_name,status')
          .order('full_name')
        if (membersError) setError((current) => current || `Não foi possível carregar os responsáveis: ${membersError.message}`)
        else setMembers((memberRows ?? []) as Member[])
      } else {
        setMembers([])
      }
    }
    setLoading(false)
  }

  useEffect(() => { if (module !== 'projects') void loadData() }, [module])

  useEffect(() => {
    if (record && 'ticket_number' in record) {
      void loadTicketMessages(record.id)
    } else {
      setTicketMessages([])
    }
  }, [record])

  const supportTicketsFiltered = useMemo(() => {
    const rangeStart = getPeriodStart(periodFilter)
    return tickets.filter((item) => {
      const status = normalizeSupportStatus(item.status)
      const matchesText = `${item.ticket_number} ${item.subject} ${item.requester} ${item.category} ${item.sector}`.toLowerCase().includes(query.toLowerCase())
      const matchesCategory = !categoryFilter || item.category === categoryFilter
      const matchesSector = !sectorFilter || item.sector === sectorFilter
      const matchesStatus = !statusFilter || status === statusFilter
      const matchesPriority = !priorityFilter || normalizeSupportPriority(item.priority) === priorityFilter
      const matchesResponsible = !responsibleFilter || item.technical_responsible_id === responsibleFilter
      const matchesPeriod = !rangeStart || !item.created_at || new Date(item.created_at) >= rangeStart
      return matchesText && matchesCategory && matchesSector && matchesStatus && matchesPriority && matchesResponsible && matchesPeriod
    })
  }, [tickets, query, categoryFilter, sectorFilter, statusFilter, priorityFilter, responsibleFilter, periodFilter])

  const supportStats = useMemo(() => {
    const total = tickets.length
    const open = tickets.filter((ticket) => !['Resolvido', 'Fechado', 'Cancelado'].includes(normalizeSupportStatus(ticket.status))).length
    const inProgress = tickets.filter((ticket) => normalizeSupportStatus(ticket.status) === 'Em atendimento').length
    const waitingClient = tickets.filter((ticket) => normalizeSupportStatus(ticket.status) === 'Aguardando cliente').length
    const waitingTeam = tickets.filter((ticket) => normalizeSupportStatus(ticket.status) === 'Aguardando equipe interna').length
    const solved = tickets.filter((ticket) => normalizeSupportStatus(ticket.status) === 'Resolvido').length
    const closed = tickets.filter((ticket) => normalizeSupportStatus(ticket.status) === 'Fechado').length
    const overdue = tickets.filter((ticket) => {
      if (!ticket.due_at) return false
      const normalized = normalizeSupportStatus(ticket.status)
      if (['Resolvido', 'Fechado', 'Cancelado'].includes(normalized)) return false
      return new Date(ticket.due_at).getTime() < Date.now()
    }).length
    const responseTimes = tickets.filter((ticket) => ticket.first_response_at && ticket.created_at).map((ticket) => new Date(ticket.first_response_at!).getTime() - new Date(ticket.created_at!).getTime())
    const resolutionTimes = tickets.filter((ticket) => ticket.resolved_at && ticket.created_at).map((ticket) => new Date(ticket.resolved_at!).getTime() - new Date(ticket.created_at!).getTime())
    const averageFirstResponseMinutes = responseTimes.length ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length / 60000) : 0
    const averageResolutionHours = resolutionTimes.length ? Math.round(resolutionTimes.reduce((sum, value) => sum + value, 0) / resolutionTimes.length / 3600000) : 0
    const dueSoon = tickets.filter((ticket) => {
      if (!ticket.due_at) return false
      const normalized = normalizeSupportStatus(ticket.status)
      if (['Resolvido', 'Fechado', 'Cancelado'].includes(normalized)) return false
      const delta = new Date(ticket.due_at).getTime() - Date.now()
      return delta > 0 && delta <= 2 * 24 * 60 * 60 * 1000
    }).length
    const sectors = Object.entries(
      tickets.reduce<Record<string, number>>((accumulator, ticket) => {
        const sector = ticket.sector || 'Sem setor'
        accumulator[sector] = (accumulator[sector] ?? 0) + 1
        return accumulator
      }, {})
    ).sort((a, b) => b[1] - a[1])
    const priorities = Object.entries(
      tickets.reduce<Record<string, number>>((accumulator, ticket) => {
        const priority = normalizeSupportPriority(ticket.priority)
        accumulator[priority] = (accumulator[priority] ?? 0) + 1
        return accumulator
      }, {})
    ).sort((a, b) => b[1] - a[1])
    const byResponsible = Object.entries(
      tickets.reduce<Record<string, number>>((accumulator, ticket) => {
        const responsible = ticket.technical_responsible_id ?? 'sem_responsavel'
        accumulator[responsible] = (accumulator[responsible] ?? 0) + 1
        return accumulator
      }, {})
    ).sort((a, b) => b[1] - a[1])
    return { total, open, inProgress, waitingClient, waitingTeam, solved, closed, overdue, dueSoon, averageFirstResponseMinutes, averageResolutionHours, sectors, priorities, byResponsible }
  }, [tickets])

  const operationalRows: OperationalRecord[] = module === 'change_requests'
    ? requests.filter((item) => `${item.title} ${item.requester} ${item.category}`.toLowerCase().includes(query.toLowerCase()))
    : supportTicketsFiltered as Ticket[]

  function normalizeSupportPriority(value: string | null | undefined) {
    const normalized = String(value ?? '').trim().toLowerCase()
    const map: Record<string, string> = {
      baixa: 'Baixa',
      media: 'Média',
      'média': 'Média',
      alta: 'Alta',
      critica: 'Crítica',
      crítico: 'Crítica',
      urgente: 'Crítica',
      normal: 'Média',
      default: 'Média',
    }
    return map[normalized] ?? (supportPriorities.includes(String(value ?? '')) ? String(value) : 'Média')
  }

  function membersForSector(sector: string) {
    const allowedRoles = rolesForSector(sector)
    return members.filter((member) => allowedRoles.includes((member.role_name ?? '').trim().toLowerCase()))
  }

  function openEditor(item: OperationalRecord) {
    setRecord(item)
    setEditingRecord(true)
    setEditingSector('sector' in item ? item.sector : '')
    setAttachmentFile(null)
    setError('')
    if ('ticket_number' in item) {
      void loadTicketMessages(item.id)
      void loadTicketAttachments(item.id)
    }
  }

  async function loadTicketAttachments(ticketId: string) {
    const response = await fetch(`/api/workspace/support/attachments?ticketId=${encodeURIComponent(ticketId)}`)
    if (!response.ok) return setTicketAttachments([])
    const data = await response.json()
    setTicketAttachments(Array.isArray(data) ? data : [])
  }

  async function uploadTicketAttachment() {
    if (!record || !('ticket_number' in record) || !attachmentFile) return
    setAttachmentSaving(true)
    setError('')
    const formData = new FormData()
    formData.set('ticketId', record.id)
    formData.set('file', attachmentFile)
    const response = await fetch('/api/workspace/support/attachments', { method: 'POST', body: formData })
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      setError(body?.error ?? 'Não foi possível enviar o anexo.')
    } else {
      setAttachmentFile(null)
      await loadTicketAttachments(record.id)
    }
    setAttachmentSaving(false)
  }

  async function loadTicketMessages(ticketId: string) {
    const supabase = createClient()
    const { data, error: messagesError } = await supabase
      .from('support_messages')
      .select('id,ticket_id,message_type,content,created_at,actor_name,author_name')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true })

    if (messagesError) {
      setTicketMessages([])
      return
    }
    setTicketMessages((data ?? []) as SupportMessage[])
  }

  async function deleteTicketMessage(message: SupportMessage) {
    const isAdmin = permissions.includes('*')
    const isAuthor = Boolean(currentUserId && message.created_by === currentUserId)
    const isResponsible = Boolean(record && 'ticket_number' in record && currentUserId && record.technical_responsible_id === currentUserId)
    if (!(isAdmin || isAuthor || isResponsible) || !window.confirm('Excluir esta interação da linha do tempo?')) return
    const { error: deleteError } = await createClient().from('support_messages').delete().eq('id', message.id)
    if (deleteError) setError(`Não foi possível excluir a interação: ${deleteError.message}`)
    else if (record) await loadTicketMessages(record.id)
  }

  async function submitTicketMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!record || !('ticket_number' in record) || !messageDraft.trim()) return

    setMessageSaving(true)
    setError('')

    const supabase = createClient()
    const { data: userData } = await supabase.auth.getUser()
    const actor = userData.user
    const actorName = String(actor?.user_metadata?.full_name || actor?.user_metadata?.name || actor?.email || 'Equipe Codexa')
    const { error: insertError } = await supabase.from('support_messages').insert({
      ticket_id: record.id,
      message_type: messageType,
      content: messageDraft.trim(),
      actor_name: actorName,
      author_name: actorName,
      created_by: actor?.id ?? null,
    })

    if (insertError) {
      setError(`Não foi possível registrar a interação: ${insertError.message}`)
    } else {
      setMessageDraft('')
      setMessageType('internal')
      await loadTicketMessages(record.id)
    }

    setMessageSaving(false)
  }

  async function remove(id: string, item?: OperationalRecord) {
    const allowed = module === 'support_tickets' && item && 'ticket_number' in item ? canDeleteTicket(item as Ticket) : canDelete
    if (!allowed || !window.confirm(module === 'support_tickets' ? 'Excluir este chamado e seu histórico? Esta ação não pode ser desfeita.' : 'Excluir este registro?')) return
    const table = module === 'change_requests' ? 'change_requests' : 'support_tickets'
    const mutation = module === 'support_tickets'
      ? createClient().from(table).delete().eq('id', id)
      : createClient().from(table).delete().eq('id', id)
    const { error: deleteError } = await mutation
    if (deleteError) setError(`Não foi possível excluir o registro: ${deleteError.message}`)
    else await loadData()
  }

  async function createRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canCreate) return
    setSaving(true)
    setError('')
    const data = Object.fromEntries(new FormData(event.currentTarget).entries())
    const payload = module === 'change_requests'
      ? { requester: data.requester, title: data.title, description: data.description, category: data.category || 'Nova funcionalidade', priority: data.priority || 'Média', status: 'Recebida', effort_hours: Number(data.effort_hours) || 0, due_at: data.due_at ? new Date(String(data.due_at)).toISOString() : null, decision_notes: null }
      : {
          ticket_number: data.ticket_number,
          requester: data.requester,
          subject: data.subject,
          description: data.description,
          category: data.category || 'Suporte corretivo',
          sector: data.sector,
          priority: data.priority || 'Média',
          status: normalizeSupportStatus(String(data.status || 'Aberto')),
          due_at: toIsoDateTime(data.due_at),
          scheduled_at: toIsoDateTime(data.scheduled_at),
          resolution: data.resolution || null,
          resolved_at: ['Resolvido', 'Fechado'].includes(normalizeSupportStatus(String(data.status || 'Aberto'))) ? new Date().toISOString() : null,
        }
    const table = module === 'change_requests' ? 'change_requests' : 'support_tickets'
    const { error: insertError } = await createClient().from(table).insert(payload)
    if (insertError) {
      console.error('Operational record creation failed:', insertError.message)
      setError(`Não foi possível salvar: ${insertError.message}`)
    } else {
      setModal(false)
      await loadData()
    }
    setSaving(false)
  }

  async function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!record || !canUpdate) return
    setSaving(true)
    setError('')
    const data = Object.fromEntries(new FormData(event.currentTarget).entries())
    const isSupportTicket = module === 'support_tickets'
    const previousTicket = isSupportTicket ? record as Ticket : null
    const normalizedStatus = isSupportTicket ? normalizeSupportStatus(String(data.status)) : String(data.status)
    const isResolved = isSupportTicket && ['Resolvido', 'Fechado'].includes(normalizedStatus)
    const wasResolved = previousTicket && ['Resolvido', 'Fechado'].includes(normalizeSupportStatus(previousTicket.status))
    const payload = isSupportTicket
      ? {
          subject: data.subject,
          requester: data.requester,
          description: data.description || null,
          category: data.category,
          sector: data.sector,
          priority: normalizeSupportPriority(String(data.priority)),
          status: normalizedStatus,
          due_at: toIsoDateTime(data.due_at),
          scheduled_at: toIsoDateTime(data.scheduled_at),
          resolution: data.resolution || null,
          resolved_at: isResolved ? (wasResolved ? previousTicket.resolved_at : new Date().toISOString()) : null,
          ...(canAssign ? { technical_responsible_id: data.technical_responsible_id || null } : {}),
        }
      : { title: data.title, requester: data.requester, description: data.description || null, category: data.category, priority: data.priority, status: data.status, effort_hours: data.effort_hours === '' ? null : Number(data.effort_hours), due_at: data.due_at ? new Date(String(data.due_at)).toISOString() : null, decision_notes: data.decision_notes || null, updated_at: new Date().toISOString() }
    const table = module === 'change_requests' ? 'change_requests' : 'support_tickets'
    const { error: updateError } = await createClient().from(table).update(payload).eq('id', record.id)
    if (updateError) setError(`Não foi possível salvar as alterações: ${updateError.message}`)
    else {
      if (isSupportTicket && isResolved && !wasResolved) await awardXp('resolve_support_ticket', 'support_ticket', record.id)
      if (!isSupportTicket && String(data.status).toLowerCase().includes('aprov')) await awardXp('approve_change_request', 'change_request', record.id)
      setRecord(null)
      setEditingRecord(false)
      await loadData()
    }
    setSaving(false)
  }

  const title = module === 'change_requests' ? 'Solicitações de alteração' : 'Central de suporte'
  const empty = module === 'change_requests' ? 'Nenhuma solicitação cadastrada' : 'Nenhum chamado cadastrado'
  if (module === 'projects') return <ProjectListWorkspace permissions={permissions} onSwitchModule={setModule} />

  return <section className="mt-6 rounded-xl border border-white/[0.07] bg-[#11161e]">
    <div className="flex flex-col gap-4 border-b border-white/[0.07] p-5 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-cyan-400">Operação e entrega</p>
        <h2 className="mt-1 text-lg font-semibold text-white">{title}</h2>
        <p className="mt-1 text-xs text-slate-500">Acompanhamento operacional com indicadores reais e visão por fila de atendimento.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {availableModules.map(([key, Icon, label]) => (
          <button key={key} onClick={() => { setModule(key); setQuery(''); setCategoryFilter(''); setSectorFilter(''); setStatusFilter(''); setPriorityFilter(''); setResponsibleFilter(''); setPeriodFilter(''); setSupportView('lista'); setError(''); setModal(false); setRecord(null) }} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${module === key ? 'bg-cyan-500 text-slate-950' : 'bg-white/[0.04] text-slate-400 hover:text-white'}`}>
            <Icon className="size-3.5" />{label}
          </button>
        ))}
        {canCreate && (
          <button onClick={() => setModal(true)} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-200">
            <Plus className="size-3.5" />Novo registro
          </button>
        )}
      </div>
    </div>

    {module === 'support_tickets' && (
      <div className="space-y-5 border-b border-white/[0.07] px-5 py-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Total', value: supportStats.total, tone: 'text-cyan-300', accent: 'bg-cyan-500/10' },
            { label: 'Abertos', value: supportStats.open, tone: 'text-blue-300', accent: 'bg-blue-500/10' },
            { label: 'Em andamento', value: supportStats.inProgress, tone: 'text-violet-300', accent: 'bg-violet-500/10' },
            { label: 'Aguardando cliente', value: supportStats.waitingClient, tone: 'text-amber-300', accent: 'bg-amber-500/10' },
            { label: 'Aguardando equipe', value: supportStats.waitingTeam, tone: 'text-orange-300', accent: 'bg-orange-500/10' },
            { label: 'Resolvidos', value: supportStats.solved, tone: 'text-emerald-300', accent: 'bg-emerald-500/10' },
            { label: 'Fechados', value: supportStats.closed, tone: 'text-slate-200', accent: 'bg-slate-500/10' },
            { label: 'Atrasados', value: supportStats.overdue, tone: 'text-rose-300', accent: 'bg-rose-500/10' },
            { label: '1ª resposta (min)', value: supportStats.averageFirstResponseMinutes, tone: 'text-cyan-300', accent: 'bg-cyan-500/10' },
            { label: 'Resolução média (h)', value: supportStats.averageResolutionHours, tone: 'text-indigo-300', accent: 'bg-indigo-500/10' }
          ].map((metric) => (
            <div key={metric.label} className={`rounded-xl border border-white/[0.08] ${metric.accent} p-3`}>
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{metric.label}</p>
              <p className={`mt-3 text-2xl font-semibold ${metric.tone}`}>{metric.value}</p>
            </div>
          ))}
        </div>
      </div>
    )}

    <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] px-5 py-3">
      <div className="flex min-w-48 flex-1 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2">
        <Search className="size-4 text-slate-600" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar registros..." className="w-full bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600" />
      </div>

      {module === 'support_tickets' && (
        <>
          <select aria-label="Filtrar por categoria" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className={`${inputClass} w-auto min-w-36 py-2 text-xs`}>
            <option value="">Todas categorias</option>
            {Array.from(new Set(tickets.map((ticket) => ticket.category))).map((category) => <option key={category}>{category}</option>)}
          </select>
          <select aria-label="Filtrar por setor" value={sectorFilter} onChange={(event) => setSectorFilter(event.target.value)} className={`${inputClass} w-auto min-w-36 py-2 text-xs`}>
            <option value="">Todos os setores</option>
{Array.from(new Set([...supportSectors, ...tickets.map((ticket) => ticket.sector).filter(Boolean)])).map((sector) => <option key={sector}>{sector}</option>)}
          </select>
          <select aria-label="Filtrar por status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={`${inputClass} w-auto min-w-40 py-2 text-xs`}>
            <option value="">Todos os status</option>
            {supportStatuses.map((status) => <option key={status}>{status}</option>)}
          </select>
          <select aria-label="Filtrar por prioridade" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className={`${inputClass} w-auto min-w-32 py-2 text-xs`}>
            <option value="">Todas prioridades</option>
            {supportPriorities.map((priority) => <option key={priority}>{priority}</option>)}
          </select>
          <select aria-label="Filtrar por responsável" value={responsibleFilter} onChange={(event) => setResponsibleFilter(event.target.value)} className={`${inputClass} w-auto min-w-36 py-2 text-xs`}>
            <option value="">Todos responsáveis</option>
            {Array.from(new Set(tickets.map((ticket) => ticket.technical_responsible_id).filter((id): id is string => Boolean(id)))).map((id) => <option key={id} value={id}>{members.find((member) => member.user_id === id)?.full_name ?? id}</option>)}
          </select>
          <select aria-label="Filtrar por período" value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)} className={`${inputClass} w-auto min-w-34 py-2 text-xs`}>
            <option value="">Qualquer período</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="90d">Últimos 90 dias</option>
          </select>
          <div className="inline-flex rounded-lg border border-white/[0.08] bg-white/[0.02] p-1">
            <button type="button" onClick={() => setSupportView('lista')} className={`rounded-md px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] ${supportView === 'lista' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400'}`}>
              Lista
            </button>
            <button type="button" onClick={() => setSupportView('kanban')} className={`rounded-md px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] ${supportView === 'kanban' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400'}`}>
              Kanban
            </button>
          </div>
        </>
      )}
      <button onClick={() => void loadData()} className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-slate-400 hover:text-white">Atualizar</button>
    </div>

    {error && <div className="mx-5 mt-4 flex items-center justify-between rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-300"><span>{error}</span><button onClick={() => setError('')} aria-label="Fechar aviso"><X className="size-3.5" /></button></div>}

    {module === 'support_tickets' && supportView === 'kanban' ? (
      <div className="grid gap-4 overflow-x-auto p-5 xl:grid-cols-5">
        {supportStatusOrder.map((statusKey) => {
          const items = supportTicketsFiltered.filter((ticket) => normalizeSupportStatus(ticket.status) === statusKey)
          return (
            <div key={statusKey} className="min-w-[220px] rounded-xl border border-white/[0.08] bg-[#121a24] p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-medium ${(supportStatusColors as Record<string, string>)[statusKey] ?? 'bg-slate-500/10 text-slate-300'}`}>{statusKey}</span>
                <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.length === 0 ? <div className="rounded-lg border border-dashed border-white/[0.08] p-3 text-[11px] text-slate-500">Sem chamados</div> : items.map((ticket) => (
                  <button key={ticket.id} type="button" onClick={() => { setRecord(ticket); setEditingRecord(false); setError('') }} className="w-full rounded-lg border border-white/[0.08] bg-[#0f1720] p-3 text-left transition hover:border-cyan-400/30 hover:bg-[#101a25]">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-cyan-300">{ticket.ticket_number}</p>
                        <p className="mt-1 text-sm font-medium text-slate-100">{ticket.subject}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[10px] ${((supportPriorityColors as Record<string, string>)[normalizeSupportPriority(ticket.priority)] ?? 'bg-slate-500/10 text-slate-200')}`}>
                        {normalizeSupportPriority(ticket.priority)}
                      </span>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-400">
                      <p>{ticket.requester}</p>
                      <p>{ticket.sector}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    ) : (
      <div className="overflow-x-auto">
        {loading ? (
          <div className="flex min-h-40 items-center justify-center text-xs text-slate-500"><Loader2 className="mr-2 size-4 animate-spin" />Carregando operação...</div>
        ) : operationalRows.length === 0 ? (
          <div className="flex min-h-40 flex-col items-center justify-center text-center">
            <p className="text-sm text-slate-400">{empty}</p>
            <p className="mt-1 text-xs text-slate-600">{canCreate ? 'Use “Novo registro” para começar.' : 'Nenhum registro encontrado.'}</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/[0.07] text-[10px] uppercase tracking-wider text-slate-600">
              <tr>
                {module === 'change_requests' ? <><th className="px-5 py-3">Solicitação</th><th className="px-5 py-3">Solicitante</th><th className="px-5 py-3">Status</th></> : <><th className="px-5 py-3">Chamado</th><th className="px-5 py-3">Prioridade</th><th className="px-5 py-3">Setor</th><th className="px-5 py-3">Responsável</th><th className="px-5 py-3">Prazo</th><th className="px-5 py-3">Status</th></>}
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {operationalRows.map((item) => {
                if (module !== 'support_tickets' || !('ticket_number' in item)) {
                  return (
                    <tr key={item.id} className="border-b border-white/[0.05] last:border-0">
                      <td className="px-5 py-3 font-medium text-slate-200">{'ticket_number' in item ? `${item.ticket_number} · ${item.subject}` : item.title}</td>
                      {'ticket_number' in item && <><td className="px-5 py-3 text-slate-400">{normalizeSupportPriority(item.priority)}</td><td className="px-5 py-3 text-slate-400">{item.sector}</td><td className="px-5 py-3 text-slate-400">{members.find((member) => member.user_id === item.technical_responsible_id)?.full_name ?? item.technical_responsible_id ?? 'Fila de triagem'}</td><td className="px-5 py-3 text-slate-400">{formatShortDate(item.due_at)}</td></>}
                      <td className="px-5 py-3 text-slate-400">{'ticket_number' in item ? item.requester : item.requester}</td>
                      <td className="px-5 py-3 text-slate-500">{'ticket_number' in item ? normalizeSupportStatus(item.status) : item.status}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex gap-1">
                          <button onClick={() => { setRecord(item); setEditingRecord(false); setError('') }} aria-label="Ver detalhes" className="rounded p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"><Eye className="size-3.5" /></button>
                          {canUpdate && <button onClick={() => openEditor(item)} aria-label="Editar registro" className="rounded p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"><Pencil className="size-3.5" /></button>}
                          {(module !== 'support_tickets' ? canDelete : canDeleteTicket(item as Ticket)) && <button onClick={() => void remove(item.id, item as OperationalRecord)} aria-label="Excluir registro" className="rounded p-1.5 text-slate-600 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 className="size-3.5" /></button>}
                        </div>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr key={item.id} className="border-b border-white/[0.05] last:border-0">
                    <td className="px-5 py-3 font-medium text-slate-200">{`${item.ticket_number} · ${item.subject}`}</td>
                    <td className="px-5 py-3 text-slate-300"><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-medium ${((supportPriorityColors as Record<string, string>)[normalizeSupportPriority(item.priority)] ?? 'bg-slate-500/10 text-slate-200')}`}>{normalizeSupportPriority(item.priority)}</span></td>
                    <td className="px-5 py-3 text-slate-400">{item.sector}</td>
                    <td className="px-5 py-3 text-slate-400">{members.find((member) => member.user_id === item.technical_responsible_id)?.full_name ?? item.technical_responsible_id ?? 'Fila de triagem'}</td>
                    <td className="px-5 py-3 text-slate-400">{formatShortDate(item.due_at)}</td>
                    <td className="px-5 py-3 text-slate-300"><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-medium ${((supportStatusColors as Record<string, string>)[normalizeSupportStatus(item.status)] ?? 'bg-slate-500/10 text-slate-200')}`}>{normalizeSupportStatus(item.status)}</span></td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <button onClick={() => { setRecord(item); setEditingRecord(false); setError('') }} aria-label="Ver detalhes" className="rounded p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"><Eye className="size-3.5" /></button>
                        {canUpdate && <button onClick={() => openEditor(item)} aria-label="Editar registro" className="rounded p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"><Pencil className="size-3.5" /></button>}
                        {(module !== 'support_tickets' ? canDelete : canDeleteTicket(item as Ticket)) && <button onClick={() => void remove(item.id, item as OperationalRecord)} aria-label="Excluir registro" className="rounded p-1.5 text-slate-600 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 className="size-3.5" /></button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    )}

    {modal && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4"><div className="w-full max-w-2xl rounded-xl border border-white/10 bg-[#151b24] p-5 shadow-2xl">
      <div className="mb-5 flex items-center justify-between"><div><h3 className="font-semibold text-white">Novo {module === 'change_requests' ? 'solicitação' : 'chamado'}</h3><p className="mt-1 text-xs text-slate-500">Os campos obrigatórios são validados pelo banco.</p></div><button onClick={() => setModal(false)} aria-label="Fechar formulário"><X className="size-4 text-slate-500" /></button></div>
      <form onSubmit={(event) => void createRecord(event)} className="grid gap-3 sm:grid-cols-2">
        {module === 'change_requests' ? <>
          <label className="text-xs text-slate-400">Solicitante<input required name="requester" className={`${inputClass} mt-1.5`} /></label>
          <label className="text-xs text-slate-400">Título<input required name="title" className={`${inputClass} mt-1.5`} /></label>
          <label className="text-xs text-slate-400">Categoria<select name="category" className={`${inputClass} mt-1.5`}><option>Nova funcionalidade</option><option>Melhoria</option><option>Correção</option></select></label>
          <label className="text-xs text-slate-400">Prioridade<select name="priority" className={`${inputClass} mt-1.5`}>{changeRequestPriorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
          <label className="text-xs text-slate-400">Esforço estimado (horas)<input name="effort_hours" type="number" min="0" step="0.5" defaultValue="0" className={`${inputClass} mt-1.5`} /></label>
          <label className="text-xs text-slate-400 sm:col-span-2">Prazo desejado<input name="due_at" type="datetime-local" className={`${inputClass} mt-1.5`} /></label>
          <label className="text-xs text-slate-400 sm:col-span-2">Descrição<textarea required name="description" rows={4} className={`${inputClass} mt-1.5 resize-y`} /></label>
        </> : <>
          <label className="text-xs text-slate-400">Número do chamado<input required name="ticket_number" className={`${inputClass} mt-1.5`} /></label>
          <label className="text-xs text-slate-400">Solicitante<input required name="requester" className={`${inputClass} mt-1.5`} /></label>
          <label className="text-xs text-slate-400 sm:col-span-2">Assunto<input required name="subject" className={`${inputClass} mt-1.5`} /></label>
          <label className="text-xs text-slate-400">Categoria<select name="category" className={`${inputClass} mt-1.5`}><option>Suporte corretivo</option><option>Dúvida</option><option>Solicitação</option></select></label>
          <label className="text-xs text-slate-400">Setor responsável<select required name="sector" defaultValue="" className={`${inputClass} mt-1.5`}><option value="" disabled>Selecione o setor</option>{supportSectors.map((sector) => <option key={sector}>{sector}</option>)}</select></label>
          <label className="text-xs text-slate-400">Prioridade<select name="priority" className={`${inputClass} mt-1.5`}><option>Média</option><option>Baixa</option><option>Alta</option><option>Crítica</option></select></label>
          <label className="text-xs text-slate-400">Status<select name="status" defaultValue="Aberto" className={`${inputClass} mt-1.5`}>{supportStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
          <label className="text-xs text-slate-400">Prazo<input name="due_at" type="datetime-local" className={`${inputClass} mt-1.5`} /></label>
          <label className="text-xs text-slate-400 sm:col-span-2">Horário agendado<input name="scheduled_at" type="datetime-local" className={`${inputClass} mt-1.5`} /></label>
          <label className="text-xs text-slate-400 sm:col-span-2">Descrição do problema<textarea required name="description" rows={4} className={`${inputClass} mt-1.5 resize-y`} /></label>
          <label className="text-xs text-slate-400 sm:col-span-2">Resolução (opcional)<textarea name="resolution" rows={3} className={`${inputClass} mt-1.5 resize-y`} /></label>
        </>}
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setModal(false)} className="rounded-lg px-3 py-2 text-xs text-slate-400">Cancelar</button><button disabled={saving} className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 disabled:opacity-60">{saving ? 'Salvando...' : 'Salvar'}</button></div>
      </form>
    </div></div>}

    {record && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRecord(null) }}><div className="w-full max-w-xl rounded-xl border border-white/10 bg-[#151b24] p-5 shadow-2xl">
      <div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-wider text-cyan-300">{module === 'change_requests' ? 'Solicitação' : `Chamado ${(record as Ticket).ticket_number}`}</p><h3 className="mt-1 text-lg font-semibold text-white">{editingRecord ? 'Editar registro' : ('subject' in record ? record.subject : record.title)}</h3></div><button type="button" onClick={() => setRecord(null)} aria-label="Fechar detalhes"><X className="size-5 text-slate-400" /></button></div>
      {editingRecord ? <form onSubmit={(event) => void saveRecord(event)} className="grid gap-3 sm:grid-cols-2">
        {'ticket_number' in record ? <label className="text-xs text-slate-400">Assunto<input name="subject" required defaultValue={record.subject} className={`${inputClass} mt-1`} /></label> : <label className="text-xs text-slate-400">Título<input name="title" required defaultValue={record.title} className={`${inputClass} mt-1`} /></label>}
        <label className="text-xs text-slate-400">Solicitante<input name="requester" required defaultValue={record.requester} className={`${inputClass} mt-1`} /></label>
        {'ticket_number' in record
          ? <label className="text-xs text-slate-400">Categoria<input name="category" required defaultValue={record.category} className={`${inputClass} mt-1`} /></label>
          : <label className="text-xs text-slate-400">Categoria<select name="category" required defaultValue={record.category} className={`${inputClass} mt-1`}>{['Nova funcionalidade', 'Melhoria', 'Correção', record.category].filter((value, index, values) => values.indexOf(value) === index).map((category) => <option key={category}>{category}</option>)}</select></label>}
        {'ticket_number' in record && <label className="text-xs text-slate-400">Setor responsável<select name="sector" required value={editingSector} onChange={(event) => setEditingSector(event.target.value)} className={`${inputClass} mt-1`}>{supportSectors.map((sector) => <option key={sector}>{sector}</option>)}</select></label>}
        {'ticket_number' in record && canAssign && <label className="text-xs text-slate-400">Responsável<select name="technical_responsible_id" defaultValue={record.technical_responsible_id ?? ''} className={`${inputClass} mt-1`}><option value="">Atribuição automática do setor</option>{membersForSector(editingSector).filter((member) => member.user_id).map((member) => <option key={member.user_id} value={member.user_id!}>{member.full_name}</option>)}</select></label>}
        <label className="text-xs text-slate-400">Prioridade<select name="priority" defaultValue={normalizeSupportPriority(record.priority)} className={`${inputClass} mt-1`}>
          {supportPriorities.map((priority) => <option key={priority}>{priority}</option>)}
        </select></label>
        {'ticket_number' in record
          ? <label className="text-xs text-slate-400">Status<select name="status" required defaultValue={normalizeSupportStatus(record.status)} className={`${inputClass} mt-1`}>{!supportStatuses.includes(normalizeSupportStatus(record.status)) && <option>{normalizeSupportStatus(record.status)}</option>}{supportStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
          : <label className="text-xs text-slate-400">Status<select name="status" required defaultValue={record.status} className={`${inputClass} mt-1`}>{!changeRequestStatuses.includes(record.status) && <option>{record.status}</option>}{changeRequestStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>}
        {'ticket_number' in record ? <>
          <label className="text-xs text-slate-400">Prazo<input name="due_at" type="datetime-local" defaultValue={toLocalDateTime(record.due_at)} className={`${inputClass} mt-1`} /></label>
          <label className="text-xs text-slate-400">Horário agendado<input name="scheduled_at" type="datetime-local" defaultValue={toLocalDateTime(record.scheduled_at)} className={`${inputClass} mt-1`} /></label>
        </> : <>
          <label className="text-xs text-slate-400">Esforço estimado (horas)<input name="effort_hours" type="number" min="0" step="0.5" defaultValue={record.effort_hours ?? 0} className={`${inputClass} mt-1`} /></label>
          <label className="text-xs text-slate-400">Prazo desejado<input name="due_at" type="datetime-local" defaultValue={toLocalDateTime(record.due_at)} className={`${inputClass} mt-1`} /></label>
        </>}
        <label className="text-xs text-slate-400 sm:col-span-2">Descrição<textarea name="description" defaultValue={record.description || ''} rows={5} className={`${inputClass} mt-1 resize-y`} /></label>
        {'ticket_number' in record
          ? <label className="text-xs text-slate-400 sm:col-span-2">Resolução<textarea name="resolution" defaultValue={record.resolution || ''} rows={4} className={`${inputClass} mt-1 resize-y`} /></label>
          : <label className="text-xs text-slate-400 sm:col-span-2">Notas da decisão / andamento<textarea name="decision_notes" defaultValue={record.decision_notes || ''} rows={3} className={`${inputClass} mt-1 resize-y`} /></label>}
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setEditingRecord(false)} className="rounded-lg px-3 py-2 text-xs text-slate-300">Cancelar</button><button disabled={saving} className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950">{saving ? 'Salvando...' : 'Salvar alterações'}</button></div>
      </form> : <><div className="grid gap-4 text-sm sm:grid-cols-2"><p className="text-slate-400">Solicitante<span className="mt-1 block text-slate-200">{record.requester}</span></p><p className="text-slate-400">Status / prioridade<span className="mt-1 block text-slate-200">{normalizeSupportStatus('ticket_number' in record ? record.status : record.status)} · {normalizeSupportPriority('ticket_number' in record ? record.priority : record.priority)}</span></p><p className="text-slate-400">Categoria<span className="mt-1 block text-slate-200">{record.category}</span></p>{'ticket_number' in record ? <>
        <p className="text-slate-400">Setor responsável<span className="mt-1 block text-slate-200">{record.sector}</span></p>
        <p className="text-slate-400">Responsável<span className="mt-1 block text-slate-200">{members.find((member) => member.user_id === record.technical_responsible_id)?.full_name ?? record.technical_responsible_id ?? 'Fila de triagem'}</span></p>
        <p className="text-slate-400">Prazo<span className="mt-1 block text-slate-200">{record.due_at ? new Date(record.due_at).toLocaleString('pt-BR') : 'Não definido'}</span></p>
        <p className="text-slate-400">Horário agendado<span className="mt-1 block text-slate-200">{record.scheduled_at ? new Date(record.scheduled_at).toLocaleString('pt-BR') : 'Não definido'}</span></p>
        <p className="text-slate-400">Resolvido em<span className="mt-1 block text-slate-200">{record.resolved_at ? new Date(record.resolved_at).toLocaleString('pt-BR') : '—'}</span></p>
        <p className="whitespace-pre-wrap text-slate-300 sm:col-span-2">Descrição: {record.description || 'Sem descrição cadastrada.'}</p>
        <p className="whitespace-pre-wrap text-slate-300 sm:col-span-2">Resolução: {record.resolution || 'Ainda não informada.'}</p>
      </> : <>
        <p className="text-slate-400">Esforço estimado<span className="mt-1 block text-slate-200">{record.effort_hours ?? 0} h</span></p>
        <p className="text-slate-400">Prazo desejado<span className="mt-1 block text-slate-200">{record.due_at ? new Date(record.due_at).toLocaleString('pt-BR') : 'Não definido'}</span></p>
        <p className="whitespace-pre-wrap text-slate-300 sm:col-span-2">Descrição: {record.description || 'Sem descrição cadastrada.'}</p>
        <p className="whitespace-pre-wrap text-slate-300 sm:col-span-2">Notas da decisão / andamento: {record.decision_notes || 'Nenhuma nota registrada.'}</p>
      </>}
      </div>
      {'ticket_number' in record && <div className="mt-5 rounded-xl border border-white/[0.08] bg-[#0d141b] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-white">Anexos</h4>
          <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{ticketAttachments.length} arquivo(s)</span>
        </div>
        <div className="space-y-2">
          {ticketAttachments.length === 0 ? <p className="text-xs text-slate-500">Nenhum anexo neste chamado.</p> : ticketAttachments.map((attachment) => <a key={attachment.id} href={`/api/workspace/support/attachments/file?pathname=${encodeURIComponent(attachment.pathname)}`} className="flex items-center justify-between rounded-lg border border-white/[0.06] px-3 py-2 text-xs text-cyan-300 hover:bg-white/[0.04]"><span className="truncate">{attachment.filename}</span><span className="ml-3 shrink-0 text-slate-500">{Math.ceil(attachment.byte_size / 1024)} KB</span></a>)}
        </div>
        {canUpdate && <div className="mt-3 flex flex-wrap items-center gap-2"><input type="file" onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)} className="max-w-full text-xs text-slate-400 file:mr-2 file:rounded-md file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-xs file:text-slate-200" /><button type="button" onClick={() => void uploadTicketAttachment()} disabled={!attachmentFile || attachmentSaving} className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-60">{attachmentSaving ? 'Enviando...' : 'Enviar anexo'}</button></div>}
      </div>}
      {'ticket_number' in record && <div className="mt-5 rounded-xl border border-white/[0.08] bg-[#0d141b] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-white">Linha do tempo</h4>
          <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{ticketMessages.length} registro(s)</span>
        </div>
        <div className="space-y-3">
          {ticketMessages.length === 0 ? <p className="text-xs text-slate-500">Ainda não há interações registradas neste chamado.</p> : ticketMessages.map((message) => (
            <div key={message.id} className={`rounded-lg border p-3 ${message.message_type === 'internal' ? 'border-violet-500/20 bg-violet-500/5' : 'border-cyan-500/20 bg-cyan-500/5'}`}>
              <div className="mb-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.12em] text-slate-400">
                <span>{message.message_type === 'internal' ? 'Interno' : 'Externo'}</span>
                <span className="flex items-center gap-2">{message.author_name ?? message.actor_name ?? 'Equipe Codexa'} · {new Date(message.created_at).toLocaleString('pt-BR')}{(permissions.includes('*') || message.created_by === currentUserId || ('ticket_number' in record && record.technical_responsible_id === currentUserId)) && <button type="button" onClick={() => void deleteTicketMessage(message)} aria-label="Excluir interação" className="text-rose-300/70 hover:text-rose-200"><Trash2 className="size-3" /></button>}</span>
              </div>
              <p className="text-sm text-slate-200 whitespace-pre-wrap">{message.content}</p>
            </div>
          ))}
        </div>
        <form onSubmit={(event) => void submitTicketMessage(event)} className="mt-4 space-y-3 border-t border-white/[0.08] pt-4">
          <div className="flex gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input type="radio" name="ticket_message_type" checked={messageType === 'internal'} onChange={() => setMessageType('internal')} />
              Interno
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input type="radio" name="ticket_message_type" checked={messageType === 'external'} onChange={() => setMessageType('external')} />
              Externo
            </label>
          </div>
          <textarea value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} rows={4} placeholder="Registre uma atualização, resposta ou solicitação ao cliente..." className={`${inputClass} resize-y`} />
          <div className="flex justify-end">
            <button type="submit" disabled={messageSaving || !messageDraft.trim()} className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-60">{messageSaving ? 'Salvando...' : 'Adicionar interação'}</button>
          </div>
        </form>
      </div>}
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setRecord(null)} className="rounded-lg px-3 py-2 text-xs text-slate-300">Fechar</button>{canUpdate && <button type="button" onClick={() => { setEditingRecord(true); setEditingSector('sector' in record ? record.sector : '') }} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950"><Pencil className="size-3.5" />Editar</button>}</div></>}
      {error && <p role="alert" className="mt-4 rounded-lg bg-amber-400/10 p-3 text-xs text-amber-300">{error}</p>}
    </div></div>}
  </section>
}
