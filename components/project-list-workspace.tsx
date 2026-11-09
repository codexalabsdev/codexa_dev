'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BriefcaseBusiness, CalendarDays, CheckCircle2, CircleAlert, ClipboardList, FolderKanban, Loader2, Plus, Search, Users, X } from 'lucide-react'
import { hasWorkspaceAccess } from '@/lib/workspace-access'

type Project = {
  id: string
  name: string
  description: string | null
  status: string
  priority: string
  due_date: string | null
  completed_at: string | null
  created_at: string
  client_id: string | null
  responsible_id: string | null
  client: { id: string; legal_name: string; trade_name: string | null } | null
}

type ProjectTask = {
  id: string
  project_id: string | null
  title?: string
  status: string
  due_date: string | null
  received_from_user_id?: string | null
  received_via?: string | null
}

type Client = { id: string; legal_name: string; trade_name: string | null }
type TeamMember = { id: string; user_id: string | null; full_name: string; email: string; status: string }
type ModuleKey = 'projects' | 'change_requests' | 'support_tickets'

const moduleTabs: { key: ModuleKey; label: string; icon: typeof FolderKanban; href: string }[] = [
  { key: 'projects', label: 'Projetos', icon: FolderKanban, href: '/workspace/projetos' },
  { key: 'change_requests', label: 'Alterações', icon: ClipboardList, href: '/workspace/solicitacoes' },
  { key: 'support_tickets', label: 'Suporte', icon: BriefcaseBusiness, href: '/workspace/suporte' },
]

function normalized(value: string | null | undefined) {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}

function isDone(status: string) {
  return ['concluido', 'concluida', 'completed', 'done', 'finalizado', 'finalizada'].includes(normalized(status))
}

function isCanceled(status: string) {
  return ['cancelado', 'cancelada', 'canceled', 'cancelled'].includes(normalized(status))
}

function isActiveMember(member: TeamMember) {
  return ['ativo', 'active', 'habilitado'].includes(normalized(member.status))
}

function formatDate(value: string | null) {
  if (!value) return 'Sem prazo'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(`${value.slice(0, 10)}T12:00:00`))
}

