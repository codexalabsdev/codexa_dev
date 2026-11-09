'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { EntityAttachments } from '@/components/entity-attachments'
import { TaskSharing } from '@/components/task-sharing'
import { ProjectMembersPanel } from '@/components/project-members-panel'
import { ArrowLeft, BriefcaseBusiness, CalendarDays, CheckCircle2, CircleAlert, ClipboardList, Clock3, FileText, Flag, FolderKanban, GripVertical, Loader2, MessageSquare, MoreHorizontal, Paperclip, Plus, Search, Save, Send, Trash2, Users, X } from 'lucide-react'

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
  received_from_user_id?: string | null
  received_via?: string | null
  title: string
  description: string | null
  status: string
  priority: string
  due_date: string | null
  responsible_id: string | null
  created_at: string
  updated_at: string
  sort_order: number
  participants?: string[] | null
}

type TeamMember = { id: string; user_id: string | null; full_name: string; email: string; status: string; avatar_url?: string | null }
type Client = { id: string; legal_name: string; trade_name: string | null }
type TaskComment = { id: string; task_id: string; author_id: string; body: string; created_at: string; updated_at: string }
type ProjectActivity = { id: string; project_id: string; task_id: string | null; actor_id: string | null; event_type: string; summary: string; metadata: Record<string, unknown>; created_at: string }
type Tab = 'overview' | 'kanban' | 'tasks' | 'files' | 'activity'

const columns = [
  { status: 'Backlog', label: 'Backlog' },
  { status: 'A fazer', label: 'A fazer' },
  { status: 'Em andamento', label: 'Em andamento' },
  { status: 'Em revisão', label: 'Em revisão' },
  { status: 'Concluído', label: 'Concluído' },
]

function normalize(value: string | null | undefined) {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}

function isComplete(status: string) {
  return ['concluido', 'concluida', 'completed', 'done', 'finalizado', 'finalizada'].includes(normalize(status))
}

function isCanceled(status: string) {
  return ['cancelado', 'cancelada', 'canceled', 'cancelled'].includes(normalize(status))
}

function boardStatus(status: string) {
  const normalized = normalize(status)
  if (isComplete(status)) return 'Concluído'
  if (isCanceled(status)) return 'Cancelado'
  if (['em revisao', 'revisao', 'review', 'qa', 'validacao'].includes(normalized)) return 'Em revisão'
  if (['em andamento', 'in progress', 'in_progress', 'doing', 'desenvolvimento'].includes(normalized)) return 'Em andamento'
  if (['a fazer', 'todo', 'to do', 'pending', 'pendente'].includes(normalized)) return 'A fazer'
  if (['backlog', 'planejado', 'planned', ''].includes(normalized)) return 'Backlog'
  return status
}

function dateLabel(value: string | null) {
  if (!value) return 'Sem prazo'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(`${value.slice(0, 10)}T12:00:00`))
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function memberLabel(member: TeamMember | undefined) {
  return member?.full_name || member?.email || 'Sem responsável'
}

function priorityTone(priority: string) {
  const value = normalize(priority)
  if (value === 'urgente' || value === 'alta' || value === 'high') return 'border-rose-400/20 bg-rose-400/10 text-rose-200'
  if (value === 'media' || value === 'medium') return 'border-amber-400/20 bg-amber-400/10 text-amber-100'
  return 'border-white/[0.08] bg-white/[0.03] text-slate-300'
}

