'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Activity, Loader2, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type PersonalEvent = {
  id: string
  project_id: string | null
  task_id: string | null
  event_type: string
  summary: string
  metadata: Record<string, unknown>
  created_at: string
}
type AuditEvent = {
  id: string
  actor_id: string | null
  action_name: string
  entity_type: string
  entity_id: string | null
  previous_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  result: string
  created_at: string
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function ActivityHistoryWorkspace({ permissions, mode }: { permissions: string[]; mode: 'personal' | 'audit' }) {
  const [personalEvents, setPersonalEvents] = useState<PersonalEvent[]>([])
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [query, setQuery] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const canReadPersonal = permissions.includes('*') || permissions.includes('projects:view')
  const canReadAudit = permissions.includes('*') || permissions.includes('audit:view_audit')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()
      if (mode === 'personal') {
        if (!canReadPersonal) {
          setError('Seu cargo não possui acesso ao histórico pessoal.')
          return
        }
        const { data: authData, error: authError } = await supabase.auth.getUser()
        if (authError || !authData.user) {
          setError(authError?.message ?? 'Entre novamente para consultar seu histórico.')
          return
        }
        const { data, error: queryError } = await supabase.from('project_activity')
          .select('id,project_id,task_id,event_type,summary,metadata,created_at')
          .eq('actor_id', authData.user.id)
          .order('created_at', { ascending: false })
          .limit(100)
        if (queryError) setError(`Não foi possível carregar seu histórico: ${queryError.message}`)
        else setPersonalEvents((data ?? []) as PersonalEvent[])
      } else {
        if (!canReadAudit) {
          setError('Seu cargo não possui acesso à auditoria administrativa.')
          return
        }
        const { data, error: queryError } = await supabase.from('admin_audit_events')
          .select('id,actor_id,action_name,entity_type,entity_id,previous_data,new_data,result,created_at')
          .order('created_at', { ascending: false })
          .limit(100)
        if (queryError) setError(`Não foi possível carregar a auditoria: ${queryError.message}`)
        else setAuditEvents((data ?? []) as AuditEvent[])
      }
    } catch (loadError) {
      const detail = loadError instanceof Error ? loadError.message : 'erro desconhecido'
      setError(`Não foi possível carregar o histórico: ${detail}`)
    } finally {
      setLoading(false)
    }
  }, [canReadAudit, canReadPersonal, mode])

  useEffect(() => { void load() }, [load])

  const normalizedQuery = query.trim().toLowerCase()
  const visiblePersonalEvents = personalEvents.filter((event) =>
    `${event.summary} ${event.event_type} ${event.project_id ?? ''} ${event.task_id ?? ''}`.toLowerCase().includes(normalizedQuery)
    && (!moduleFilter || event.event_type === moduleFilter),
  )
  const visibleAuditEvents = auditEvents.filter((event) =>
    `${event.action_name} ${event.entity_type} ${event.entity_id ?? ''} ${event.actor_id ?? ''} ${event.result}`.toLowerCase().includes(normalizedQuery)
    && (!moduleFilter || event.entity_type === moduleFilter),
  )
  const title = mode === 'personal' ? 'Meu histórico de atividades' : 'Auditoria administrativa'

  return <section className="space-y-5">
    <header><p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-blue-400">{mode === 'personal' ? 'Conta' : 'Administração'}</p><h1 className="text-2xl font-semibold text-white">{title}</h1><p className="mt-1.5 text-sm text-slate-500">{mode === 'personal' ? 'Atividades de projeto registradas por você.' : 'Eventos administrativos registrados pelo workspace.'}</p></header>
    <div className="flex flex-col gap-2 sm:flex-row"><label className="flex flex-1 items-center gap-2 rounded-lg border border-white/[0.07] bg-[#11161e] px-3 py-2.5"><Search className="size-4 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar no histórico..." className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-600" /></label><select aria-label="Filtrar módulo" value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)} className="rounded-lg border border-white/[0.07] bg-[#11161e] px-3 py-2.5 text-sm text-slate-300 outline-none"><option value="">Todos os módulos</option>{[...new Set((mode === 'personal' ? personalEvents.map((event) => event.event_type) : auditEvents.map((event) => event.entity_type)))].sort().map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
    {error && <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-400/5 px-4 py-3 text-sm text-rose-200">{error}</p>}
    <div className="rounded-xl border border-white/[0.07] bg-[#11161e]">
      {loading ? <div className="flex min-h-40 items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 size-4 animate-spin" />Carregando histórico...</div>
        : mode === 'personal' ? visiblePersonalEvents.length ? <ol className="divide-y divide-white/[0.05]">{visiblePersonalEvents.map((event) => <li key={event.id} className="flex gap-3 p-4"><Activity className="mt-0.5 size-4 shrink-0 text-blue-300" /><div className="min-w-0 flex-1"><p className="text-sm text-slate-200">{event.summary}</p><p className="mt-1 text-xs text-slate-500">{event.event_type} · {formatDate(event.created_at)}</p>{event.project_id ? <Link href={`/workspace/projetos/${event.project_id}`} className="mt-2 inline-block text-xs text-blue-300 hover:text-blue-200">Abrir projeto</Link> : <span className="mt-2 inline-block text-xs text-slate-500">Projeto excluído</span>}</div></li>)}</ol>
          : <p className="p-8 text-center text-sm text-slate-500">{personalEvents.length ? 'Nenhuma atividade corresponde à busca.' : 'Nenhuma atividade pessoal registrada.'}</p>
        : visibleAuditEvents.length ? <div className="divide-y divide-white/[0.05]">{visibleAuditEvents.map((event) => <details key={event.id} className="group p-4"><summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2"><span className="font-medium text-slate-200">{event.action_name}</span><span className="text-xs text-slate-500">{formatDate(event.created_at)}</span></summary><dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2"><div><dt className="text-slate-500">Entidade</dt><dd className="mt-1 text-slate-300">{event.entity_type}{event.entity_id ? ` · ${event.entity_id}` : ''}</dd></div><div><dt className="text-slate-500">Ator / resultado</dt><dd className="mt-1 text-slate-300">{event.actor_id ?? 'Sistema'} · {event.result}</dd></div>{event.previous_data && <div><dt className="text-slate-500">Antes</dt><dd className="mt-1 break-all text-slate-300">{JSON.stringify(event.previous_data)}</dd></div>}{event.new_data && <div><dt className="text-slate-500">Depois</dt><dd className="mt-1 break-all text-slate-300">{JSON.stringify(event.new_data)}</dd></div>}</dl></details>)}</div>
          : <p className="p-8 text-center text-sm text-slate-500">{auditEvents.length ? 'Nenhum evento corresponde à busca.' : 'Nenhum evento de auditoria registrado.'}</p>}
    </div>
  </section>
}
