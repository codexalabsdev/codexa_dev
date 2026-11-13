'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Eye, Loader2, Pencil, Plus, Save, Search, Shield, Trash2, Users, X } from 'lucide-react'
import { UserAvatar } from '@/components/user-avatar'

type Permission = { id: string; module_name: string; action_name: string }
type Role = {
  id: string
  name: string
  description: string
  is_system: boolean
  is_active: boolean
  memberCount: number
  permissions: string[]
}
type Member = {
  id: string
  user_id: string | null
  full_name: string
  email: string
  phone?: string | null
  job_title?: string | null
  department?: string | null
  joined_on?: string | null
  role_name: string
  status: string
  created_at: string
}
type Override = { module_name: string; action_name: string; effect: 'inherit' | 'allow' | 'deny' }

const moduleGroups: Record<string, string> = {
  dashboard: 'Painel',
  dashboard_comercial: 'Comercial',
  leads: 'Comercial',
  clients: 'Relacionamento',
  contacts: 'Relacionamento',
  proposals: 'Comercial',
  contracts: 'Comercial',
  projects: 'Projetos',
  change_requests: 'Operações',
  support: 'Suporte',
  systems: 'Operações',
  modules: 'Operações',
  plans: 'Operações',
  licenses: 'Operações',
  accounts_receivable: 'Financeiro',
  accounts_payable: 'Financeiro',
  finance: 'Financeiro',
  reports_commercial: 'Relatórios',
  reports_financial: 'Relatórios',
  team: 'Administração',
  users: 'Administração',
  roles: 'Administração',
  settings: 'Administração',
  appearance: 'Administração',
  audit: 'Administração',
  profile: 'Conta',
  documents: 'Documentos',
  attachments: 'Documentos',
  notifications: 'Conta',
  calendar: 'Comercial',
  badges: 'Gamificação',
}

const moduleLabels: Record<string, string> = {
  dashboard: 'Dashboard geral', dashboard_comercial: 'Dashboard comercial', leads: 'Leads', clients: 'Clientes',
  contacts: 'Contatos', proposals: 'Propostas', contracts: 'Contratos', projects: 'Projetos e tarefas',
  change_requests: 'Solicitações', support: 'Suporte', systems: 'Sistemas dos clientes', modules: 'Módulos',
  plans: 'Planos', licenses: 'Licenças e liberações', accounts_receivable: 'Contas a receber',
  accounts_payable: 'Contas a pagar', finance: 'Financeiro', reports_commercial: 'Relatórios comerciais',
  reports_financial: 'Relatórios financeiros', team: 'Equipe', users: 'Usuários', roles: 'Cargos e permissões',
  settings: 'Configurações globais', appearance: 'Aparência global', audit: 'Auditoria', profile: 'Meu perfil',
  documents: 'Documentos', attachments: 'Anexos', notifications: 'Notificações', calendar: 'Agenda', badges: 'Emblemas e gamificação',
}

const actionLabels: Record<string, string> = {
  view: 'Visualizar', create: 'Criar', update: 'Editar', delete: 'Excluir', manage: 'Gerenciar',
  archive: 'Arquivar', share: 'Compartilhar',
  approve: 'Aprovar', export: 'Exportar', upload: 'Enviar arquivos', download: 'Baixar arquivos',
  assign: 'Atribuir', change_status: 'Alterar status', manage_licenses: 'Gerenciar licenças',
  release_modules: 'Liberar módulos', manage_users: 'Gerenciar usuários', manage_roles: 'Gerenciar cargos',
  view_audit: 'Consultar auditoria',
}

const inputClass = 'mt-1.5 w-full rounded-lg border border-white/[0.08] bg-[#0d1118] px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-blue-400/60'