export function ProjectWorkspace({ projectId, permissions }: { projectId: string; permissions: string[] }) {
  const supabase = useMemo(() => createClient(), [])
  const [project, setProject] = useState<Project | null>(null)
  const [projectAccessLevel, setProjectAccessLevel] = useState<'viewer' | 'collaborator' | 'manager' | null>(null)
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const [members, setMembers] = useState<TeamMember[]>([])
  const [memberQuery, setMemberQuery] = useState('')
  const [clients, setClients] = useState<Client[]>([])
  const [taskIndicators, setTaskIndicators] = useState<Record<string, { comments: number; attachments: number }>>({})
  const [activity, setActivity] = useState<ProjectActivity[]>([])
  const [activityError, setActivityError] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('overview')
  const [taskFilter, setTaskFilter] = useState({ responsible: '', priority: '', deadline: '' })
  const [taskQuery, setTaskQuery] = useState('')
  const [taskDate, setTaskDate] = useState('')
  const [editProjectOpen, setEditProjectOpen] = useState(false)
  const [taskModal, setTaskModal] = useState<{ open: boolean; task: ProjectTask | null; status: string }>({ open: false, task: null, status: 'Backlog' })
  const [taskSaving, setTaskSaving] = useState(false)
  const [movingTaskId, setMovingTaskId] = useState('')
  const [commentItems, setCommentItems] = useState<TaskComment[]>([])
  const [commentBody, setCommentBody] = useState('')
  const [commentError, setCommentError] = useState('')
  const [commentLoading, setCommentLoading] = useState(false)
  const [commentSaving, setCommentSaving] = useState(false)
  const [editingComment, setEditingComment] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')
  const [notice, setNotice] = useState('')

  const hasPermission = (action: string) => permissions.includes('*') || permissions.includes(`projects:${action}`)
  const canCreateTasks = hasPermission('create') && (projectAccessLevel === 'collaborator' || projectAccessLevel === 'manager')
  const canUpdateTasks = hasPermission('update') && (projectAccessLevel === 'collaborator' || projectAccessLevel === 'manager')
  const canDeleteTasks = hasPermission('delete') && projectAccessLevel === 'manager'
  const canEditProject = hasPermission('update') && projectAccessLevel === 'manager'
  const canArchiveProject = hasPermission('archive') && projectAccessLevel === 'manager'
  const canDeleteProject = hasPermission('delete') && projectAccessLevel === 'manager'
  const canAssign = hasPermission('assign') && projectAccessLevel === 'manager'

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data: authData } = await supabase.auth.getUser()
    const [projectResult, taskResult, memberResult, clientResult, activityResult, accessResult] = await Promise.all([
      supabase.from('projects').select('id,name,description,status,priority,due_date,completed_at,created_at,client_id,responsible_id,client:clients(id,legal_name,trade_name)').eq('id', projectId).maybeSingle(),
      supabase.from('project_tasks').select('id,project_id,title,description,status,priority,due_date,responsible_id,participants,created_at,updated_at,sort_order').eq('project_id', projectId).order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
      canAssign
        ? supabase.rpc('list_project_assignable_members', { p_project_id: projectId })
        : supabase.from('team_members').select('id,user_id,full_name,email,status').order('full_name'),
      supabase.from('clients').select('id,legal_name,trade_name').order('legal_name'),
      supabase.from('project_activity').select('id,project_id,task_id,actor_id,event_type,summary,metadata,created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(100),
      supabase.rpc('project_access_level', { p_project_id: projectId }),
    ])

    if (projectResult.error) {
      setError(projectResult.error.message)
      setProject(null)
      setLoading(false)
      return
    }
    if (!projectResult.data) {
      setError('Projeto não encontrado ou você não tem acesso a ele.')
      setProject(null)
      setLoading(false)
      return
    }
    if (taskResult.error) {
      setError(taskResult.error.message)
      setLoading(false)
      return
    }

    const taskIds = ((taskResult.data ?? []) as ProjectTask[]).map((task) => task.id)
    if (taskIds.length) {
      const [commentResult, attachmentResult] = await Promise.all([
        supabase.from('task_comments').select('id,task_id').in('task_id', taskIds),
        supabase.from('entity_attachments').select('entity_id').eq('entity_type', 'task').in('entity_id', taskIds),
      ])
      const indicators: Record<string, { comments: number; attachments: number }> = {}
      taskIds.forEach((id: string) => { indicators[id] = { comments: 0, attachments: 0 } })
      if (!commentResult.error) {
        (commentResult.data as { task_id: string }[] | null)?.forEach(({ task_id }) => { indicators[task_id].comments += 1 })
      }
      if (!attachmentResult.error) {
        (attachmentResult.data as { entity_id: string }[] | null)?.forEach(({ entity_id }) => { if (indicators[entity_id]) indicators[entity_id].attachments += 1 })
      }
      setTaskIndicators(indicators)
    } else {
      setTaskIndicators({})
    }
    setProject(projectResult.data as Project)
    setProjectAccessLevel(accessResult.error ? null : accessResult.data as 'viewer' | 'collaborator' | 'manager' | null)
    setTasks((taskResult.data ?? []) as ProjectTask[])
    setMembers((memberResult.data ?? []) as TeamMember[])
    setClients((clientResult.data ?? []) as Client[])
    setActivity((activityResult.data ?? []) as ProjectActivity[])
    setActivityError(activityResult.error?.message ?? '')
    if (memberResult.error) setError(memberResult.error.message)
    if (accessResult.error) setError('Aplique a migration de compartilhamento de projetos para validar o nível de acesso.')
    setCurrentUserId(authData.user?.id ?? '')
    setLoading(false)
  }, [projectId, supabase])

  useEffect(() => { void loadData() }, [loadData])

  const memberById = useMemo(() => {
    const result = new Map<string, TeamMember>()
    members.forEach((member) => {
      result.set(member.id, member)
      if (member.user_id) result.set(member.user_id, member)
    })
    return result
  }, [members])

  const assignableMembers = useMemo(() => members.filter((member) => normalize(`${member.full_name} ${member.email}`).includes(normalize(memberQuery))), [memberQuery, members])

  const validTasks = useMemo(() => {
    const uniqueTasks = new Map(tasks.map((task) => [task.id, task]))
    return [...uniqueTasks.values()].filter((task) => !isCanceled(task.status))
  }, [tasks])

  const completedTasks = validTasks.filter((task) => isComplete(task.status)).length
  const inProgressTasks = validTasks.filter((task) => boardStatus(task.status) === 'Em andamento').length
  const pendingTasks = validTasks.filter((task) => ['Backlog', 'A fazer'].includes(boardStatus(task.status))).length
  const overdueTasks = validTasks.filter((task) => !isComplete(task.status) && task.due_date && task.due_date < new Date().toISOString().slice(0, 10)).length
  const progress = validTasks.length ? Math.round(completedTasks / validTasks.length * 100) : 0

  const filteredTasks = useMemo(() => tasks.filter((task) => {
    const member = task.responsible_id ? memberById.get(task.responsible_id) : null
    const isOverdue = Boolean(task.due_date && task.due_date < new Date().toISOString().slice(0, 10) && !isComplete(task.status) && !isCanceled(task.status))
    return (!taskDate || task.created_at.slice(0, 10) === taskDate)
      && (!taskQuery || normalize(`${task.title} ${task.description ?? ''}`).includes(normalize(taskQuery)))
      && (!taskFilter.responsible || task.responsible_id === taskFilter.responsible)
      && (!taskFilter.priority || task.priority === taskFilter.priority)
      && (!taskFilter.deadline || (taskFilter.deadline === 'overdue' ? isOverdue : taskFilter.deadline === 'has-date' ? Boolean(task.due_date) : !task.due_date))
      && (!taskFilter.responsible || Boolean(member))
  }), [memberById, taskDate, taskFilter, taskQuery, tasks])

  const taskStatusCounts = useMemo(() => {
    const counts = new Map<string, number>()
    tasks.forEach((task) => {
      const status = boardStatus(task.status)
      counts.set(status, (counts.get(status) ?? 0) + 1)
    })
    return counts
  }, [tasks])

  const taskPriorityOptions = [...new Set(tasks.map((task) => task.priority).filter(Boolean))]
  const extraStatuses = [...new Set(tasks.map((task) => boardStatus(task.status)).filter((status) => !columns.some((column) => column.status === status) && status !== 'Cancelado'))]

  async function reorderTask(task: ProjectTask, targetStatus: string, targetId?: string) {
    if (!canUpdateTasks || movingTaskId) return
    const sourceStatus = boardStatus(task.status)
    const previousTasks = tasks
    const destination = tasks.filter((item) => item.id !== task.id && boardStatus(item.status) === targetStatus).sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
    const targetIndex = targetId ? destination.findIndex((item) => item.id === targetId) : destination.length
    if (targetId && targetIndex < 0) return
    destination.splice(targetIndex, 0, { ...task, status: targetStatus })
    const sourceRemaining = sourceStatus === targetStatus ? [] : tasks.filter((item) => item.id !== task.id && boardStatus(item.status) === sourceStatus)
    const updates = [...destination.map((item, index) => ({ id: item.id, status: targetStatus, sort_order: index })), ...sourceRemaining.map((item, index) => ({ id: item.id, status: item.status, sort_order: index }))]
    setMovingTaskId(task.id)
    setError('')
    setTasks((current) => current.map((item) => { const next = updates.find((update) => update.id === item.id); return next ? { ...item, status: next.status, sort_order: next.sort_order } : item }))
    const results = await Promise.all(updates.map((update) => supabase.from('project_tasks').update({ status: update.status, sort_order: update.sort_order }).eq('id', update.id).eq('project_id', projectId)))
    const updateError = results.find((result) => result.error)?.error
    if (updateError) { setTasks(previousTasks); setError(updateError.message) } else { setNotice(targetStatus === sourceStatus ? 'Ordem do card atualizada.' : `Tarefa movida para ${targetStatus}.`); if (isComplete(targetStatus) && !isComplete(task.status)) void fetch('/api/workspace/xp/award', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actionKey: task.due_date && new Date(`${task.due_date}T23:59:59`) >= new Date() ? 'complete_task_on_time' : 'complete_task', entityType: 'task', entityId: task.id }) }) }
    setMovingTaskId('')
  }

  async function moveTask(task: ProjectTask, status: string) {
    if (task.status === status) return
    return reorderTask(task, status)
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canCreateTasks) return
    const data = new FormData(event.currentTarget)
    const id = crypto.randomUUID()
    setTaskSaving(true)
    setError('')
    const { error: insertError } = await supabase.from('project_tasks').insert({
      id,
      project_id: projectId,
      title: String(data.get('title') ?? '').trim(),
      description: String(data.get('description') ?? '').trim() || null,
      status: taskModal.status,
      sort_order: tasks.filter((task) => boardStatus(task.status) === taskModal.status).reduce((max, task) => Math.max(max, task.sort_order), -1) + 1,
      priority: String(data.get('priority') ?? 'Média'),
      due_date: String(data.get('due_date') ?? '') || null,
      responsible_id: canAssign ? String(data.get('responsible_id') ?? '') || null : null,
    })
    setTaskSaving(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setTaskModal({ open: false, task: null, status: 'Backlog' })
    void fetch('/api/workspace/xp/award', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actionKey: 'create_task', entityType: 'task', entityId: id }) })
    setNotice('Tarefa criada.')
    await loadData()
  }

  async function updateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!taskModal.task || !canUpdateTasks) return
    const data = new FormData(event.currentTarget)
    const task = taskModal.task
    setTaskSaving(true)
    setError('')
    const { error: updateError } = await supabase.from('project_tasks').update({
      title: String(data.get('title') ?? '').trim(),
      description: String(data.get('description') ?? '').trim() || null,
      status: String(data.get('status') ?? task.status),
      priority: String(data.get('priority') ?? task.priority),
      due_date: String(data.get('due_date') ?? '') || null,
      ...(canAssign ? { responsible_id: String(data.get('responsible_id') ?? '') || null } : {}),
    }).eq('id', task.id).eq('project_id', projectId)
    setTaskSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setTaskModal({ open: false, task: null, status: 'Backlog' })
    if (isComplete(String(data.get('status') ?? task.status)) && !isComplete(task.status)) {
      const onTime = task.due_date && new Date(`${task.due_date}T23:59:59`) >= new Date()
      void fetch('/api/workspace/xp/award', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actionKey: onTime ? 'complete_task_on_time' : 'complete_task', entityType: 'task', entityId: task.id }) })
    }
    setNotice('Tarefa atualizada.')
    await loadData()
  }

  async function updateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!project || !canEditProject) return
    const data = new FormData(event.currentTarget)
    setTaskSaving(true)
    setError('')
    const { error: updateError } = await supabase.from('projects').update({
      name: String(data.get('name') ?? '').trim(),
      description: String(data.get('description') ?? '').trim() || null,
      status: String(data.get('status') ?? project.status),
      priority: String(data.get('priority') ?? project.priority),
      due_date: String(data.get('due_date') ?? '') || null,
      ...(canAssign ? {
        responsible_id: String(data.get('responsible_id') ?? '') || null,
        client_id: String(data.get('client_id') ?? '') || null,
      } : {}),
    }).eq('id', project.id)
    setTaskSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setEditProjectOpen(false)
    const nextStatus = String(data.get('status') ?? project.status)
    if (isComplete(nextStatus) && !isComplete(project.status)) void fetch('/api/workspace/xp/award', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actionKey: 'deliver_project', entityType: 'project', entityId: project.id }) })
    setNotice('Projeto atualizado.')
    await loadData()
  }

  async function archiveProject() {
    if (!canArchiveProject || !project || !window.confirm(`Arquivar o projeto “${project.name}”?`)) return
    const { error: updateError } = await supabase.from('projects').update({ status: 'Arquivado' }).eq('id', project.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setNotice('Projeto arquivado.')
    await loadData()
  }

  async function deleteProject() {
    if (!canDeleteProject || !project || !window.confirm(`Excluir permanentemente o projeto “${project.name}”?`)) return
    const { error: deleteError } = await supabase.from('projects').delete().eq('id', project.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    window.location.assign('/workspace/projetos')
  }

  async function loadComments(taskId: string) {
    setCommentLoading(true)
    setCommentError('')
    const { data, error: queryError } = await supabase.from('task_comments').select('id,task_id,author_id,body,created_at,updated_at').eq('task_id', taskId).order('created_at', { ascending: true })
    if (queryError) {
      setCommentError(queryError.message)
      setCommentItems([])
    } else {
      setCommentItems((data ?? []) as TaskComment[])
    }
    setCommentLoading(false)
  }

  function openTask(task: ProjectTask) {
    setTaskModal({ open: true, task, status: task.status })
    setCommentBody('')
    void loadComments(task.id)
  }

  async function publishComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canUpdateTasks) return
    if (!taskModal.task || !currentUserId) {
      setCommentError('Entre novamente para publicar um comentário.')
      return
    }
    setCommentSaving(true)
    setCommentError('')
    const { error: insertError } = await supabase.from('task_comments').insert({
      task_id: taskModal.task.id,
      author_id: currentUserId,
      body: commentBody.trim(),
    })
    setCommentSaving(false)
    if (insertError) {
      setCommentError(insertError.message)
      return
    }
    setCommentBody('')
    await Promise.all([loadComments(taskModal.task.id), loadData()])
  }

  async function saveComment(comment: TaskComment, body: string) {
    if (!canUpdateTasks) return
    const { error: updateError } = await supabase.from('task_comments').update({ body: body.trim(), updated_at: new Date().toISOString() }).eq('id', comment.id).eq('author_id', currentUserId)
    if (updateError) {
      setCommentError(updateError.message)
      return
    }
    setEditingComment('')
    await Promise.all([loadComments(comment.task_id), loadData()])
  }

  async function deleteComment(comment: TaskComment) {
    if (!canUpdateTasks) return
    if (!window.confirm('Excluir seu comentário?')) return
    const { error: deleteError } = await supabase.from('task_comments').delete().eq('id', comment.id).eq('author_id', currentUserId)
    if (deleteError) {
      setCommentError(deleteError.message)
      return
    }
    await Promise.all([loadComments(comment.task_id), loadData()])
  }

  async function deleteTask(task: ProjectTask) {
    if (!canDeleteTasks || !window.confirm(`Excluir a tarefa “${task.title}”?`)) return
    const { error: deleteError } = await supabase.from('project_tasks').delete().eq('id', task.id).eq('project_id', projectId)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setTaskModal({ open: false, task: null, status: 'Backlog' })
    setNotice('Tarefa excluída.')
    await loadData()
  }

  if (loading && !project) return <section className="mt-6 flex min-h-60 items-center justify-center rounded-xl border border-white/[0.07] bg-[#11161e] text-sm text-slate-400"><Loader2 className="mr-2 size-4 animate-spin" />Carregando projeto...</section>
  if (!project) return <section className="mt-6 rounded-xl border border-white/[0.07] bg-[#11161e] p-6"><Link href="/workspace/projetos" className="inline-flex items-center gap-2 text-sm text-blue-300 hover:text-blue-200"><ArrowLeft className="size-4" />Voltar aos projetos</Link><p role="alert" className="mt-5 text-sm text-rose-200">{error || 'Projeto não encontrado.'}</p></section>

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Visão geral' },
    { id: 'kanban', label: 'Kanban' },
    { id: 'tasks', label: `Tarefas (${tasks.length})` },
    { id: 'files', label: 'Arquivos' },
    { id: 'activity', label: 'Atividade' },
  ]

  function taskCards(status: string) {
    return filteredTasks.filter((task) => boardStatus(task.status) === status)
  }

  return (
    <section className="mt-6 space-y-5">
      <Link href="/workspace/projetos" className="inline-flex min-h-9 items-center gap-2 rounded-md text-sm text-slate-400 hover:text-white"><ArrowLeft className="size-4" />Todos os projetos</Link>
      <header className="rounded-xl border border-white/[0.07] bg-[#11161e] p-5 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-blue-300"><FolderKanban className="size-4" />Projeto</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{project.name}</h1>
              <span className="rounded-md border border-blue-400/20 bg-blue-400/10 px-2.5 py-1 text-xs font-medium text-blue-100">{project.status}</span>
              <span className={`rounded-md border px-2.5 py-1 text-xs font-medium ${priorityTone(project.priority)}`}>{project.priority}</span>
            </div>
            <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-slate-400">{project.description || 'Este projeto ainda não possui uma descrição.'}</p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-400">
              <span className="inline-flex items-center gap-2"><BriefcaseBusiness className="size-4 text-slate-500" />{project.client?.trade_name || project.client?.legal_name || 'Sem cliente associado'}</span>
              <span className="inline-flex items-center gap-2"><Users className="size-4 text-slate-500" />{memberLabel(project.responsible_id ? memberById.get(project.responsible_id) : undefined)}</span>
              <span className="inline-flex items-center gap-2"><CalendarDays className="size-4 text-slate-500" />Prazo {dateLabel(project.due_date)}</span>
              <span className="inline-flex items-center gap-2"><Clock3 className="size-4 text-slate-500" />Criado {dateLabel(project.created_at)}</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {canCreateTasks && <button onClick={() => { setTaskModal({ open: true, task: null, status: 'Backlog' }); setCommentItems([]) }} className="flex min-h-10 items-center gap-2 rounded-lg bg-blue-500 px-3.5 text-sm font-semibold text-white hover:bg-blue-400"><Plus className="size-4" />Adicionar tarefa</button>}
            {canEditProject && <button onClick={() => setEditProjectOpen(true)} className="flex min-h-10 items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 text-sm font-medium text-slate-200 hover:bg-white/[0.07]"><FileText className="size-4" />Editar</button>}
            {canArchiveProject && <button onClick={() => void archiveProject()} disabled={normalize(project.status) === 'arquivado'} className="min-h-10 rounded-lg border border-white/[0.1] px-3 text-sm text-slate-400 hover:text-white disabled:opacity-50">Arquivar</button>}
            {canDeleteProject && <button onClick={() => void deleteProject()} className="flex min-h-10 items-center gap-2 rounded-lg border border-rose-400/20 px-3 text-sm text-rose-200 hover:bg-rose-400/10"><Trash2 className="size-4" />Excluir</button>}
          </div>
        </div>
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between text-sm"><span className="text-slate-400">Progresso do projeto</span><span className="font-semibold tabular-nums text-white">{validTasks.length ? `${progress}%` : 'Sem tarefas'}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-white/[0.08]" role="progressbar" aria-label="Progresso do projeto" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="h-full rounded-full bg-blue-400 transition-[width]" style={{ width: `${progress}%` }} /></div>
        </div>
      </header>

      {error && <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-rose-400/20 bg-rose-400/5 px-4 py-3 text-sm text-rose-200"><span>{error}</span><button onClick={() => setError('')} aria-label="Fechar aviso"><X className="size-4" /></button></div>}
      {notice && <div role="status" className="flex items-center justify-between gap-3 rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-sm text-emerald-200"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Fechar aviso"><X className="size-4" /></button></div>}

      <div className="overflow-x-auto border-b border-white/[0.08]" role="tablist" aria-label="Seções do projeto">
        <div className="flex min-w-max gap-1">
          {tabs.map(({ id, label }) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`min-h-11 border-b-2 px-4 text-sm font-medium transition-colors ${tab === id ? 'border-blue-400 text-blue-200' : 'border-transparent text-slate-400 hover:text-white'}`}>{label}</button>)}
        </div>
      </div>

{tab === 'overview' && <div className="space-y-5">
  <ProjectMembersPanel projectId={project.id} permissions={permissions} />
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['Total de tarefas', String(validTasks.length), ClipboardList],
            ['Concluídas', String(completedTasks), CheckCircle2],
            ['Em andamento', String(inProgressTasks), Clock3],
            ['Pendentes', String(pendingTasks), MoreHorizontal],
            ['Atrasadas', String(overdueTasks), CircleAlert],
          ].map(([label, value, Icon]) => {
            const StatIcon = Icon as typeof ClipboardList
            return <article key={label as string} className="rounded-xl border border-white/[0.07] bg-[#11161e] p-4"><div className="flex items-center justify-between"><p className="text-sm text-slate-400">{label as string}</p><StatIcon className="size-4 text-blue-300" /></div><p className="mt-3 text-2xl font-semibold tabular-nums text-white">{value as string}</p></article>
          })}
        </div>
        <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
          <section className="rounded-xl border border-white/[0.07] bg-[#11161e] p-5">
            <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-100">Resumo</h2><p className="mt-1 text-sm text-slate-400">Acompanhe os dados principais da entrega.</p></div><button onClick={() => setTab('kanban')} className="text-sm font-medium text-blue-300 hover:text-blue-200">Abrir Kanban</button></div>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <div><dt className="text-xs uppercase tracking-wide text-slate-500">Cliente</dt><dd className="mt-1 text-sm text-slate-200">{project.client?.trade_name || project.client?.legal_name || 'Não associado'}</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-slate-500">Responsável</dt><dd className="mt-1 text-sm text-slate-200">{memberLabel(project.responsible_id ? memberById.get(project.responsible_id) : undefined)}</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-slate-500">Início</dt><dd className="mt-1 text-sm text-slate-200">{dateLabel(project.created_at)}</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-slate-500">Prazo final</dt><dd className="mt-1 text-sm text-slate-200">{dateLabel(project.due_date)}</dd></div>
            </dl>
          </section>
          <section className="rounded-xl border border-white/[0.07] bg-[#11161e] p-5">
            <div className="flex items-center justify-between"><div><h2 className="font-semibold text-slate-100">Atividade recente</h2><p className="mt-1 text-sm text-slate-400">Eventos registrados no projeto.</p></div><button onClick={() => setTab('activity')} className="text-sm font-medium text-blue-300 hover:text-blue-200">Ver tudo</button></div>
            <ActivityList activity={activity.slice(0, 5)} memberById={memberById} error={activityError} />
          </section>
        </div>
      </div>}

      {(tab === 'kanban' || tab === 'tasks') && <section className="space-y-4">
        <div className="flex flex-col gap-3 rounded-xl border border-white/[0.07] bg-[#11161e] p-4 lg:flex-row lg:items-center">
          <p className="mr-auto text-sm font-medium text-slate-300">{tab === 'kanban' ? 'Quadro de execução' : 'Lista detalhada de tarefas'}</p>
          <label className="field flex items-center gap-2 lg:w-52"><Search className="size-3.5 text-slate-500" /><input value={taskQuery} onChange={(event) => setTaskQuery(event.target.value)} placeholder="Buscar tasks" className="min-w-0 flex-1 bg-transparent outline-none" aria-label="Buscar tasks" /></label>          <label className="field flex items-center gap-2"><span className="text-xs text-slate-500">Criada em</span><input type="date" value={taskDate} onChange={(event) => setTaskDate(event.target.value)} className="min-w-0 bg-transparent text-slate-200 outline-none" aria-label="Filtrar tarefas por data de criação" /></label><select value={taskFilter.responsible} onChange={(event) => setTaskFilter((current) => ({ ...current, responsible: event.target.value }))} className="field lg:w-52" aria-label="Filtrar tarefas por responsável"><option value="">Todos os responsáveis</option>{assignableMembers.map((member) => <option key={member.user_id || member.id} value={member.user_id || member.id}>{member.full_name}</option>)}</select>
          <select value={taskFilter.priority} onChange={(event) => setTaskFilter((current) => ({ ...current, priority: event.target.value }))} className="field lg:w-44" aria-label="Filtrar tarefas por prioridade"><option value="">Todas as prioridades</option>{taskPriorityOptions.map((priority) => <option key={priority}>{priority}</option>)}</select>
          <select value={taskFilter.deadline} onChange={(event) => setTaskFilter((current) => ({ ...current, deadline: event.target.value }))} className="field lg:w-44" aria-label="Filtrar tarefas por prazo"><option value="">Todos os prazos</option><option value="overdue">Atrasadas</option><option value="has-date">Com prazo</option><option value="no-date">Sem prazo</option></select>
        </div>
        {tab === 'kanban' ? (
          <div className="overflow-x-auto pb-3">
            <div className="grid min-w-max grid-flow-col auto-cols-[minmax(260px,1fr)] gap-3 xl:auto-cols-[minmax(230px,1fr)]">
              {[...columns, ...extraStatuses.map((status) => ({ status, label: status })), ...(taskStatusCounts.has('Cancelado') ? [{ status: 'Cancelado', label: 'Canceladas' }] : [])].map((column) => {
                const cards = taskCards(column.status)
                return <section key={column.status} onDragOver={(event) => { if (canUpdateTasks) event.preventDefault() }} onDrop={(event) => {
                  event.preventDefault()
                  const task = tasks.find((item) => item.id === event.dataTransfer.getData('text/plain'))
                  if (canUpdateTasks && task) void moveTask(task, column.status)
                }} className="flex min-h-[340px] flex-col rounded-xl border border-white/[0.07] bg-[#11161e]">
                  <div className="flex items-center justify-between border-b border-white/[0.07] px-3.5 py-3"><h3 className="text-sm font-semibold text-slate-200">{column.label}</h3><span className="min-w-6 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-center text-xs tabular-nums text-slate-300">{cards.length}</span></div>
                  <div className="flex flex-1 flex-col gap-2 p-2.5">
                    {cards.map((task) => {
                      const member = task.responsible_id ? memberById.get(task.responsible_id) : undefined
                      const overdue = Boolean(task.due_date && task.due_date < new Date().toISOString().slice(0, 10) && !isComplete(task.status) && !isCanceled(task.status))
                      return <article key={task.id} draggable={canUpdateTasks && column.status !== 'Cancelado'} onDragStart={(event) => { if (!canUpdateTasks) return; event.dataTransfer.setData('text/plain', task.id); event.dataTransfer.effectAllowed = 'move' }} onDragOver={(event) => { if (canUpdateTasks) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' } }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const dragged = tasks.find((item) => item.id === event.dataTransfer.getData('text/plain')); if (dragged && dragged.id !== task.id) void reorderTask(dragged, column.status, task.id) }} className={`rounded-lg border border-white/[0.08] bg-[#171d28] p-3 cursor-grab transition-colors hover:border-blue-400/30 active:cursor-grabbing ${movingTaskId === task.id ? 'opacity-50' : ''}`}>
                        <button onClick={() => openTask(task)} className="w-full text-left"><span className="flex items-start gap-2"><GripVertical className="mt-0.5 size-4 shrink-0 text-slate-600" /><span className="line-clamp-2 min-w-0 font-medium leading-5 text-slate-100">{task.title}</span></span></button>
                        <div className="mt-3 flex flex-wrap items-center gap-1.5 pl-6">
                          <span className={`rounded border px-2 py-0.5 text-[11px] ${priorityTone(task.priority)}`}><Flag className="mr-1 inline size-3" />{task.priority}</span>
                          {task.due_date && <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] ${overdue ? 'border-rose-400/20 bg-rose-400/10 text-rose-200' : 'border-white/[0.08] text-slate-400'}`}><CalendarDays className="size-3" />{dateLabel(task.due_date)}</span>}
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2.5 pl-6">
                          <span className="flex min-w-0 items-center gap-2 truncate text-xs text-slate-400"><span className="max-w-24 truncate">{memberLabel(member)}</span>{Boolean(taskIndicators[task.id]?.comments) && <span className="inline-flex shrink-0 items-center gap-1" aria-label={`${taskIndicators[task.id].comments} comentários`}><MessageSquare className="size-3" />{taskIndicators[task.id].comments}</span>}{Boolean(taskIndicators[task.id]?.attachments) && <span className="inline-flex shrink-0 items-center gap-1" aria-label={`${taskIndicators[task.id].attachments} anexos`}><Paperclip className="size-3" />{taskIndicators[task.id].attachments}</span>}</span>
                          <select value={column.status} onChange={(event) => void moveTask(task, event.target.value)} onClick={(event) => event.stopPropagation()} disabled={!canUpdateTasks} className="max-w-32 rounded-md border border-white/[0.08] bg-[#11161e] px-2 py-1 text-xs text-slate-300 focus-visible:outline-blue-300 disabled:cursor-not-allowed disabled:opacity-60" aria-label={`Alterar status de ${task.title}`}>
                            {columns.map((status) => <option key={status.status} value={status.status}>{status.label}</option>)}{extraStatuses.map((status) => <option key={status} value={status}>{status}</option>)}{isCanceled(task.status) && <option value="Cancelado">Cancelada</option>}
                          </select>
                        </div>
                      </article>
                    })}
                    {cards.length === 0 && <p className="px-3 py-8 text-center text-sm text-slate-500">Nenhuma tarefa nesta etapa.</p>}
                    {canCreateTasks && column.status !== 'Cancelado' && <button onClick={() => setTaskModal({ open: true, task: null, status: column.status })} className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-dashed border-white/[0.12] text-sm text-slate-400 hover:border-blue-400/40 hover:text-blue-200"><Plus className="size-4" />Adicionar tarefa</button>}
                  </div>
                </section>
              })}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/[0.07] bg-[#11161e]">
            <table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-white/[0.07] text-xs uppercase tracking-wide text-slate-400"><tr><th>Tarefa</th><th>Status</th><th>Responsável</th><th>Prioridade</th><th>Prazo</th></tr></thead><tbody>{filteredTasks.map((task) => <tr key={task.id} className="cursor-pointer hover:bg-white/[0.025]" onClick={() => openTask(task)}><td className="font-medium text-slate-100">{task.title}</td><td>{boardStatus(task.status)}</td><td>{memberLabel(task.responsible_id ? memberById.get(task.responsible_id) : undefined)}</td><td>{task.priority}</td><td>{dateLabel(task.due_date)}</td></tr>)}</tbody></table>
            {!filteredTasks.length && <p className="px-5 py-10 text-center text-sm text-slate-500">Nenhuma tarefa corresponde aos filtros.</p>}
          </div>
        )}
      </section>}

      {tab === 'files' && <section className="rounded-xl border border-white/[0.07] bg-[#11161e] p-5"><h2 className="font-semibold text-slate-100">Arquivos do projeto</h2><p className="mt-1 text-sm text-slate-400">Documentos privados associados a este projeto.</p><EntityAttachments entityType="project" entityId={project.id} canUpload={permissions.includes('*') || permissions.includes('attachments:upload')} canDownload={permissions.includes('*') || permissions.includes('attachments:download')} canDelete={permissions.includes('*') || permissions.includes('attachments:delete')} /></section>}
      {tab === 'activity' && <section className="rounded-xl border border-white/[0.07] bg-[#11161e] p-5"><h2 className="font-semibold text-slate-100">Histórico do projeto</h2><p className="mt-1 text-sm text-slate-400">Eventos registrados a partir das alterações persistidas.</p><ActivityList activity={activity} memberById={memberById} error={activityError} /></section>}

      {editProjectOpen && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditProjectOpen(false) }}>
        <div role="dialog" aria-modal="true" aria-labelledby="edit-project-title" className="my-auto w-full max-w-xl rounded-xl border border-white/10 bg-[#151b24] p-5 shadow-2xl">
          <div className="mb-5 flex items-center justify-between"><div><h2 id="edit-project-title" className="text-lg font-semibold text-white">Editar projeto</h2><p className="mt-1 text-sm text-slate-400">Atualize as informações da entrega.</p></div><button onClick={() => setEditProjectOpen(false)} aria-label="Fechar formulário"><X className="size-5 text-slate-400" /></button></div>
          <form onSubmit={updateProject} className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm text-slate-300 sm:col-span-2">Nome<input required name="name" defaultValue={project.name} className="field" /></label>
            <label className="grid gap-1.5 text-sm text-slate-300 sm:col-span-2">Descrição<textarea name="description" defaultValue={project.description ?? ''} rows={3} className="field resize-y" /></label>
            <label className="grid gap-1.5 text-sm text-slate-300">Status<select name="status" defaultValue={project.status} className="field">{[...new Set([project.status, 'Backlog', 'Em andamento', 'Concluído', 'Arquivado'])].map((status) => <option key={status}>{status}</option>)}</select></label>
            <label className="grid gap-1.5 text-sm text-slate-300">Prioridade<select name="priority" defaultValue={project.priority} className="field">{[...new Set([project.priority, 'Baixa', 'Média', 'Alta', 'Urgente'])].map((value) => <option key={value}>{value}</option>)}</select></label>
            {canAssign && <label className="grid gap-1.5 text-sm text-slate-300">Cliente<select name="client_id" defaultValue={project.client_id ?? ''} className="field"><option value="">Sem cliente</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.trade_name || client.legal_name}</option>)}</select></label>}
            {canAssign && <label className="grid gap-1.5 text-sm text-slate-300">Responsável<input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Pesquisar funcionário" className="field" aria-label="Pesquisar funcionário" /><select name="responsible_id" defaultValue={project.responsible_id ?? ''} className="field"><option value="">Sem responsável</option>{assignableMembers.map((member) => <option key={member.user_id || member.id} value={member.user_id || member.id}>{member.full_name}</option>)}</select></label>}
            <label className="grid gap-1.5 text-sm text-slate-300">Prazo<input type="date" name="due_date" defaultValue={project.due_date ?? ''} className="field" /></label>
            <div className="mt-2 flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setEditProjectOpen(false)} className="min-h-10 rounded-lg px-4 text-sm text-slate-400 hover:bg-white/5">Cancelar</button><button disabled={taskSaving} className="flex min-h-10 items-center gap-2 rounded-lg bg-blue-500 px-4 text-sm font-semibold text-white hover:bg-blue-400 disabled:opacity-60"><Save className="size-4" />Salvar</button></div>
          </form>
        </div>
      </div>}

      {taskModal.open && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-3 sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setTaskModal({ open: false, task: null, status: 'Backlog' }) }}>
        <div role="dialog" aria-modal="true" aria-labelledby="task-modal-title" className="my-auto max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-white/10 bg-[#141923] p-5 shadow-2xl sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-blue-300">{taskModal.task ? 'Detalhes da tarefa' : 'Nova tarefa'}</p><h2 id="task-modal-title" className="mt-1 text-xl font-semibold text-white">{taskModal.task?.title || 'Adicionar tarefa'}</h2></div><button onClick={() => setTaskModal({ open: false, task: null, status: 'Backlog' })} aria-label="Fechar tarefa" className="rounded-md p-1 text-slate-400 hover:bg-white/5 hover:text-white"><X className="size-5" /></button></div>
          <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
            <form onSubmit={taskModal.task ? updateTask : createTask} className="space-y-4">
              <fieldset disabled={taskModal.task ? !canUpdateTasks : !canCreateTasks} className="space-y-4">
                <label className="grid gap-1.5 text-sm text-slate-300">Título<input required name="title" defaultValue={taskModal.task?.title ?? ''} autoFocus className="field" /></label>
                <label className="grid gap-1.5 text-sm text-slate-300">Descrição<textarea name="description" rows={6} defaultValue={taskModal.task?.description ?? ''} className="field resize-y" /></label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-sm text-slate-300">Status<select name="status" defaultValue={taskModal.task ? boardStatus(taskModal.task.status) : taskModal.status} className="field">{columns.map((column) => <option key={column.status}>{column.status}</option>)}{extraStatuses.map((status) => <option key={status}>{status}</option>)}{taskModal.task && isCanceled(taskModal.task.status) && <option>Cancelado</option>}</select></label>
                  <label className="grid gap-1.5 text-sm text-slate-300">Prioridade<select name="priority" defaultValue={taskModal.task?.priority ?? 'Média'} className="field">{[...new Set([taskModal.task?.priority, 'Baixa', 'Média', 'Alta', 'Urgente'].filter((value): value is string => Boolean(value)))].map((priority) => <option key={priority}>{priority}</option>)}</select></label>
                  {canAssign && <label className="grid gap-1.5 text-sm text-slate-300">Responsável<input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Pesquisar funcionário" className="field" aria-label="Pesquisar funcionário" /><select name="responsible_id" defaultValue={taskModal.task?.responsible_id ?? ''} className="field"><option value="">Sem responsável</option>{assignableMembers.map((member) => <option key={member.user_id || member.id} value={member.user_id || member.id}>{member.full_name}</option>)}</select></label>}
                  <label className="grid gap-1.5 text-sm text-slate-300">Prazo<input type="date" name="due_date" defaultValue={taskModal.task?.due_date ?? ''} className="field" /></label>
                </div>
              </fieldset>
                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.08] pt-4">
                  {taskModal.task && canDeleteTasks && <button type="button" onClick={() => void deleteTask(taskModal.task!)} className="mr-auto min-h-10 rounded-lg border border-rose-400/20 px-3 text-sm text-rose-200 hover:bg-rose-400/10">Excluir tarefa</button>}
                  <button type="button" onClick={() => setTaskModal({ open: false, task: null, status: 'Backlog' })} className="min-h-10 rounded-lg px-4 text-sm text-slate-400 hover:bg-white/5">Cancelar</button>
                  {((taskModal.task && canUpdateTasks) || (!taskModal.task && canCreateTasks)) && <button disabled={taskSaving} className="flex min-h-10 items-center gap-2 rounded-lg bg-blue-500 px-4 text-sm font-semibold text-white hover:bg-blue-400 disabled:opacity-60"><Save className="size-4" />{taskSaving ? 'Salvando...' : taskModal.task ? 'Salvar alterações' : 'Criar tarefa'}</button>}
              </div>
            </form>
            <div className="space-y-4">
              {taskModal.task ? <>
                <div className="rounded-lg border border-white/[0.07] bg-[#11161e] p-4"><h3 className="text-sm font-semibold text-slate-200">Detalhes</h3><dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between gap-3"><dt className="text-slate-500">Criada</dt><dd className="text-right text-slate-300">{shortDate(taskModal.task.created_at)}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Atualizada</dt><dd className="text-right text-slate-300">{shortDate(taskModal.task.updated_at)}</dd></div></dl></div>
                <section className="rounded-lg border border-white/[0.07] bg-[#11161e] p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200"><MessageSquare className="size-4 text-blue-300" />Comentários</h3>
                  {commentError && <p role="alert" className="mt-3 text-xs text-rose-200">{commentError}</p>}
                  {commentLoading ? <p className="mt-3 flex items-center text-sm text-slate-500"><Loader2 className="mr-2 size-4 animate-spin" />Carregando comentários...</p> : <div className="mt-3 max-h-56 space-y-3 overflow-y-auto">
                    {commentItems.map((comment) => <article key={comment.id} className="rounded-lg border border-white/[0.06] p-3">
                      <div className="flex items-start justify-between gap-2"><div><p className="text-xs font-medium text-slate-200">{memberLabel(memberById.get(comment.author_id))}</p><p className="mt-0.5 text-[11px] text-slate-500">{shortDate(comment.created_at)}{comment.updated_at !== comment.created_at ? ' · editado' : ''}</p></div>{canUpdateTasks && comment.author_id === currentUserId && <div className="flex gap-1"><button type="button" onClick={() => { setEditingComment(comment.id); setCommentError('') }} className="rounded px-2 py-1 text-xs text-slate-400 hover:text-white">Editar</button><button type="button" onClick={() => void deleteComment(comment)} className="rounded px-2 py-1 text-xs text-rose-300 hover:bg-rose-400/10">Excluir</button></div>}</div>
                      {editingComment === comment.id ? <CommentEditForm initialValue={comment.body} onCancel={() => setEditingComment('')} onSave={(body) => void saveComment(comment, body)} /> : <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-slate-300">{comment.body}</p>}
                    </article>)}
                    {!commentItems.length && !commentError && <p className="text-sm text-slate-500">Ainda não há comentários.</p>}
                  </div>}
                  {canUpdateTasks ? <form onSubmit={publishComment} className="mt-3 space-y-2 border-t border-white/[0.07] pt-3">
                    <label className="sr-only" htmlFor="new-task-comment">Escreva um comentário</label><textarea id="new-task-comment" value={commentBody} onChange={(event) => setCommentBody(event.target.value)} maxLength={10000} rows={3} placeholder="Escreva um comentário..." className="field resize-y" />
                    <button disabled={commentSaving || !commentBody.trim()} className="flex min-h-9 items-center gap-2 rounded-lg bg-blue-500 px-3 text-sm font-medium text-white hover:bg-blue-400 disabled:opacity-50"><Send className="size-3.5" />{commentSaving ? 'Publicando...' : 'Publicar'}</button>
                  </form> : <p className="mt-3 border-t border-white/[0.07] pt-3 text-xs text-slate-500">Você tem acesso somente para leitura.</p>}
                </section>
                <EntityAttachments entityType="task" entityId={taskModal.task.id} canUpload={permissions.includes('*') || permissions.includes('attachments:upload')} canDownload={permissions.includes('*') || permissions.includes('attachments:download')} canDelete={permissions.includes('*') || permissions.includes('attachments:delete')} /><TaskSharing taskId={taskModal.task.id} projectId={projectId} currentUserId={currentUserId} responsibleId={taskModal.task.responsible_id} onChanged={() => void loadData()} />
              </> : <div className="rounded-lg border border-dashed border-white/[0.1] p-4 text-sm leading-6 text-slate-400">Depois de criar a tarefa, você poderá adicionar comentários e anexos persistentes aqui.</div>}
            </div>
          </div>
        </div>
      </div>}
    </section>
  )
}

function ActivityList({ activity, memberById, error }: { activity: ProjectActivity[]; memberById: Map<string, TeamMember>; error: string }) {
  if (error) return <p role="status" className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-sm text-amber-100">Histórico indisponível: {error}</p>
  if (!activity.length) return <div className="mt-4 rounded-lg border border-dashed border-white/[0.1] px-4 py-8 text-center text-sm text-slate-500">Nenhuma atividade registrada.</div>
  return <ol className="mt-4 space-y-0">{activity.map((item) => <li key={item.id} className="relative flex gap-3 border-l border-white/[0.1] pb-5 pl-4 last:border-transparent last:pb-0"><span className="absolute -left-[5px] top-1 size-2.5 rounded-full border border-blue-300/50 bg-[#11161e]" /><div className="min-w-0"><p className="text-sm text-slate-200">{item.summary}</p><p className="mt-1 text-xs text-slate-500">{memberLabel(item.actor_id ? memberById.get(item.actor_id) : undefined)} · {shortDate(item.created_at)}</p></div></li>)}</ol>
}

function CommentEditForm({ initialValue, onCancel, onSave }: { initialValue: string; onCancel: () => void; onSave: (body: string) => void }) {
  const [body, setBody] = useState(initialValue)
  return <form onSubmit={(event) => { event.preventDefault(); if (body.trim()) onSave(body) }} className="mt-2 space-y-2">
    <textarea autoFocus maxLength={10000} value={body} onChange={(event) => setBody(event.target.value)} className="field resize-y" rows={3} aria-label="Editar comentário" />
    <div className="flex gap-2"><button className="rounded-md bg-blue-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-400">Salvar</button><button type="button" onClick={onCancel} className="rounded-md px-2.5 py-1.5 text-xs text-slate-400 hover:text-white">Cancelar</button></div>
  </form>
}