export function ProjectListWorkspace({ onSwitchModule, permissions }: { onSwitchModule?: (module: ModuleKey) => void; permissions: string[] }) {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const [receivedTasks, setReceivedTasks] = useState<ProjectTask[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [responsibleFilter, setResponsibleFilter] = useState('')
  const [sortBy, setSortBy] = useState('created')
  const [modal, setModal] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { data: authData } = await supabase.auth.getUser()
    const [projectResult, taskResult, clientResult, memberResult, receivedResult] = await Promise.all([
      supabase.from('projects').select('id,name,description,status,priority,due_date,completed_at,created_at,client_id,responsible_id,client:clients(id,legal_name,trade_name)').order('created_at', { ascending: false }),
      supabase.from('project_tasks').select('id,project_id,status,due_date').order('created_at', { ascending: true }),
      supabase.from('clients').select('id,legal_name,trade_name').order('legal_name'),
      supabase.from('team_members').select('id,user_id,full_name,email,status').order('full_name'),
      authData.user ? supabase.from('project_tasks').select('id,project_id,title,status,due_date,received_from_user_id,received_via').or(`responsible_id.eq.${authData.user.id},participants.cs.{${authData.user.id}}`).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    ])

    const failed = projectResult.error || taskResult.error
    if (failed) {
      setError(failed.message)
      setLoading(false)
      return
    }

    const auxiliaryErrors = [clientResult.error, memberResult.error].filter(Boolean).map((item) => item.message)
    setProjects((projectResult.data ?? []) as Project[])
    setTasks((taskResult.data ?? []) as ProjectTask[])
    const visibleProjectIds = new Set((projectResult.data ?? []).map((project: Project) => project.id))
    setReceivedTasks(((receivedResult.data ?? []) as ProjectTask[]).filter((task) => !task.project_id || !visibleProjectIds.has(task.project_id)))
    setClients((clientResult.data ?? []) as Client[])
    setMembers((memberResult.data ?? []) as TeamMember[])
    if (auxiliaryErrors.length) setError(auxiliaryErrors.join(' · '))
    setLoading(false)
  }, [])

  useEffect(() => { void loadData() }, [loadData])

  const membersById = useMemo(() => {
    const map = new Map<string, TeamMember>()
    members.forEach((member) => {
      map.set(member.id, member)
      if (member.user_id) map.set(member.user_id, member)
    })
    return map
  }, [members])

  const taskCounts = useMemo(() => {
    const uniqueTasks = new Map(tasks.map((task) => [task.id, task]))
    const counts = new Map<string, { total: number; done: number; overdue: number }>()
    for (const task of uniqueTasks.values()) {
      if (isCanceled(task.status) || !task.project_id) continue
      const count = counts.get(task.project_id) ?? { total: 0, done: 0, overdue: 0 }
      count.total += 1
      if (isDone(task.status)) count.done += 1
      if (!isDone(task.status) && task.due_date && task.due_date < new Date().toISOString().slice(0, 10)) count.overdue += 1
      counts.set(task.project_id, count)
    }
    return counts
  }, [tasks])

  const filteredProjects = useMemo(() => {
    const term = normalized(query)
    const result = projects.filter((project) => {
      const responsible = project.responsible_id ? membersById.get(project.responsible_id) : null
      const clientName = project.client?.trade_name || project.client?.legal_name || ''
      return (!dateFilter || project.created_at.slice(0, 10) === dateFilter)
        && (!term || normalized(`${project.name} ${project.description ?? ''} ${clientName} ${responsible?.full_name ?? ''}`).includes(term))
        && (!statusFilter || project.status === statusFilter)
        && (!priorityFilter || project.priority === priorityFilter)
        && (!clientFilter || project.client_id === clientFilter)
        && (!responsibleFilter || project.responsible_id === responsibleFilter)
    })
    return result.sort((a, b) => {
      if (sortBy === 'deadline') return (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31')
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'pt-BR')
      if (sortBy === 'priority') return ['urgente', 'alta', 'media', 'baixa'].indexOf(normalized(a.priority)) - ['urgente', 'alta', 'media', 'baixa'].indexOf(normalized(b.priority))
      return b.created_at.localeCompare(a.created_at)
    })
  }, [clientFilter, dateFilter, membersById, priorityFilter, projects, query, responsibleFilter, sortBy, statusFilter])

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const id = crypto.randomUUID()
    setSaving(true)
    setError('')
    const { error: insertError } = await createClient().from('projects').insert({
      id,
      name: String(data.get('name') ?? '').trim(),
      description: String(data.get('description') ?? '').trim() || null,
      status: String(data.get('status') ?? 'Backlog'),
      priority: String(data.get('priority') ?? 'Média'),
      due_date: String(data.get('due_date') ?? '') || null,
      client_id: String(data.get('client_id') ?? '') || null,
      responsible_id: String(data.get('responsible_id') ?? '') || null,
    })
    setSaving(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setModal(false)
    router.push(`/workspace/projetos/${id}`)
  }

  const statusOptions = [...new Set(projects.map((project) => project.status).filter(Boolean))]
  const priorityOptions = [...new Set(projects.map((project) => project.priority).filter(Boolean))]
  const activeMembers = Array.from(new Map(members.filter(isActiveMember).map((member) => [member.user_id || member.id, member])).values())
  const canCreateProjects = permissions.includes('*') || permissions.includes('projects:create')
  const availableModuleTabs = moduleTabs.filter(({ key }) => hasWorkspaceAccess(permissions, key === 'support_tickets' ? 'suporte' : key === 'change_requests' ? 'solicitacoes' : 'projetos'))

  return (
    <section className="mt-6 space-y-5">
      <div className="rounded-xl border border-white/[0.07] bg-[#11161e]">
        <div className="flex flex-col gap-4 border-b border-white/[0.07] p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-blue-400">Operação e entrega</p>
            <h1 className="mt-1 text-xl font-semibold text-white">Projetos e entregas</h1>
            <p className="mt-1 text-sm text-slate-500">Acompanhe responsáveis, prazos e progresso das entregas.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {availableModuleTabs.map(({ key, label, icon: Icon, href }) => (
              <button key={key} onClick={() => key === 'projects' ? undefined : onSwitchModule ? onSwitchModule(key) : router.push(href)} className={`flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${key === 'projects' ? 'bg-blue-500 text-white' : 'bg-white/[0.04] text-slate-400 hover:text-white'}`} aria-current={key === 'projects' ? 'page' : undefined}>
                <Icon className="size-4" />{label}
              </button>
            ))}
            {canCreateProjects && <button onClick={() => setModal(true)} className="flex min-h-10 items-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-400">
              <Plus className="size-4" />Novo projeto
            </button>}
          </div>
        </div>
        <div className="grid gap-3 border-b border-white/[0.07] p-4 sm:grid-cols-2 xl:grid-cols-6">
          <label className="flex min-h-10 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 sm:col-span-2">
            <Search className="size-4 shrink-0 text-slate-500" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar projetos, clientes..." className="min-w-0 flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500" aria-label="Buscar projetos" />
          </label>
          <label className="field flex items-center gap-2 text-sm text-slate-400">Data<input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="min-w-0 bg-transparent text-slate-200 outline-none" aria-label="Filtrar por data" /></label>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="field" aria-label="Filtrar por status">
            <option value="">Todos os status</option>{statusOptions.map((value) => <option key={value}>{value}</option>)}
          </select>
          <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className="field" aria-label="Filtrar por prioridade">
            <option value="">Todas as prioridades</option>{priorityOptions.map((value) => <option key={value}>{value}</option>)}
          </select>
          <select value={clientFilter} onChange={(event) => setClientFilter(event.target.value)} className="field" aria-label="Filtrar por cliente">
            <option value="">Todos os clientes</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.trade_name || client.legal_name}</option>)}
          </select>
          <select value={responsibleFilter} onChange={(event) => setResponsibleFilter(event.target.value)} className="field" aria-label="Filtrar por responsável">
            <option value="">Todos os responsáveis</option>{activeMembers.map((member) => <option key={member.user_id || member.id} value={member.user_id || member.id}>{member.full_name}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <p className="text-sm text-slate-400">{filteredProjects.length} {filteredProjects.length === 1 ? 'projeto' : 'projetos'}</p>
          <label className="flex items-center gap-2 text-sm text-slate-500">Ordenar por
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="rounded-md border border-white/[0.08] bg-[#171d28] px-2 py-1.5 text-sm text-slate-200" aria-label="Ordenação">
              <option value="created">Mais recentes</option><option value="deadline">Prazo</option><option value="priority">Prioridade</option><option value="name">Nome</option>
            </select>
          </label>
        </div>
      </div>

      {error && <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-rose-400/20 bg-rose-400/5 px-4 py-3 text-sm text-rose-200"><span>{error}</span><button onClick={() => setError('')} aria-label="Fechar aviso"><X className="size-4" /></button></div>}
      {receivedTasks.length > 0 && <section className="rounded-xl border border-violet-400/20 bg-violet-400/5 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-semibold text-violet-100">Atividades recebidas</h2><p className="mt-1 text-xs text-violet-200/70">Acesso individual à tarefa; isso não libera o projeto inteiro.</p></div><span className="rounded-full bg-violet-400/15 px-2 py-1 text-xs text-violet-200">{receivedTasks.length}</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{receivedTasks.map((task) => <div key={task.id} className="rounded-lg border border-violet-300/10 bg-[#11161e] p-3"><div className="flex items-start justify-between gap-2"><p className="text-sm font-medium text-slate-100">{task.title || 'Atividade recebida'}</p><span className="shrink-0 rounded bg-violet-400/10 px-2 py-1 text-[10px] text-violet-200">{task.received_via?.includes('transfer') ? 'Transferida' : 'Compartilhada'}</span></div><p className="mt-2 text-xs text-slate-400">{task.status}</p></div>)}</div></section>}
      {loading ? (
        <div className="flex min-h-48 items-center justify-center rounded-xl border border-white/[0.07] bg-[#11161e] text-sm text-slate-400"><Loader2 className="mr-2 size-4 animate-spin" />Carregando projetos...</div>
      ) : filteredProjects.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.12] bg-[#11161e] px-6 text-center">
          <div className="mb-4 grid size-12 place-items-center rounded-xl bg-blue-400/10 text-blue-300"><FolderKanban className="size-6" /></div>
          <h2 className="text-base font-semibold text-slate-200">{projects.length ? 'Nenhum projeto corresponde aos filtros' : 'Nenhum projeto cadastrado'}</h2>
          <p className="mt-1 max-w-md text-sm text-slate-500">{projects.length ? 'Altere a busca ou remova alguns filtros.' : 'Crie seu primeiro projeto para acompanhar tarefas, arquivos e atividade.'}</p>
          {!projects.length && canCreateProjects && <button onClick={() => setModal(true)} className="mt-5 flex min-h-10 items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-400"><Plus className="size-4" />Criar projeto</button>}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {filteredProjects.map((project) => {
            const count = taskCounts.get(project.id) ?? { total: 0, done: 0, overdue: 0 }
            const progress = count.total ? Math.round(count.done / count.total * 100) : 0
            const projectOverdue = project.due_date && project.due_date < new Date().toISOString().slice(0, 10) && !isDone(project.status) && normalized(project.status) !== 'arquivado'
            const member = project.responsible_id ? membersById.get(project.responsible_id) : null
            const clientName = project.client?.trade_name || project.client?.legal_name || 'Cliente não associado'
            return (
              <Link key={project.id} href={`/workspace/projetos/${project.id}`} className="group rounded-xl border border-white/[0.07] bg-[#11161e] p-5 transition-colors hover:border-blue-400/40 hover:bg-[#151b25] focus-visible:outline-blue-300">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-slate-100 group-hover:text-blue-200">{project.name}</p>
                    <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-slate-400">{project.description || 'Sem descrição cadastrada.'}</p>
                  </div>
                  <span className="shrink-0 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-xs text-slate-300">{project.status}</span>
                </div>
                <div className="mt-4 grid gap-2 text-sm text-slate-400">
                  <p className="flex items-center gap-2 truncate"><BriefcaseBusiness className="size-4 shrink-0 text-slate-500" />{clientName}</p>
                  <p className="flex items-center gap-2 truncate"><Users className="size-4 shrink-0 text-slate-500" />{member?.full_name || 'Sem responsável'}</p>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-md bg-blue-400/10 px-2 py-1 font-medium text-blue-200">{project.priority}</span>
                  <span className="inline-flex items-center gap-1.5 text-slate-400"><CalendarDays className="size-3.5" />{formatDate(project.due_date)}</span>
                  {projectOverdue && <span className="inline-flex items-center gap-1 rounded-md bg-rose-400/10 px-2 py-1 text-rose-200"><CircleAlert className="size-3.5" />Projeto atrasado</span>}
                  {count.overdue > 0 && <span className="inline-flex items-center gap-1 rounded-md bg-amber-400/10 px-2 py-1 text-amber-200"><CircleAlert className="size-3.5" />{count.overdue} tarefas atrasadas</span>}
                </div>
                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 text-slate-400"><CheckCircle2 className="size-3.5" />{count.total ? `${count.done} de ${count.total} tarefas concluídas` : 'Sem tarefas'}</span>
                    <span className="font-semibold tabular-nums text-slate-200">{count.total ? `${progress}%` : '—'}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]" role="progressbar" aria-label={`Progresso do projeto ${project.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                    <div className="h-full rounded-full bg-blue-400 transition-[width]" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {modal && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(false) }}>
        <div role="dialog" aria-modal="true" aria-labelledby="new-project-title" className="my-auto w-full max-w-xl rounded-xl border border-white/10 bg-[#151b24] p-5 shadow-2xl">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div><h2 id="new-project-title" className="text-lg font-semibold text-white">Novo projeto</h2><p className="mt-1 text-sm text-slate-400">Os dados serão salvos no workspace.</p></div>
            <button onClick={() => setModal(false)} aria-label="Fechar formulário" className="rounded-md p-1 text-slate-400 hover:bg-white/5 hover:text-white"><X className="size-5" /></button>
          </div>
          <form onSubmit={createProject} className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm text-slate-300 sm:col-span-2">Nome do projeto<input required name="name" autoFocus className="field" /></label>
            <label className="grid gap-1.5 text-sm text-slate-300 sm:col-span-2">Descrição<textarea name="description" rows={3} className="field resize-y" /></label>
            <label className="grid gap-1.5 text-sm text-slate-300">Cliente<select name="client_id" className="field"><option value="">Sem cliente</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.trade_name || client.legal_name}</option>)}</select></label>
            <label className="grid gap-1.5 text-sm text-slate-300">Responsável<select name="responsible_id" className="field"><option value="">Sem responsável</option>{activeMembers.map((member) => <option key={member.user_id || member.id} value={member.user_id || member.id}>{member.full_name}</option>)}</select></label>
            <label className="grid gap-1.5 text-sm text-slate-300">Prioridade<select name="priority" className="field"><option>Média</option><option>Baixa</option><option>Alta</option><option>Urgente</option></select></label>
            <label className="grid gap-1.5 text-sm text-slate-300">Prazo<input type="date" name="due_date" className="field" /></label>
            <label className="grid gap-1.5 text-sm text-slate-300">Status<select name="status" className="field"><option>Backlog</option><option>Em andamento</option><option>Concluído</option></select></label>
            <div className="mt-2 flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setModal(false)} className="min-h-10 rounded-lg px-4 text-sm text-slate-400 hover:bg-white/5 hover:text-white">Cancelar</button><button disabled={saving} className="flex min-h-10 items-center gap-2 rounded-lg bg-blue-500 px-4 text-sm font-semibold text-white hover:bg-blue-400 disabled:opacity-60">{saving && <Loader2 className="size-4 animate-spin" />}Criar projeto</button></div>
          </form>
        </div>
      </div>}
    </section>
  )
}
