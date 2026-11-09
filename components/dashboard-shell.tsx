'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import Image from 'next/image'
import { CrmWorkspace } from '@/components/crm-workspace'
import { CommercialWorkspace } from '@/components/commercial-workspace'
import { OperationsWorkspace } from '@/components/operations-workspace'
import { CatalogWorkspace } from '@/components/catalog-workspace'
import { FinanceWorkspace } from '@/components/finance-workspace'
import { AdminWorkspace } from '@/components/admin-workspace'
import { ReportsWorkspace } from '@/components/reports-workspace'
import { ActivityHistoryWorkspace } from '@/components/activity-history-workspace'
import { AccountWorkspace } from '@/components/account-workspace'
import { GamifiedProfileWorkspace } from '@/components/gamified-profile-workspace'
import { AuthScreen } from '@/components/auth-screen'
import { XpSettingsWorkspace } from '@/components/xp-settings-workspace'
import { CommandAssistant } from '@/components/command-assistant'
import { UserAvatar } from '@/components/user-avatar'
import { createClient } from '@/lib/supabase/client'
import { hasWorkspaceAccess } from '@/lib/workspace-access'
import { workspaceLabel } from '@/lib/workspace-modules'
import { applyWorkspaceAppearance, defaultAppearance, resolveIconColor, type WorkspaceAppearance } from '@/lib/workspace-theme'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChartLine, faUserPlus, faUsers, faAddressBook, faFileSignature, faFileContract, faDiagramProject, faListCheck, faCodePullRequest, faHeadset, faServer, faPuzzlePiece, faLayerGroup, faKey, faArrowTrendUp, faArrowTrendDown, faChartPie, faUserShield, faUserGear, faShieldHalved, faClockRotateLeft, faUserCircle, faPalette, faGear, faMedal, faTrophy, faFolderOpen, faSliders } from '@fortawesome/free-solid-svg-icons'
import {
  Bell,
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  FileText,
  FolderKanban,
  Gauge,
  Headphones,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  Menu,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PanelsTopLeft,
  Plus,
  Search,
  Settings,
  Sparkles,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'

const navigationGroups = [
  { label: 'Workspace', items: [{ label: 'Dashboard', icon: faChartLine }, { label: 'Visão comercial', icon: faChartLine }, { label: 'Documentos', icon: faFolderOpen }] },
  { label: 'Relacionamento', items: [
    { label: 'Leads', icon: faUserPlus },
    { label: 'Clientes', icon: faUsers },
    { label: 'Contatos', icon: faAddressBook },
  ] },
  { label: 'Comercial', items: [
    { label: 'Propostas', icon: faFileSignature },
    { label: 'Contratos', icon: faFileContract },
  ] },
  { label: 'Operações', items: [
    { label: 'Projetos', icon: faDiagramProject },
    { label: 'Tarefas', icon: faListCheck },
    { label: 'Solicitações de alteração', icon: faCodePullRequest },
    { label: 'Suporte', icon: faHeadset },
  ] },
  { label: 'Produtos', items: [
    { label: 'Sistemas dos clientes', icon: faServer },
    { label: 'Módulos', icon: faPuzzlePiece },
    { label: 'Planos', icon: faLayerGroup },
    { label: 'Licenças', icon: faKey },
  ] },
  { label: 'Financeiro', items: [
    { label: 'Contas a receber', icon: faArrowTrendUp },
    { label: 'Contas a pagar', icon: faArrowTrendDown },
    { label: 'Fluxo de caixa', icon: faChartLine },
    { label: 'Transações', icon: faArrowTrendUp },
    { label: 'Categorias financeiras', icon: faChartPie },
  ] },
  { label: 'Administração', items: [
    { label: 'Relatórios', icon: faChartPie },
    { label: 'Equipe', icon: faUsers },
    { label: 'Usuários', icon: faUserGear },
    { label: 'Papéis e permissões', icon: faUserShield },
    { label: 'Emblemas', icon: faMedal },
    { label: 'Configuração de XP', icon: faSliders },
    { label: 'Auditoria', icon: faClockRotateLeft }
  ] },
  { label: 'Conta', items: [
    { label: 'Meu perfil', icon: faUserCircle },
    { label: 'Meu histórico', icon: faClockRotateLeft },
    { label: 'Configurações', icon: faGear },
    { label: 'Aparência', icon: faPalette },
  ] },
]

const sectionSlugs: Record<string, string> = {
  Dashboard: 'dashboard', 'Visão comercial': 'comercial', Documentos: 'documentos', Leads: 'leads', Clientes: 'clientes', Contatos: 'contatos', Propostas: 'propostas', Contratos: 'contratos',
  Projetos: 'projetos', Tarefas: 'tarefas', 'Solicitações de alteração': 'solicitacoes', Suporte: 'suporte', 'Sistemas dos clientes': 'sistemas',
  Módulos: 'modulos', Planos: 'planos', Licenças: 'licencas', 'Contas a receber': 'contas-a-receber', 'Contas a pagar': 'contas-a-pagar',
  'Fluxo de caixa': 'fluxo-de-caixa', Transações: 'transacoes', 'Categorias financeiras': 'categorias-financeiras', Relatórios: 'relatorios', Equipe: 'equipe',
  Usuários: 'usuarios', 'Papéis e permissões': 'papeis-e-permissoes', Emblemas: 'emblemas', 'Configuração de XP': 'configuracao-xp', 'Meu perfil': 'meu-perfil', 'Meu histórico': 'meu-historico', Configurações: 'configuracoes', Aparência: 'aparencia', Auditoria: 'auditoria',
}

const metrics = [
  { label: 'Leads ativos', value: '0', hint: 'Nenhum lead cadastrado', icon: faUserPlus, tone: 'blue' },
  { label: 'Clientes ativos', value: '0', hint: 'Nenhum cliente cadastrado', icon: faUsers, tone: 'blue' },
  { label: 'Projetos em andamento', value: '0', hint: 'Nenhum projeto cadastrado', icon: faDiagramProject, tone: 'cyan' },
  { label: 'Chamados abertos', value: '0', hint: 'Nenhum chamado aberto', icon: faHeadset, tone: 'amber' },
  { label: 'Contratos ativos', value: '0', hint: 'Nenhum contrato cadastrado', icon: faFileContract, tone: 'blue' },
  { label: 'Valores a receber', value: 'R$ 0,00', hint: 'Nenhum lançamento pendente', icon: faArrowTrendUp, tone: 'teal' },
  { label: 'Valores vencidos', value: 'R$ 0,00', hint: 'Nenhum lançamento vencido', icon: faArrowTrendDown, tone: 'rose' },
  { label: 'Receita no mês', value: 'R$ 0,00', hint: 'Nenhum recebimento registrado', icon: faChartLine, tone: 'indigo' },
]

const toneClasses: Record<string, string> = {
  blue: 'bg-blue-500/10 text-blue-400',
  cyan: 'bg-cyan-500/10 text-cyan-400',
  amber: 'bg-amber-500/10 text-amber-400',
  teal: 'bg-teal-500/10 text-teal-400',
  rose: 'bg-rose-500/10 text-rose-400',
  indigo: 'bg-indigo-500/10 text-indigo-400',
}

type WorkspaceNotification = { id: string; message: string; notification_type: string; entity_type?: string | null; entity_id?: string | null; link_path?: string | null; read_at: string | null; created_at: string }
type SearchItem = { label: string; slug: string; group: string }
type DashboardRankingMember = { id: string; full_name: string; role_name: string; xp: number; level: number; milestone_name?: string }
type DashboardActivity = { id: string; summary: string; created_at: string }
type DashboardDue = { description: string; due_date: string; amount: number }
type DashboardProjectStatus = { status: string; count: number }
type DashboardData = { team: number; leads: number; clients: number; projects: number; tickets: number; contracts: number; messages: number; openReceivables: number; overdueReceivables: number; receivedThisMonth: number; ranking: DashboardRankingMember[]; activity: DashboardActivity[]; upcoming: DashboardDue[]; projectStatus: DashboardProjectStatus[] }

function DashboardDataPanels({ data }: { data: DashboardData }) {
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
  const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
  return <>
    <section className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_1fr]">
      <div className="rounded-xl border border-white/[0.07] bg-[#11161e]"><div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-200">Atividade recente</h2><p className="mt-0.5 text-xs text-slate-500">Últimas ações registradas no workspace</p></div><button onClick={() => window.location.assign('/workspace/auditoria')} className="text-xs font-medium text-blue-400 hover:text-blue-300">Ver histórico</button></div>{data.activity.length ? <div className="divide-y divide-white/[0.06]">{data.activity.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 px-5 py-3"><p className="truncate text-xs text-slate-300">{item.summary}</p><time className="shrink-0 text-[10px] text-slate-500">{date.format(new Date(item.created_at))}</time></div>)}</div> : <div className="flex min-h-[220px] items-center justify-center px-6 text-center"><p className="text-xs text-slate-600">Nenhuma atividade registrada.</p></div>}</div>
      <div className="rounded-xl border border-white/[0.07] bg-[#11161e]"><div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-200">Próximos vencimentos</h2><p className="mt-0.5 text-xs text-slate-500">Lançamentos financeiros nos próximos 30 dias</p></div></div>{data.upcoming.length ? <div className="divide-y divide-white/[0.06]">{data.upcoming.map((item, index) => <div key={`${item.due_date}-${index}`} className="flex items-center justify-between gap-3 px-5 py-3"><div className="min-w-0"><p className="truncate text-xs text-slate-300">{item.description}</p><time className="text-[10px] text-slate-500">{date.format(new Date(item.due_date))}</time></div><span className="shrink-0 text-xs font-semibold text-amber-300">{money.format(item.amount)}</span></div>)}</div> : <div className="flex min-h-[220px] items-center justify-center px-6 text-center"><p className="text-xs text-slate-600">Nenhum vencimento encontrado nos próximos 30 dias.</p></div>}</div>
    </section>
    <section className="mt-6 rounded-xl border border-white/[0.07] bg-[#11161e]"><div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-200">Projetos por status</h2><p className="mt-0.5 text-xs text-slate-500">Distribuição real dos projetos cadastrados</p></div></div>{data.projectStatus.length ? <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">{data.projectStatus.map((item) => <div key={item.status} className="rounded-lg bg-white/[0.03] p-4"><p className="text-xs text-slate-500">{item.status}</p><p className="mt-1 text-2xl font-semibold text-slate-100">{item.count}</p></div>)}</div> : <div className="flex min-h-[150px] items-center justify-center px-6 text-center"><p className="text-xs text-slate-600">Cadastre projetos para visualizar a distribuição por status.</p></div>}</section>
  </>
}