function PermissionSwitch({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${checked ? 'border-blue-400/60 bg-blue-500' : 'border-white/10 bg-white/[0.08]'} disabled:cursor-not-allowed disabled:opacity-40`}>
    <span className={`size-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
  </button>
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  const result = await response.json() as T & { error?: string; warning?: string | null }
  if (!response.ok) throw new Error(result.error || 'A operação não foi concluída.')
  return result
}

export function RoleManagementWorkspace({ initialView = 'roles' }: { initialView?: 'roles' | 'users' }) {
  const [view, setView] = useState(initialView)
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [selectedRole, setSelectedRole] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [creatingRole, setCreatingRole] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [memberDetails, setMemberDetails] = useState<Member | null>(null)
  const [roleName, setRoleName] = useState('')
  const [roleDescription, setRoleDescription] = useState('')
  const [roleActive, setRoleActive] = useState(true)
  const [roleGrants, setRoleGrants] = useState<string[]>([])
  const [deletingRole, setDeletingRole] = useState<Role | null>(null)
  const [reassignRoleId, setReassignRoleId] = useState('')
  const [permissionOverrides, setPermissionOverrides] = useState<Record<string, Override[]>>({})
  const [expandedMember, setExpandedMember] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [roleData, userData, accessData] = await Promise.all([
        api<{ roles: Role[]; permissions: Permission[] }>('/api/admin/rbac/roles'),
        api<{ members: Member[] }>('/api/admin/rbac/users'),
        api<{ actorId: string }>('/api/workspace/access'),
      ])
      setRoles(roleData.roles)
      setPermissions(roleData.permissions)
      setMembers(userData.members)
      setCurrentUserId(accessData.actorId)
      setSelectedRole((previous) => roleData.roles.some((role) => role.id === previous)
        ? previous
        : roleData.roles.find((role) => role.name.toLowerCase() !== 'admin')?.id ?? roleData.roles[0]?.id ?? '')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os cargos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])
  useEffect(() => {
    setView(initialView)
    setInviteOpen(false)
    setEditingMember(null)
  }, [initialView])

  const role = roles.find((item) => item.id === selectedRole)
  const filteredMembers = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return members
    return members.filter((member) => [member.full_name, member.email, member.job_title, member.department, member.role_name].filter(Boolean).join(' ').toLowerCase().includes(term))
  }, [members, search])
  useEffect(() => {
    if (!role) return
    setRoleName(role.name)
    setRoleDescription(role.description ?? '')
    setRoleActive(role.is_active)
    setRoleGrants(role.permissions)
    setCreatingRole(false)
  }, [role])

  const groupedPermissions = useMemo(() => {
    const term = search.trim().toLowerCase()
    return permissions.reduce<Record<string, Permission[]>>((groups, permission) => {
      const module = permission.module_name
      const label = moduleLabels[module] ?? module
      const action = actionLabels[permission.action_name] ?? permission.action_name
      if (term && !`${label} ${action} ${module}`.toLowerCase().includes(term)) return groups
      const group = moduleGroups[module] ?? 'Outros'
      groups[group] = [...(groups[group] ?? []), permission]
      return groups
    }, {})
  }, [permissions, search])

  const permissionsByGroup = useMemo(() => permissions.reduce<Record<string, Permission[]>>((groups, permission) => {
    const group = moduleGroups[permission.module_name] ?? 'Outros'
    groups[group] = [...(groups[group] ?? []), permission]
    return groups
  }, {}), [permissions])

  function selectRole(id: string) {
    setSelectedRole(id)
    setCreatingRole(false)
    setError('')
    setNotice('')
  }

  function newRole() {
    setSelectedRole('')
    setCreatingRole(true)
    setRoleName('')
    setRoleDescription('')
    setRoleActive(true)
    setRoleGrants([])
    setError('')
    setNotice('')
  }

  function togglePermission(permission: Permission, checked: boolean) {
    if (roleName.toLowerCase() === 'admin') return
    const permissionName = `${permission.module_name}:${permission.action_name}`
    setRoleGrants((current) => checked
      ? [...new Set([...current, permissionName])]
      : current.filter((item) => item !== permissionName))
  }

  function toggleModulePermissions(module: string, modulePermissions: Permission[]) {
    if (roleName.toLowerCase() === 'admin') return
    const keys = modulePermissions.map((permission) => `${permission.module_name}:${permission.action_name}`)
    const allSelected = keys.every((key) => roleGrants.includes(key))
    setRoleGrants((current) => allSelected ? current.filter((key) => !keys.includes(key)) : [...new Set([...current, ...keys])])
  }

  async function saveRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!creatingRole && !window.confirm(`Salvar as alterações do cargo ${roleName}?`)) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      if (creatingRole) {
        const result = await api<{ role: Role }>('/api/admin/rbac/roles', {
          method: 'POST',
          body: JSON.stringify({ name: roleName, description: roleDescription, permissions: roleGrants }),
        })
        setNotice('Cargo criado e auditado.')
        await load()
        setSelectedRole(result.role.id)
      } else if (role) {
        await api('/api/admin/rbac/roles', {
          method: 'PUT',
          body: JSON.stringify({ id: role.id, name: roleName, description: roleDescription, permissions: roleGrants, isActive: roleActive }),
        })
        setNotice('Cargo e permissões atualizados.')
        await load()
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar o cargo.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteRole() {
    if (!deletingRole) return
    if (deletingRole.memberCount > 0 && !reassignRoleId) {
      setError('Selecione um cargo ativo para reatribuir os usuários antes de excluir.')
      return
    }

    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/admin/rbac/roles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: deletingRole.id,
          ...(reassignRoleId ? { reassignToRoleId: reassignRoleId } : {}),
        }),
      })
      const result = await response.json() as {
        error?: string
        role_id?: string
        reassigned_member_count?: number
        memberCount?: number
      }
      if (!response.ok) {
        const memberCount = result.memberCount
        if (typeof memberCount === 'number') {
          setRoles((current) => current.map((item) => item.id === deletingRole.id
            ? { ...item, memberCount }
            : item))
        }
        throw new Error(result.error || 'Não foi possível excluir o cargo.')
      }

      const reassignedCount = result.reassigned_member_count ?? 0
      setDeletingRole(null)
      setReassignRoleId('')
      setNotice(reassignedCount > 0
        ? `Cargo excluído; ${reassignedCount} usuário(s) foram reatribuídos e a operação foi registrada na auditoria.`
        : 'Cargo excluído e operação registrada na auditoria.')
      await load()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Não foi possível excluir o cargo.')
    } finally {
      setSaving(false)
    }
  }

  async function loadMemberOverrides(memberId: string) {
    try {
      const result = await api<{ overrides: Array<{ effect: Override['effect']; access_permissions: { module_name: string; action_name: string } | { module_name: string; action_name: string }[] }> }>(`/api/admin/rbac/users/${memberId}/permissions`)
      setPermissionOverrides((current) => ({ ...current, [memberId]: result.overrides.map((item) => { const permission = Array.isArray(item.access_permissions) ? item.access_permissions[0] : item.access_permissions; return { module_name: permission.module_name, action_name: permission.action_name, effect: item.effect } }) }))
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as exceções.') }
  }

  async function updateMemberOverride(memberId: string, module: string, action: string, effect: Override['effect']) {
    const effectLabel = effect === 'inherit' ? 'restaurar a herança do cargo' : effect === 'allow' ? 'conceder' : 'restringir'
    if (!window.confirm(`Confirmar ${effectLabel} a permissão ${actionLabels[action] ?? action} em ${moduleLabels[module] ?? module}?`)) return
    try {
      await api(`/api/admin/rbac/users/${memberId}/permissions`, { method: 'PATCH', body: JSON.stringify({ module, action, effect }) })
      await loadMemberOverrides(memberId)
      setNotice(effect === 'inherit' ? 'Permissão restaurada ao cargo.' : 'Exceção individual salva.')
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar a exceção.') }
  }

  async function updateMember(member: Member, patch: { roleName?: string; status?: string }) {
    const changeLabel = patch.roleName
      ? `alterar o cargo de ${member.full_name} para ${patch.roleName}`
      : `alterar o status de ${member.full_name} para ${patch.status}`
    if (!window.confirm(`Confirmar ${changeLabel}?`)) return
    setError('')
    setNotice('')
    try {
      const result = await api<{ warning?: string | null }>(`/api/admin/rbac/users/${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
      setNotice(result.warning || 'Usuário atualizado e alteração registrada na auditoria.')
      await load()
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Não foi possível atualizar o usuário.')
    }
  }

  async function deleteMember(member: Member) {
    if (member.user_id === currentUserId) return
    if (!window.confirm(`Excluir ${member.full_name} e revogar o acesso ao workspace? Esta ação não pode ser desfeita.`)) return
    setError('')
    setNotice('')
    setSaving(true)
    try {
      const result = await api<{ warning?: string | null }>(`/api/admin/rbac/users/${member.id}`, { method: 'DELETE' })
      setMemberDetails(null)
      setNotice(result.warning || 'Usuário excluído e acesso revogado.')
      await load()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Não foi possível excluir o usuário.')
    } finally {
      setSaving(false)
    }
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    const form = new FormData(event.currentTarget)
    try {
      const result = await api<{ warning?: string | null; accountCreated: boolean }>('/api/admin/rbac/users', {
        method: 'POST',
        body: JSON.stringify({
          fullName: form.get('fullName'),
          email: form.get('email'),
          phone: form.get('phone'),
          roleName: form.get('roleName'),
          password: form.get('password') || undefined,
        }),
      })
      setInviteOpen(false)
      setNotice(result.warning || (result.accountCreated
        ? 'Conta criada e associada ao cargo. Compartilhe a senha inicial com a pessoa por um canal seguro.'
        : 'Conta existente confirmada, senha sincronizada quando informada e associada ao cargo selecionado.'))
      await load()
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'Não foi possível criar o usuário.')
    } finally {
      setSaving(false)
    }
  }

  async function saveMemberProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingMember) return
    setSaving(true)
    setError('')
    setNotice('')
    const form = new FormData(event.currentTarget)
    try {
      const result = await api<{ warning?: string | null }>(`/api/admin/rbac/users/${editingMember.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fullName: form.get('fullName'), email: form.get('email'), phone: form.get('phone') }),
      })
      setEditingMember(null)
      setNotice(result.warning || 'Dados do usuário atualizados e registrados na auditoria.')
      await load()
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : 'Não foi possível editar o usuário.')
    } finally {
      setSaving(false)
    }
  }

  return <section className="space-y-6">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-blue-400">Administração segura</p><h1 className="text-2xl font-semibold text-white">Cargos e permissões</h1><p className="mt-1.5 text-sm text-slate-500">Configure acesso por setor, ação e cargo individual da equipe.</p></div>
      <div className="flex gap-2">
        {view === 'roles' ? <button onClick={newRole} className="flex items-center gap-2 rounded-lg bg-blue-500 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-blue-400"><Plus className="size-4" />Novo cargo</button>
          : <button aria-expanded={inviteOpen} onClick={() => setInviteOpen((open) => !open)} className="flex items-center gap-2 rounded-lg bg-blue-500 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-blue-400"><Plus className="size-4" />Criar usuário</button>}
      </div>
    </header>

    <div className="flex gap-1 border-b border-white/[0.07]">
      <button onClick={() => { setView('roles'); setInviteOpen(false) }} className={`border-b-2 px-4 py-3 text-xs font-medium ${view === 'roles' ? 'border-blue-400 text-blue-300' : 'border-transparent text-slate-500'}`}><Shield className="mr-2 inline size-3.5" />Cargos e matriz</button>
      <button onClick={() => { setView('users'); setInviteOpen(false) }} className={`border-b-2 px-4 py-3 text-xs font-medium ${view === 'users' ? 'border-blue-400 text-blue-300' : 'border-transparent text-slate-500'}`}><Users className="mr-2 inline size-3.5" />Usuários</button>
    </div>
    {error && <div role="alert" className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}
    {notice && <div role="status" className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{notice}</div>}

    {loading ? <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-[#11161e] p-8 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" />Carregando dados de acesso...</div>
      : view === 'roles' ? <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="h-fit rounded-xl border border-white/[0.07] bg-[#11161e] p-3">
          <h2 className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Cargos ({roles.length})</h2>
          <div className="space-y-1">{roles.map((item) => <button key={item.id} onClick={() => selectRole(item.id)} className={`w-full rounded-lg px-3 py-3 text-left ${selectedRole === item.id && !creatingRole ? 'bg-blue-500/10 text-blue-200' : 'text-slate-300 hover:bg-white/[0.04]'}`}>
            <span className="flex items-center justify-between gap-2 text-sm font-medium"><span className="truncate">{item.name}</span>{item.is_system && <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[9px] uppercase text-amber-300">{item.name.toLowerCase() === 'admin' ? 'Protegido' : 'Sistema'}</span>}</span>
            <span className="mt-1 block text-[11px] text-slate-500">{item.memberCount} usuário(s) · {item.is_active ? 'Ativo' : 'Inativo'}</span>
          </button>)}
            {creatingRole && <div className="rounded-lg bg-blue-500/10 px-3 py-3 text-sm font-medium text-blue-200">Novo cargo</div>}
          </div>
        </aside>
        <form onSubmit={(event) => void saveRole(event)} className="min-w-0 space-y-4 rounded-xl border border-white/[0.07] bg-[#11161e] p-5">
          {role || creatingRole ? <>
            <div className="grid gap-4 sm:grid-cols-[1fr_1.5fr_auto]">
              <label className="text-xs text-slate-500">Nome do cargo<input required minLength={2} maxLength={50} disabled={role?.name.toLowerCase() === 'admin'} value={roleName} onChange={(event) => setRoleName(event.target.value)} className={inputClass} /></label>
              <label className="text-xs text-slate-500">Descrição<input maxLength={300} value={roleDescription} onChange={(event) => setRoleDescription(event.target.value)} className={inputClass} /></label>
              {!creatingRole && role?.name.toLowerCase() !== 'admin' && <label className="flex items-center gap-2 self-end pb-3 text-xs text-slate-400"><input type="checkbox" checked={roleActive} onChange={(event) => setRoleActive(event.target.checked)} className="accent-blue-500" />Ativo</label>}
            </div>
            {role?.name.toLowerCase() === 'admin' && <p className="rounded-lg border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2 text-xs text-amber-200">Admin mantém acesso integral e protegido; este cargo não pode ser renomeado, desativado ou reduzido.</p>}
            <details className="rounded-xl border border-white/[0.06] bg-white/[0.01]"><summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-white">Permissões por cargo/papel</summary><div className="space-y-4 px-4 pb-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-sm font-semibold text-white">Matriz granular de permissões</h2><p className="mt-1 text-xs text-slate-500">Organizada por setor e módulo. Permissões não selecionadas são negadas por padrão.</p></div><div className="flex items-center gap-2 rounded-lg border border-white/[0.07] px-3 py-2"><Search className="size-3.5 text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar módulo ou ação" className="w-44 bg-transparent text-xs text-slate-200 outline-none" /></div></div>
            <div className="max-h-[56vh] space-y-4 overflow-y-auto pr-1">
              {Object.entries(groupedPermissions).map(([group, entries]) => {
                const modulePermissions = new Map<string, Permission[]>()
                for (const permission of entries) modulePermissions.set(permission.module_name, [...(modulePermissions.get(permission.module_name) ?? []), permission])
                return <section key={group} className="rounded-lg border border-white/[0.06]">
                  <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5"><h3 className="text-xs font-semibold uppercase tracking-wide text-blue-300">{group}</h3><button type="button" disabled={roleName.toLowerCase() === 'admin'} onClick={() => toggleModulePermissions(group, entries)} className="rounded-md border border-blue-400/20 px-2 py-1 text-[10px] font-medium text-blue-200 hover:bg-blue-400/10 disabled:cursor-not-allowed disabled:opacity-50">Liberar setor</button></div>
                  <div className="divide-y divide-white/[0.04]">{[...modulePermissions].map(([module, actions]) => { const moduleKeys = actions.map((permission) => `${permission.module_name}:${permission.action_name}`); const selectedCount = moduleKeys.filter((key) => roleName.toLowerCase() === 'admin' || roleGrants.includes(key)).length; return <div key={module} className="grid gap-3 px-4 py-3 md:grid-cols-[190px_1fr]">
                    <div><p className="text-xs font-medium text-slate-300">{moduleLabels[module] ?? module}</p><p className="mt-1 text-[10px] text-slate-600">{selectedCount}/{actions.length} liberadas</p></div>
                    <div className="grid gap-2 sm:grid-cols-2">{actions.map((permission) => {
                      const key = `${permission.module_name}:${permission.action_name}`
                      const checked = roleName.toLowerCase() === 'admin' || roleGrants.includes(key)
                      const actionLabel = actionLabels[permission.action_name] ?? permission.action_name
                      return <div key={permission.id} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${checked ? 'border-blue-400/20 bg-blue-400/[0.06]' : 'border-white/[0.06] bg-white/[0.015]'}`}>
                        <span className={`text-[11px] ${checked ? 'text-slate-200' : 'text-slate-500'}`}>{actionLabel}</span>
                        <PermissionSwitch checked={checked} disabled={roleName.toLowerCase() === 'admin'} label={`${checked ? 'Bloquear' : 'Liberar'} ${actionLabel} em ${moduleLabels[module] ?? module}`} onChange={(value) => togglePermission(permission, value)} />
                      </div>
                    })}</div>
                  </div>})}</div>
                </section>
              })}
            </div>
            </div></details>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4"><p className="text-[11px] text-slate-600">{role?.memberCount ?? 0} usuário(s) · alterações são registradas na auditoria</p><div className="flex flex-wrap gap-2">{!creatingRole && role && !role.is_system && <button type="button" disabled={saving} onClick={() => { setDeletingRole(role); setReassignRoleId(''); setError(''); setNotice('') }} className="flex items-center gap-2 rounded-lg border border-rose-500/25 px-3 py-2.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="size-3.5" />Excluir cargo</button>}<button disabled={saving || role?.name.toLowerCase() === 'admin'} className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{creatingRole ? 'Criar cargo' : 'Salvar permissões'}</button></div></div>
          </> : <p className="p-8 text-sm text-slate-500">Selecione um cargo para consultar sua matriz.</p>}
        </form>
      </div> : <div className="space-y-4">
        <label className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-[#11161e] px-3 py-2.5">
          <Search className="size-4 text-slate-500" aria-hidden="true" />
          <span className="sr-only">Pesquisar usuários</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar por apelido, nome, cargo ou setor" className="w-full bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-600" />
        </label>
        {inviteOpen && <form onSubmit={(event) => void inviteMember(event)} className="grid gap-3 rounded-xl border border-white/[0.07] bg-[#11161e] p-5 sm:grid-cols-2 xl:grid-cols-6">
          <label className="text-xs text-slate-500">Nome<input name="fullName" required minLength={2} maxLength={200} className={inputClass} /></label>
          <label className="text-xs text-slate-500">E-mail<input name="email" type="email" required className={inputClass} /></label>
          <label className="text-xs text-slate-500">Telefone<input name="phone" type="tel" maxLength={40} placeholder="+55 (11) 99999-9999" className={inputClass} /></label>
          <label className="text-xs text-slate-500">Senha inicial (conta nova)<input name="password" type="password" minLength={8} maxLength={128} autoComplete="new-password" className={inputClass} /><span className="mt-1 block text-[10px] text-slate-600">Obrigatória para conta nova; deixe vazia para vincular uma conta já existente.</span></label>
          <label className="text-xs text-slate-500">Cargo<select name="roleName" required className={inputClass}>{roles.filter((item) => item.is_active).map((item) => <option key={item.id}>{item.name}</option>)}</select></label>
          <button disabled={saving} className="mt-auto flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}Criar usuário</button>
        </form>}
        {editingMember && <form onSubmit={(event) => void saveMemberProfile(event)} className="grid gap-3 rounded-xl border border-white/[0.07] bg-[#11161e] p-5 sm:grid-cols-[1fr_1fr_1fr_auto_auto]">
          <label className="text-xs text-slate-500">Nome<input name="fullName" required minLength={2} maxLength={200} defaultValue={editingMember.full_name} className={inputClass} /></label>
          <label className="text-xs text-slate-500">E-mail<input name="email" type="email" required defaultValue={editingMember.email} className={inputClass} /></label>
          <label className="text-xs text-slate-500">Telefone<input name="phone" type="tel" maxLength={40} defaultValue={editingMember.phone ?? ""} placeholder="+55 (11) 99999-9999" className={inputClass} /></label>
          <button disabled={saving} className="mt-auto flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Salvar</button>
          <button type="button" onClick={() => setEditingMember(null)} className="mt-auto rounded-lg border border-white/[0.08] px-3 py-2.5 text-xs text-slate-300">Cancelar</button>
        </form>}
        <div className="overflow-x-auto rounded-xl border border-white/[0.07] bg-[#11161e]">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-white/[0.07] text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Membro</th><th className="px-4 py-3">Cargo</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Criado em</th><th className="px-4 py-3">Ações</th></tr></thead>
            <tbody className="divide-y divide-white/[0.04]">{filteredMembers.map((member) => {
              const self = member.user_id === currentUserId
              return <tr key={member.id}>
                <td className="px-4 py-3"><button type="button" onClick={() => { setMemberDetails(member); setExpandedMember(member.id); void loadMemberOverrides(member.id) }} className="flex items-center gap-3 text-left"><UserAvatar user={{ fullName: member.full_name }} size="sm" /><span><span className="block text-xs font-medium text-slate-200">{member.full_name}{self ? ' (você)' : ''}</span><span className="mt-1 block text-[11px] text-slate-500">{member.email}</span></span></button></td>
                <td className="px-4 py-3"><select aria-label={`Cargo de ${member.full_name}`} disabled={self} value={member.role_name} onChange={(event) => void updateMember(member, { roleName: event.target.value })} className="rounded-lg border border-white/[0.08] bg-[#0d1118] px-2 py-2 text-xs text-slate-200 disabled:opacity-50">{roles.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></td>
                <td className="px-4 py-3"><select aria-label={`Status de ${member.full_name}`} disabled={self} value={member.status.replace(/[\'"]/g, '').trim().toLowerCase() === 'ativo' || member.status.toLowerCase() === 'active' ? 'Ativo' : 'Inativo'} onChange={(event) => void updateMember(member, { status: event.target.value })} className="rounded-lg border border-white/[0.08] bg-[#0d1118] px-2 py-2 text-xs text-slate-200 disabled:opacity-50"><option value="Ativo">Ativo</option><option value="Inativo">Inativo</option></select></td>
                <td className="px-4 py-3 text-xs text-slate-500">{new Date(member.created_at).toLocaleDateString('pt-BR')}</td>
                <td className="px-4 py-3"><div className="flex gap-1.5"><button type="button" onClick={() => { setMemberDetails(member); setExpandedMember(member.id); void loadMemberOverrides(member.id) }} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-2 text-xs text-slate-300 hover:bg-white/[0.04]"><Eye className="size-3.5" />Detalhes</button><button type="button" disabled={self || saving} onClick={() => { setEditingMember(member); setMemberDetails(null) }} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-2 text-xs text-slate-300 hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-40"><Pencil className="size-3.5" />Editar</button><button type="button" disabled={self || saving} onClick={() => void deleteMember(member)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/25 px-2.5 py-2 text-xs text-rose-300 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="size-3.5" />Excluir</button></div></td>
              </tr>
            })}</tbody>
          </table>
          {!members.length && <div className="p-10 text-center text-sm text-slate-500">Nenhum membro cadastrado.</div>}
        </div>
        <p className="text-[11px] text-slate-600">Criações, edições, alterações de cargo/status são auditadas. Um usuário não pode alterar a própria conta ou desativar o último administrador.</p>
      </div>}
      {memberDetails && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMemberDetails(null) }}>
        <section role="dialog" aria-modal="true" aria-labelledby="member-details-title" className="w-full max-w-lg rounded-xl border border-white/[0.08] bg-[#11161e] p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-wider text-blue-300">Usuário</p><h2 id="member-details-title" className="mt-1 text-lg font-semibold text-white">{memberDetails.full_name}</h2></div><button type="button" onClick={() => setMemberDetails(null)} aria-label="Fechar detalhes"><X className="size-5 text-slate-400" /></button></div>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-slate-500">E-mail</dt><dd className="mt-1 break-all text-slate-200">{memberDetails.email}</dd></div>
            <div><dt className="text-xs text-slate-500">Telefone</dt><dd className="mt-1 text-slate-200">{memberDetails.phone || "Não informado"}</dd></div>
            <div><dt className="text-xs text-slate-500">Cargo</dt><dd className="mt-1 text-slate-200">{memberDetails.job_title || memberDetails.role_name}</dd></div>
            <div><dt className="text-xs text-slate-500">Setor</dt><dd className="mt-1 text-slate-200">{memberDetails.department || 'Não informado'}</dd></div>
            <div><dt className="text-xs text-slate-500">Entrada na equipe</dt><dd className="mt-1 text-slate-200">{memberDetails.joined_on ? new Date(memberDetails.joined_on).toLocaleDateString('pt-BR') : 'Não informado'}</dd></div>
            <div><dt className="text-xs text-slate-500">Status</dt><dd className="mt-1 text-slate-200">{memberDetails.status}</dd></div>
            <div><dt className="text-xs text-slate-500">Criado em</dt><dd className="mt-1 text-slate-200">{new Date(memberDetails.created_at).toLocaleDateString('pt-BR')}</dd></div>
          </dl>
          {expandedMember === memberDetails.id && <details className="mt-6 border-t border-white/[0.06] pt-4"><summary className="cursor-pointer list-none text-xs font-semibold text-slate-300">Permissões individuais</summary><div className="mt-2"><p className="text-xs font-semibold text-slate-300">Exceções individuais</p><p className="mt-1 text-[11px] text-slate-500">Herdar remove a exceção e mantém a permissão do cargo.</p><div className="mt-3 max-h-80 space-y-2 overflow-y-auto">{Object.entries(permissionsByGroup).map(([group, groupPermissions]) => { const byModule = Object.entries(groupPermissions.reduce<Record<string, Permission[]>>((modules, permission) => { modules[permission.module_name] = [...(modules[permission.module_name] ?? []), permission]; return modules }, {})); return <details key={group} className="rounded-lg border border-white/[0.06] bg-white/[0.015]"><summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-blue-300">{group}</summary><div className="space-y-2 px-2 pb-2">{byModule.map(([module, modulePermissions]) => <details key={module} className="rounded-md border border-white/[0.05]"><summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-300">{moduleLabels[module] ?? module}</summary><div className="space-y-1 px-2 pb-2">{modulePermissions.map((permission) => { const override = permissionOverrides[memberDetails.id]?.find((item) => item.module_name === permission.module_name && item.action_name === permission.action_name); return <label key={permission.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] px-3 py-2 text-xs text-slate-300"><span>{actionLabels[permission.action_name] ?? permission.action_name}</span><select value={override?.effect ?? 'inherit'} onChange={(event) => void updateMemberOverride(memberDetails.id, permission.module_name, permission.action_name, event.target.value as Override['effect'])} className="rounded border border-white/[0.08] bg-[#0d1118] px-2 py-1.5 text-[11px] text-slate-200"><option value="inherit">Herdar</option><option value="allow">Permitir</option><option value="deny">Negar</option></select></label> })}</div></details>)}</div></details> })}</div></div></details>}
          <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setMemberDetails(null)} className="rounded-lg px-3 py-2 text-xs text-slate-300">Fechar</button><button type="button" disabled={memberDetails.user_id === currentUserId} onClick={() => { setEditingMember(memberDetails); setMemberDetails(null) }} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><Pencil className="size-3.5" />Editar</button></div>
        </section>
      </div>}
    {deletingRole && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setDeletingRole(null) }}>
      <section role="dialog" aria-modal="true" aria-labelledby="delete-role-title" className="w-full max-w-lg rounded-xl border border-white/[0.08] bg-[#11161e] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-wider text-rose-300">Exclusão de cargo</p><h2 id="delete-role-title" className="mt-1 text-lg font-semibold text-white">Excluir “{deletingRole.name}”?</h2></div><button type="button" disabled={saving} onClick={() => setDeletingRole(null)} aria-label="Fechar confirmação" className="disabled:opacity-40"><X className="size-5 text-slate-400" /></button></div>
        <p className="mt-3 text-sm text-slate-400">{deletingRole.memberCount > 0
          ? `${deletingRole.memberCount} usuário(s) estão vinculados a este cargo. Selecione um cargo ativo para reatribuí-los antes de excluir.`
          : 'A operação será bloqueada se houver usuários vinculados. Caso existam vínculos não exibidos, você poderá selecionar um cargo de destino.'}</p>
        {deletingRole.memberCount > 0 && <label className="mt-4 block text-xs text-slate-500">Reatribuir usuários para<select value={reassignRoleId} onChange={(event) => { setReassignRoleId(event.target.value); setError('') }} className={inputClass}><option value="">Selecione um cargo ativo</option>{roles.filter((item) => item.is_active && item.id !== deletingRole.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        <div className="mt-6 flex justify-end gap-2"><button type="button" disabled={saving} onClick={() => setDeletingRole(null)} className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-slate-300 disabled:opacity-40">Cancelar</button><button type="button" disabled={saving || (deletingRole.memberCount > 0 && !reassignRoleId)} onClick={() => void deleteRole()} className="inline-flex items-center gap-2 rounded-lg bg-rose-500 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{saving ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}Confirmar exclusão</button></div>
      </section>
    </div>}
  </section>
}
