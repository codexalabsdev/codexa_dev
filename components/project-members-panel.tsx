'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, UserRound, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Member = { id: string; user_id: string | null; full_name: string; email: string; status: string }
type AccessLevel = 'viewer' | 'collaborator' | 'manager'
type ProjectMember = { id: string; user_id: string; added_by: string | null; created_at: string; access_level: AccessLevel; is_active: boolean; revoked_at: string | null }

function isActiveMemberStatus(status: string) {
  return ['active', 'ativo', 'enabled', 'habilitado'].includes(status.replace(/["']/g, '').trim().toLowerCase())
}

export function ProjectMembersPanel({ projectId, permissions }: { projectId: string; permissions: string[] }) {
  const supabase = useMemo(() => createClient(), [])
  const [members, setMembers] = useState<Member[]>([])
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([])
  const [projectAccessLevel, setProjectAccessLevel] = useState<AccessLevel | null>(null)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedAccessLevel, setSelectedAccessLevel] = useState<AccessLevel>('viewer')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: available }, { data: assigned, error }, { data: access, error: accessError }] = await Promise.all([
      supabase.rpc('list_project_member_directory', { p_project_id: projectId }),
      supabase.from('project_members').select('id,user_id,added_by,created_at,access_level,is_active,revoked_at').eq('project_id', projectId).order('created_at'),
      supabase.rpc('project_access_level', { p_project_id: projectId }),
    ])
    if (error) setMessage(error.message)
    if (accessError) setMessage(accessError.message)
    setMembers(((available ?? []) as Member[]).filter((member) => isActiveMemberStatus(member.status)))
    setProjectMembers((assigned ?? []) as ProjectMember[])
    setProjectAccessLevel((access ?? null) as AccessLevel | null)
    setLoading(false)
  }, [projectId, supabase])

  useEffect(() => { void load() }, [load])

  async function addMember() {
    if (!selectedUserId || !canManage) return
    setSaving(true); setMessage('')
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) { setMessage('Sessão expirada.'); setSaving(false); return }
    const revokedMembership = projectMembers.find((member) => member.user_id === selectedUserId && !member.is_active)
    const result = revokedMembership
      ? await supabase.from('project_members').update({ access_level: selectedAccessLevel, is_active: true, revoked_at: null }).eq('id', revokedMembership.id)
      : await supabase.from('project_members').insert({ project_id: projectId, user_id: selectedUserId, added_by: auth.user.id, access_level: selectedAccessLevel })
    const error = result.error
    if (error) setMessage(error.code === '23505' ? 'Este usuário já participa do projeto.' : 'Não foi possível adicionar o participante.')
    else { setSelectedUserId(''); setSelectedAccessLevel('viewer'); await load() }
    setSaving(false)
  }

  async function updateAccessLevel(userId: string, accessLevel: AccessLevel) {
    if (!canManage) return
    const member = members.find((item) => item.user_id === userId)
    const currentLevel = projectMembers.find((item) => item.user_id === userId)?.access_level
    if (currentLevel === accessLevel) return
    if (!window.confirm(`Alterar o acesso de ${member?.full_name ?? 'participante'} para ${accessLevel}?`)) return
    setSaving(true); setMessage('')
    const { error } = await supabase.from('project_members').update({ access_level: accessLevel }).eq('project_id', projectId).eq('user_id', userId)
    if (error) setMessage('Não foi possível alterar o nível de acesso.')
    else await load()
    setSaving(false)
  }

  async function removeMember(userId: string) {
    if (!canManage) return
    const member = members.find((item) => item.user_id === userId)
    if (!window.confirm(`Revogar o acesso de ${member?.full_name ?? 'participante'}? O histórico será preservado.`)) return
    setSaving(true); setMessage('')
    const { error } = await supabase.from('project_members').update({ is_active: false }).eq('project_id', projectId).eq('user_id', userId).eq('is_active', true)
    if (error) setMessage('Não foi possível remover o participante.')
    else await load()
    setSaving(false)
  }

  const canManage = (permissions.includes('*') || permissions.includes('projects:share') || permissions.includes('projects:assign')) && projectAccessLevel === 'manager'
  const assignedIds = new Set(projectMembers.filter((member) => member.is_active).map((member) => member.user_id))
  const availableMembers = members.filter((member) => member.user_id && !assignedIds.has(member.user_id))

  return <section className="rounded-2xl border border-white/[0.07] bg-[#11161e] p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">Compartilhamento</p><h2 className="mt-1 text-base font-semibold text-white">Participantes do projeto</h2><p className="mt-1 text-xs text-slate-500">Participantes acessam o projeto, tarefas, atividades e documentos vinculados.</p></div>
      <UserRound className="size-5 text-slate-500" />
    </div>
    {canManage && <div className="mt-5 flex flex-col gap-2 sm:flex-row"><select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-[#0d1118] px-3 py-2.5 text-xs text-slate-200"><option value="">Selecionar integrante</option>{availableMembers.map((member) => <option key={member.user_id} value={member.user_id ?? ''}>{member.full_name} · {member.email}</option>)}</select><select aria-label="Nível de acesso do participante" value={selectedAccessLevel} onChange={(event) => setSelectedAccessLevel(event.target.value as AccessLevel)} className="rounded-lg border border-white/[0.08] bg-[#0d1118] px-3 py-2.5 text-xs text-slate-200"><option value="viewer">Visualizador</option><option value="collaborator">Colaborador</option><option value="manager">Gerenciador</option></select><button type="button" disabled={!selectedUserId || saving} onClick={() => void addMember()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-3 py-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}Adicionar</button></div>}
    {message && <p role="alert" className="mt-3 text-xs text-rose-300">{message}</p>}
    {loading ? <p className="mt-5 text-xs text-slate-500">Carregando participantes...</p> : <div className="mt-5 space-y-2">{projectMembers.length ? projectMembers.map((projectMember) => { const member = members.find((item) => item.user_id === projectMember.user_id); return <div key={projectMember.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.06] px-3 py-2.5 ${projectMember.is_active ? '' : 'opacity-60'}`}><div><p className="text-xs font-medium text-slate-200">{member?.full_name ?? 'Usuário da equipe'}</p><p className="mt-0.5 text-[11px] text-slate-500">{member?.email ?? projectMember.user_id} · {projectMember.is_active ? 'Acesso ativo' : `Revogado${projectMember.revoked_at ? ` em ${new Date(projectMember.revoked_at).toLocaleDateString('pt-BR')}` : ''}`}</p></div>{canManage && projectMember.is_active && <div className="flex items-center gap-2"><select aria-label={`Acesso de ${member?.full_name ?? 'participante'}`} value={projectMember.access_level} disabled={saving} onChange={(event) => void updateAccessLevel(projectMember.user_id, event.target.value as AccessLevel)} className="rounded-lg border border-white/[0.08] bg-[#0d1118] px-2 py-2 text-[11px] text-slate-200 disabled:opacity-50"><option value="viewer">Visualizador</option><option value="collaborator">Colaborador</option><option value="manager">Gerenciador</option></select><button type="button" disabled={saving} onClick={() => void removeMember(projectMember.user_id)} aria-label={`Revogar acesso de ${member?.full_name ?? 'participante'}`} className="rounded-md p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-40"><X className="size-4" /></button></div>}</div> }) : <p className="text-xs text-slate-500">Nenhum participante adicional. O criador e os administradores continuam com acesso.</p>}</div>}
  </section>
}