function DashboardContent({ initialSection = 'Dashboard', page, permissions, profileName = '' }: { initialSection?: string; page?: ReactNode; permissions: string[]; profileName?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openNavGroups, setOpenNavGroups] = useState<Set<string>>(() => new Set(['Workspace']))
  const [activeSection, setActiveSection] = useState(initialSection)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [assistantHasConversation, setAssistantHasConversation] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<WorkspaceNotification[]>([])
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [notificationsError, setNotificationsError] = useState('')
  const [actionableNotificationIds, setActionableNotificationIds] = useState<string[]>([])
  const [dashboardData, setDashboardData] = useState<DashboardData>({ team: 0, leads: 0, clients: 0, projects: 0, tickets: 0, contracts: 0, messages: 0, openReceivables: 0, overdueReceivables: 0, receivedThisMonth: 0, ranking: [], activity: [], upcoming: [], projectStatus: [] })
  const [profileAvatarUrl, setProfileAvatarUrl] = useState('')
  const [profileNickname, setProfileNickname] = useState('')
  const searchInput = useRef<HTMLInputElement>(null)
  const displayName = profileName.trim() || 'Usuário'
  const avatarUser = { fullName: displayName, nickname: profileNickname, avatarUrl: profileAvatarUrl }

  useEffect(() => {
    const routeModule = pathname.split('/').filter(Boolean)[1]
    setActiveSection(routeModule ? workspaceLabel(routeModule) ?? initialSection : 'Dashboard')
  }, [initialSection, pathname])

  useEffect(() => {
    const activeGroup = navigationGroups.find((group) => group.items.some((item) => item.label === activeSection))
    if (!activeGroup) return
    setOpenNavGroups((current) => current.has(activeGroup.label) ? current : new Set([...current, activeGroup.label]))
  }, [activeSection])

  useEffect(() => {
    let active = true
    void fetch('/api/workspace/profile', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok || !active) return
      const data = await response.json() as { avatarUrl?: string; nickname?: string }
      if (active) {
        setProfileAvatarUrl(data.avatarUrl ?? '')
        setProfileNickname(data.nickname ?? '')
      }
    }).catch(() => undefined)
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    let loadedAppearance: WorkspaceAppearance = defaultAppearance
    const loadAppearance = async () => {
      const supabase = createClient()
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError || !authData.user) return
      const { data, error } = await supabase
        .from('user_preferences')
        .select('theme,primary_color,background_color,surface_color,sidebar_color,header_color,text_color,muted_text_color,border_color,focus_color,font_size_base,heading_scale,font_weight,line_height,letter_spacing,button_radius,card_radius,shadow_strength,appearance_palette,accent_color,font_family,radius_scale,contrast_mode,motion_mode')
        .eq('user_id', authData.user.id)
        .maybeSingle()
      if (!active || error) return
      const loaded = data as (Partial<WorkspaceAppearance> & { accent_color?: string }) | null
      loadedAppearance = { ...defaultAppearance, ...(loaded ?? {}), icon_color: resolveIconColor(loaded?.appearance_palette, loaded?.accent_color) }
      applyWorkspaceAppearance(loadedAppearance)
    }
    void loadAppearance()
    const colorScheme = window.matchMedia('(prefers-color-scheme: light)')
    const onSystemThemeChange = () => {
      if (loadedAppearance.theme === 'system') applyWorkspaceAppearance(loadedAppearance)
    }
    colorScheme.addEventListener('change', onSystemThemeChange)
    return () => { active = false; colorScheme.removeEventListener('change', onSystemThemeChange) }
  }, [])

  useEffect(() => {
    if (activeSection !== 'Dashboard') return
    void fetch('/api/workspace/dashboard', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) return
      const data = await response.json() as { metrics?: { team?: number; leads?: number; clients?: number; projects?: number; tickets?: number; contracts?: number; messages?: number; openReceivables?: number; overdueReceivables?: number; receivedThisMonth?: number }; ranking?: DashboardRankingMember[]; activity?: DashboardActivity[]; upcoming?: DashboardDue[]; projectStatus?: DashboardProjectStatus[] }
      setDashboardData({ team: data.metrics?.team ?? 0, leads: data.metrics?.leads ?? 0, clients: data.metrics?.clients ?? 0, projects: data.metrics?.projects ?? 0, tickets: data.metrics?.tickets ?? 0, contracts: data.metrics?.contracts ?? 0, messages: data.metrics?.messages ?? 0, openReceivables: data.metrics?.openReceivables ?? 0, overdueReceivables: data.metrics?.overdueReceivables ?? 0, receivedThisMonth: data.metrics?.receivedThisMonth ?? 0, ranking: data.ranking ?? [], activity: data.activity ?? [], upcoming: data.upcoming ?? [], projectStatus: data.projectStatus ?? [] })
    })
  }, [activeSection])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        setAssistantOpen((current) => !current)
        setSearchOpen(false)
      } else if (event.key === 'Escape') {
        setAssistantOpen(false)
        setSearchOpen(false)
        setNotificationsOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (searchOpen) searchInput.current?.focus()
    else setSearchQuery('')
  }, [searchOpen])

  async function loadNotifications() {
    setNotificationsLoading(true)
    setNotificationsError('')
    try {
      const { data, error } = await createClient().from('notifications')
        .select('id,message,notification_type,entity_type,entity_id,link_path,read_at,created_at')
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) {
        console.error('Workspace notifications load failed:', error.message)
        setNotificationsError('Não foi possível carregar as notificações.')
      } else {
        setNotifications(data ?? [])
        const user = (await createClient().auth.getUser()).data.user
        if (user) {
          const loadedNotifications = (data ?? []) as WorkspaceNotification[]
        const taskIds = loadedNotifications.filter((item: WorkspaceNotification) => ['task_share_request', 'task_transfer_request', 'task_share', 'task_transfer'].includes(item.notification_type)).map((item: WorkspaceNotification) => item.entity_id).filter(Boolean)
          const pending = taskIds.length ? await createClient().from('task_transfer_requests').select('task_id').eq('target_id', user.id).eq('status', 'pending').in('task_id', taskIds) : { data: [] }
          setActionableNotificationIds(((pending.data ?? []) as { task_id: string }[]).map((item) => loadedNotifications.find((notification: WorkspaceNotification) => notification.entity_id === item.task_id)?.id).filter(Boolean) as string[])
        }
      }
    } catch (error) {
      console.error('Workspace notifications request failed:', error)
      setNotificationsError('Não foi possível carregar as notificações.')
    } finally {
      setNotificationsLoading(false)
    }
  }

  async function toggleNotifications() {
    const opening = !notificationsOpen
    setNotificationsOpen(opening)
    if (opening) await loadNotifications()
  }

  async function markNotificationRead(notification: WorkspaceNotification) {
    if (notification.read_at) return
    const readAt = new Date().toISOString()
    try {
      const { data, error } = await createClient().from('notifications')
        .update({ read_at: readAt })
        .eq('id', notification.id)
        .select('id')
        .maybeSingle()
      if (error || !data) {
        console.error('Workspace notification update failed:', error?.message ?? 'No notification row was updated')
        setNotificationsError('Não foi possível marcar a notificação como lida.')
        return
      }
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: readAt } : item))
    } catch (error) {
      console.error('Workspace notification update request failed:', error)
      setNotificationsError('Não foi possível marcar a notificação como lida.')
    }
  }

  async function respondToTaskNotification(notification: WorkspaceNotification, status: 'accepted' | 'rejected') {
    if (!notification.entity_id) return
    const supabase = createClient()
    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id
    if (!userId) return
    const { data: request, error: requestError } = await supabase.from('task_transfer_requests').select('id').eq('task_id', notification.entity_id).eq('target_id', userId).eq('status', 'pending').order('created_at', { ascending: false }).maybeSingle()
    if (requestError || !request) return
    const { error } = await supabase.rpc('respond_task_transfer_request', { p_request_id: request.id, p_status: status })
    if (error) {
      setNotificationsError('Não foi possível responder à solicitação de tarefa.')
      return
    }
    await markNotificationRead(notification)
    await loadNotifications()
  }

  const searchItems: SearchItem[] = navigationGroups.flatMap((group) => group.items.flatMap((item) => {
    const slug = sectionSlugs[item.label]
    return slug && hasWorkspaceAccess(permissions, slug) ? [{ label: item.label, slug, group: group.label }] : []
  }))
  const matchingSearchItems = searchItems.filter((item) =>
    `${item.label} ${item.group}`.toLocaleLowerCase('pt-BR').includes(searchQuery.trim().toLocaleLowerCase('pt-BR')),
  )
  const canUseAssistant = permissions.includes('*') || permissions.length > 0
  const moduleRoute = pathname.split('/').filter(Boolean)[1]
  const shouldRenderRoutePage = page !== null && page !== undefined && (moduleRoute !== undefined || !hasWorkspaceAccess(permissions, 'dashboard'))

  async function signOut() {
    await createClient().auth.signOut()
    setMobileOpen(false)
    router.replace('/')
  }

  function openSection(label: string) {
    const slug = sectionSlugs[label] ?? 'dashboard'
    setActiveSection(label)
    setMobileOpen(false)
    router.push(slug === 'dashboard' ? '/workspace' : `/workspace/${slug}`)
  }

  function openSearchItem(item: SearchItem) {
    setSearchOpen(false)
    setActiveSection(item.label)
    router.push(item.slug === 'dashboard' ? '/workspace' : `/workspace/${item.slug}`)
  }

  return (
    <div className="workspace-shell min-h-screen bg-[#090b10] text-slate-100">
      <aside className={`workspace-sidebar fixed inset-y-0 left-0 z-40 flex w-[258px] flex-col border-r border-white/[0.08] bg-[var(--workspace-sidebar)] transition-transform duration-200 lg:translate-x-0 ${collapsed ? 'lg:w-[78px]' : ''} ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-24 items-center border-b border-white/[0.08] px-3">
          <div className="flex min-w-0 flex-1 items-center justify-center">
            <Image src="/codexa-logo.png" alt="Codexa" width={150} height={150} priority className={`shrink-0 object-contain ${collapsed ? 'size-16' : 'size-24'}`} />
          </div>
          <button onClick={() => setCollapsed(!collapsed)} className="ml-auto hidden rounded-md p-1.5 text-slate-500 hover:bg-white/5 hover:text-slate-200 lg:block" aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}>{collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}</button>
          <button onClick={() => setMobileOpen(false)} className="ml-auto rounded-md p-1.5 text-slate-500 lg:hidden" aria-label="Fechar menu"><X className="size-4" /></button>
        </div>
        <nav aria-label="Navegação principal" className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
          {navigationGroups.map((group) => {
            const visibleItems = group.items.filter((item) => {
              const slug = sectionSlugs[item.label]
              return Boolean(slug && hasWorkspaceAccess(permissions, slug))
            })
            if (!visibleItems.length) return null
            return (
            <div key={group.label} role="group" aria-label={group.label}>
              {!collapsed ? <button type="button" onClick={() => setOpenNavGroups((current) => { const next = new Set(current); if (next.has(group.label)) next.delete(group.label); else next.add(group.label); return next })} className="mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 hover:bg-white/[0.04] hover:text-slate-300"><span>{group.label}</span><ChevronDown className={`size-3 transition-transform ${openNavGroups.has(group.label) ? 'rotate-180' : ''}`} /></button> : null}
              {(collapsed || openNavGroups.has(group.label)) && <div className="flex flex-col gap-0.5">
                {visibleItems.map((item) => {
                  const icon = item.icon
                  const isActive = activeSection === item.label
                  return <button key={item.label} onClick={() => openSection(item.label)} className={`group relative flex min-h-10 items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-left text-[13px] transition-colors ${isActive ? 'workspace-nav-active font-medium' : 'border-transparent text-slate-400 hover:bg-white/[0.04] hover:text-slate-100'} ${collapsed ? 'justify-center px-0' : ''}`} title={collapsed ? item.label : undefined} aria-current={isActive ? 'page' : undefined}><FontAwesomeIcon icon={icon} className={`size-3.5 shrink-0 ${isActive ? 'workspace-nav-icon-active' : 'text-slate-500 group-hover:text-slate-300'}`} />{!collapsed && <span className="truncate">{item.label}</span>}</button>
                })}
              </div>}
            </div>
          )})}
        </nav>
        {!collapsed && <button onClick={() => openSection('Meu perfil')} className="border-t border-white/[0.07] p-3 text-left"><span className="flex items-center gap-3 rounded-lg p-2"><UserAvatar user={avatarUser} size="sm" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-slate-200">{displayName}</span><span className="block truncate text-[11px] text-slate-500">Meu perfil</span></span></span></button>}
      </aside>
      {mobileOpen && <button className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Fechar menu" />}
      <div className={`transition-[margin] duration-200 ${collapsed ? 'lg:ml-[78px]' : 'lg:ml-[258px]'}`}>
        <header className="workspace-header sticky top-0 z-20 flex min-h-[72px] flex-wrap items-center gap-2 border-b border-white/[0.08] bg-[var(--workspace-header)] px-3 py-2 backdrop-blur-xl sm:gap-4 sm:px-7">
          <button className="rounded-md p-2 text-slate-400 hover:bg-white/5 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menu"><Menu className="size-5" /></button>
          <div className="hidden items-center gap-2 text-xs text-slate-500 sm:flex"><span>Workspace</span><ChevronRight className="size-3" /><span className="text-slate-300">{activeSection}</span></div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setSearchOpen(true)} aria-label="Buscar (Ctrl+K)" className="hidden items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-xs text-slate-500 transition-colors hover:border-white/15 hover:text-slate-300 md:flex"><Search className="size-3.5" />Buscar<span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-600">Ctrl K</span></button>
            {canUseAssistant && <button type="button" onClick={() => setAssistantOpen((current) => !current)} aria-label={assistantHasConversation ? 'Code-X, conversa ativa' : 'Code-X'} aria-expanded={assistantOpen} title="Code-X · Ctrl+Shift+A" className={`relative grid size-9 place-items-center overflow-hidden rounded-lg border transition-colors ${assistantOpen ? 'border-blue-400/40 bg-blue-400/10 text-blue-200' : 'border-white/[0.08] bg-white/[0.025] text-slate-400 hover:border-white/15 hover:text-slate-100'}`}><Image src="/codexa-logo.png" alt="" width={28} height={28} className="size-7 object-contain" />{assistantHasConversation && <span aria-hidden="true" className="absolute right-1 top-1 size-1.5 rounded-full bg-emerald-400" />}</button>}
            <div className="relative">
              <button onClick={() => void toggleNotifications()} className="relative rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Notificações" aria-expanded={notificationsOpen}>
                <Bell className="size-[18px]" />
                {notifications.some((notification) => !notification.read_at) && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-blue-400" />}
              </button>
              {notificationsOpen && <section className="fixed left-2 right-2 top-[4.25rem] z-50 max-h-[calc(100vh-5rem)] overflow-hidden rounded-xl border border-white/[0.1] bg-[#11161e] shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-[min(24rem,calc(100vw-2rem))]" aria-label="Notificações recentes">
                <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3"><div><h2 className="text-sm font-semibold text-slate-100">Notificações</h2><p className="text-[11px] text-slate-500">{notifications.filter((notification) => !notification.read_at).length} não lida(s)</p></div><button onClick={() => void loadNotifications()} aria-label="Atualizar notificações" className="rounded px-2 py-1 text-xs text-blue-300 hover:bg-white/[0.05]">Atualizar</button></div>
                {notificationsError && <p role="alert" className="px-4 py-3 text-xs text-rose-300">{notificationsError}</p>}
                <div className="max-h-96 overflow-y-auto">
                  {notificationsLoading ? <p className="px-4 py-8 text-center text-xs text-slate-500">Carregando notificações...</p>
                    : notifications.length ? notifications.map((notification) => <div key={notification.id} className={`flex gap-3 border-b border-white/[0.05] px-4 py-3 last:border-0 hover:bg-white/[0.04] ${notification.read_at ? 'opacity-70' : ''}`}>
                      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${notification.read_at ? 'bg-slate-600' : 'bg-blue-400'}`} />
                      <div className="min-w-0 flex-1"><button type="button" onClick={() => { void markNotificationRead(notification); if (notification.link_path) router.push(notification.link_path) }} className="block w-full text-left"><span className="block text-xs leading-5 text-slate-200">{notification.message}</span><span className="mt-1 block text-[10px] text-slate-500">{new Date(notification.created_at).toLocaleString('pt-BR')}</span></button>{actionableNotificationIds.includes(notification.id) && !notification.notification_type.startsWith('task_admin_') ? <div className="mt-2 flex gap-2"><button type="button" onClick={() => void respondToTaskNotification(notification, 'accepted')} className="rounded bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/25">Aceitar</button><button type="button" onClick={() => void respondToTaskNotification(notification, 'rejected')} className="rounded bg-rose-500/15 px-2 py-1 text-[11px] font-medium text-rose-300 hover:bg-rose-500/25">Rejeitar</button></div> : null}</div>
                    </div>)
                    : !notificationsError && <p className="px-4 py-8 text-center text-xs text-slate-500">Nenhuma notificação encontrada.</p>}
                </div>
              </section>}
            </div>
            <div className="mx-1 h-5 w-px bg-white/10" />
            <button onClick={() => openSection('Meu perfil')} className="flex items-center gap-2 rounded-lg p-1.5 pr-2 hover:bg-white/5" aria-label={`Perfil de ${displayName}`}>
              <UserAvatar user={avatarUser} size="sm" />
              <span className="hidden max-w-32 truncate text-xs text-slate-300 sm:block">{displayName}</span>
              <ChevronDown className="size-3.5 text-slate-500" />
            </button>
            <button onClick={() => void signOut()} className="rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-white/5 hover:text-white" aria-label="Sair da conta">Sair</button>
          </div>
        </header>
        <main className="workspace-main mx-auto w-full max-w-[1500px] overflow-x-hidden px-3 py-5 sm:px-7 sm:py-7 lg:px-9">{shouldRenderRoutePage ? page : <>{activeSection === 'Dashboard' &&         <div id="dashboard-overview" className="scroll-mt-24"><div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-blue-400">Visão geral</p><h1 className="text-2xl font-semibold tracking-tight text-white sm:text-[28px]">Olá, {displayName}</h1><p className="mt-1.5 text-sm text-slate-500">Acompanhe as áreas permitidas para você.</p></div>{permissions.includes('*') && <button className="flex w-fit items-center gap-2 rounded-lg bg-blue-500 px-3.5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-500/15 transition-colors hover:bg-blue-400"><Plus className="size-4" />Adicionar registro</button>}</div>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((metric) => ({ ...metric, value: metric.label === 'Leads ativos' ? String(dashboardData.leads) : metric.label === 'Clientes ativos' ? String(dashboardData.clients) : metric.label === 'Projetos em andamento' ? String(dashboardData.projects) : metric.label === 'Chamados abertos' ? String(dashboardData.tickets) : metric.label === 'Contratos ativos' ? String(dashboardData.contracts) : metric.label === 'Valores a receber' ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(dashboardData.openReceivables) : metric.label === 'Valores vencidos' ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(dashboardData.overdueReceivables) : metric.label === 'Receita no mês' ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(dashboardData.receivedThisMonth) : metric.value, hint: metric.label === 'Clientes ativos' ? 'Clientes cadastrados' : metric.label === 'Leads ativos' ? 'Leads cadastrados' : metric.label === 'Chamados abertos' ? 'Chamados em aberto' : metric.label === 'Valores a receber' ? 'Saldo pendente de recebimento' : metric.label === 'Valores vencidos' ? 'Saldo vencido em aberto' : metric.label === 'Receita no mês' ? 'Recebimentos no mês atual' : metric.hint })).filter((metric) => {
            const metricPermission: Record<string, string> = {
              'Leads ativos': 'leads:view', 'Clientes ativos': 'clients:view', 'Projetos em andamento': 'projects:view',
              'Chamados abertos': 'support:view', 'Contratos ativos': 'contracts:view',
              'Valores a receber': 'accounts_receivable:view', 'Valores vencidos': 'accounts_receivable:view',
              'Receita no mês': 'finance:view',
            }
            return permissions.includes('*') || permissions.includes(metricPermission[metric.label])
          }).map((metric) => { const icon = metric.icon; return <article key={metric.label} className="rounded-xl border border-white/[0.07] bg-[#11161e] p-4 transition-colors hover:border-white/[0.12]"><div className="flex items-start justify-between"><div className={`grid size-9 place-items-center rounded-lg ${toneClasses[metric.tone]}`}><FontAwesomeIcon icon={icon} className="size-4" /></div><button aria-label={`Mais opções de ${metric.label}`} className="text-slate-600 hover:text-slate-300"><MoreHorizontal className="size-4" /></button></div><p className="mt-4 text-xs text-slate-500">{metric.label}</p><p className="mt-1 text-xl font-semibold tracking-tight text-slate-100">{metric.value}</p><p className="mt-1 text-[11px] text-slate-600">{metric.hint}</p></article> })}</section>
          <DashboardDataPanels data={dashboardData} />
          <section className="mt-6 rounded-xl border border-white/[0.07] bg-[#11161e]"><div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4"><div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-lg bg-amber-400/10 text-amber-300"><FontAwesomeIcon icon={faTrophy} className="size-4" /></div><div><h2 className="text-sm font-semibold text-slate-200">Ranking da empresa</h2><p className="mt-0.5 text-xs text-slate-500">Evolução da equipe por XP e nível</p></div></div><span className="text-xs text-slate-500">Atualizado agora</span></div><div className="divide-y divide-white/[0.06]">{dashboardData.ranking.length ? dashboardData.ranking.map((member, index) => <div key={member.id} className="flex items-center gap-3 px-5 py-3"><span className={`grid size-7 place-items-center rounded-lg text-xs font-semibold ${index === 0 ? 'bg-amber-300/15 text-amber-200' : 'bg-white/[.04] text-slate-400'}`}>{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-slate-200">{member.full_name}</p><p className="text-[10px] text-slate-500">{member.role_name} · nível {member.level} · marco: {member.milestone_name ?? 'Iniciante'}</p></div><span className="text-xs font-semibold text-cyan-300">{member.xp} XP</span></div>) : <div className="flex min-h-[150px] items-center justify-center px-6 text-center"><p className="text-xs text-slate-600">Adicione XP à equipe para formar o ranking.</p></div>}</div></section>

          </div>}
          {['Leads', 'Mensagens', 'Clientes'].includes(activeSection) && <div id="crm-workspace" className="scroll-mt-24"><CrmWorkspace initialModule={activeSection === 'Clientes' ? 'clients' : activeSection === 'Mensagens' ? 'messages' : 'leads'} permissions={permissions} /></div>}
          {['Propostas', 'Contratos'].includes(activeSection) && <div id="commercial-workspace" className="scroll-mt-24"><CommercialWorkspace initialTab={activeSection === 'Contratos' ? 'contracts' : 'proposals'} permissions={permissions} /></div>}
          {['Projetos', 'Solicitações de alteração', 'Suporte'].includes(activeSection) && <div id="operations-workspace" className="scroll-mt-24"><OperationsWorkspace permissions={permissions} initialModule={activeSection === 'Suporte' ? 'support_tickets' : activeSection === 'Solicitações de alteração' ? 'change_requests' : 'projects'} /></div>}
          {['Sistemas dos clientes', 'Módulos'].includes(activeSection) && <div id="catalog-workspace" className="scroll-mt-24"><CatalogWorkspace initialTab={activeSection === 'Módulos' ? 'modules' : 'systems'} /></div>}
          {['Contas a receber', 'Contas a pagar', 'Fluxo de caixa', 'Transações', 'Categorias financeiras'].includes(activeSection) && <div id="finance-workspace" className="scroll-mt-24"><FinanceWorkspace initialTab={activeSection === 'Contas a receber' ? 'receivable' : activeSection === 'Contas a pagar' ? 'payable' : activeSection === 'Fluxo de caixa' ? 'cashflow' : 'overview'} permissions={permissions} /></div>}
          {activeSection === 'Relatórios' && <div id="reports-workspace" className="scroll-mt-24"><ReportsWorkspace permissions={permissions} /></div>}
          {['Equipe', 'Configurações'].includes(activeSection) && <div id="admin-workspace" className="scroll-mt-24"><AdminWorkspace section={activeSection} permissions={permissions} /></div>}
          {activeSection === 'Configuração de XP' && <XpSettingsWorkspace />}
  {activeSection === 'Auditoria' && <ActivityHistoryWorkspace permissions={permissions} mode="audit" />}
          {activeSection === 'Meu histórico' && <ActivityHistoryWorkspace permissions={permissions} mode="personal" />}
          {activeSection === 'Meu perfil' && <GamifiedProfileWorkspace initialName={profileName} />}
  {activeSection === 'Aparência' && <AccountWorkspace section={activeSection} initialName={profileName} />}
          {!['Dashboard', 'Leads', 'Mensagens', 'Clientes', 'Propostas', 'Contratos', 'Projetos', 'Solicitações de alteração', 'Suporte', 'Sistemas', 'Módulos', 'Planos', 'Licenças', 'Financeiro', 'Equipe', 'Relatórios', 'Configurações', 'Auditoria', 'Meu histórico', 'Emblemas', 'Configuração de XP'].includes(activeSection) && <section className="rounded-xl border border-white/[0.07] bg-[#11161e] p-8"><p className="text-xs font-medium uppercase tracking-[0.16em] text-blue-400">Módulo</p><h1 className="mt-2 text-2xl font-semibold text-white">{activeSection}</h1><p className="mt-2 text-sm text-slate-500">Esta página está preparada para receber os registros deste módulo.</p></section>}
          </>}
        </main>
      </div>
      {searchOpen && <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/65 px-4 pt-[12vh]" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false) }}>
        <section role="dialog" aria-modal="true" aria-label="Buscar módulos" className="w-full max-w-xl overflow-hidden rounded-xl border border-white/[0.1] bg-[#11161e] shadow-2xl">
          <div className="flex items-center gap-3 border-b border-white/[0.08] px-4"><Search className="size-4 text-slate-500" /><input ref={searchInput} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Buscar módulo..." className="h-14 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500" /><kbd className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-500">ESC</kbd></div>
          {canUseAssistant && <button type="button" onClick={() => { setSearchOpen(false); setAssistantOpen(true) }} className="flex w-full items-center gap-3 border-b border-white/[0.07] px-4 py-3 text-left hover:bg-blue-500/10"><span className="grid size-7 place-items-center rounded-lg bg-blue-500/15 text-blue-300"><Sparkles className="size-3.5" /></span><span className="flex-1"><span className="block text-xs font-semibold text-slate-200">Perguntar ao Code-X</span><span className="block text-[10px] text-slate-500">Converse enquanto navega pelo workspace</span></span><kbd className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-500">Ctrl ⇧ A</kbd></button>}
          <div className="max-h-[55vh] overflow-y-auto p-2">
            {matchingSearchItems.length ? matchingSearchItems.map((item) => <button key={item.slug} onClick={() => openSearchItem(item)} className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm text-slate-200 hover:bg-blue-500/10 hover:text-blue-200"><span>{item.label}</span><span className="text-[11px] text-slate-500">{item.group}</span></button>)
              : <p className="px-3 py-8 text-center text-sm text-slate-500">Nenhum módulo encontrado.</p>}
          </div>
          <div className="border-t border-white/[0.07] px-4 py-2 text-[10px] text-slate-600">Navegue somente pelos módulos que seu cargo pode acessar.</div>
        </section>
      </div>}
      {canUseAssistant && <CommandAssistant
        context={`Módulo atual: ${activeSection}. Rota atual: ${pathname.replace(/\/[0-9a-f-]{20,}/gi, '/:id')}`}
        module={pathname.split('/').filter(Boolean)[1] ?? 'dashboard'}
        isOpen={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        onConversationActiveChange={setAssistantHasConversation}
      />}
    </div>
  )
}

export function DashboardShell({ initialSection = 'Dashboard', page, children, permissions = [], profileName = '' }: { initialSection?: string; page?: ReactNode; children?: ReactNode; permissions?: string[]; profileName?: string }) {
  const [authenticated, setAuthenticated] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    void supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      setAuthenticated(Boolean(data.session))
      setChecking(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => setAuthenticated(Boolean(session)))
    return () => listener.subscription.unsubscribe()
  }, [])

  if (checking) return <main className="grid min-h-screen place-items-center bg-[#080b10] text-sm text-slate-500">Carregando sessão...</main>
  if (!authenticated) return <AuthScreen onAuthenticated={() => setAuthenticated(true)} />
  return <DashboardContent initialSection={initialSection} page={children ?? page} permissions={permissions} profileName={profileName} />
}
