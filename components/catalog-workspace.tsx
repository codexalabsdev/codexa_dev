'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Boxes, Database, ExternalLink, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { EntityAttachments } from '@/components/entity-attachments'
import { IntegrationHelp } from '@/components/integration-help'

type CatalogTab = 'systems' | 'modules'
type Client = { id: string; name: string }
type System = { id: string; name: string; internal_code: string; description: string | null; client_id: string | null; access_type: string; operational_status: string; production_url: string | null; started_at: string | null; delivered_at: string | null; contract_id: string | null; plan_id: string | null; observations: string | null }
type Module = { id: string; system_id: string | null; name: string; internal_code: string; description: string | null; category: string | null; icon: string | null; access_url: string | null; access_type: string; implementation_status: string; availability_status: string; observations: string | null }

const inputClass = 'field rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-violet-400/60'
const systemStatuses = ['Em desenvolvimento', 'Homologação', 'Ativo', 'Suspenso', 'Arquivado']
const accessTypes = ['Interno', 'Externo', 'Integração']

export function CatalogWorkspace({ initialTab = 'systems' }: { initialTab?: string }) {
  const tab: CatalogTab = initialTab === 'modules' ? 'modules' : 'systems'
  const [clients, setClients] = useState<Client[]>([])
  const [systems, setSystems] = useState<System[]>([])
  const [modules, setModules] = useState<Module[]>([])
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState(false)
  const [detail, setDetail] = useState<System | null>(null)
  const [editing, setEditing] = useState<System | Module | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function loadData() {
    setLoading(true)
    const supabase = createClient()
    const [clientsResult, systemsResult, modulesResult] = await Promise.all([
      supabase.from('clients').select('id,legal_name,trade_name').order('legal_name'),
      supabase.from('systems').select('id,name,internal_code,description,client_id,access_type,operational_status,production_url,started_at,delivered_at,contract_id,plan_id,observations').order('name'),
      supabase.from('system_modules').select('id,system_id,name,internal_code,description,category,icon,access_url,access_type,implementation_status,availability_status,observations').order('name'),
    ])
    const firstError = clientsResult.error ?? systemsResult.error ?? modulesResult.error
    setError(clientsResult.error
      ? `Não foi possível carregar os clientes: ${clientsResult.error.message}`
      : firstError ? 'Não foi possível carregar o catálogo. Verifique sua sessão e as permissões.' : '')
    setClients(((clientsResult.data ?? []) as { id: string; legal_name: string; trade_name: string | null }[]).map((client) => ({
      id: client.id,
      name: client.trade_name || client.legal_name,
    })))
    setSystems((systemsResult.data ?? []) as System[])
    setModules((modulesResult.data ?? []) as Module[])
    setLoading(false)
  }

  useEffect(() => { void loadData() }, [])

  const filteredSystems = useMemo(() => systems.filter((item) => `${item.name} ${item.internal_code} ${item.operational_status}`.toLowerCase().includes(query.toLowerCase())), [systems, query])
  const filteredModules = useMemo(() => modules.filter((item) => `${item.name} ${item.internal_code} ${item.category ?? ''}`.toLowerCase().includes(query.toLowerCase())), [modules, query])
  const clientName = (id: string | null) => clients.find((client) => client.id === id)?.name ?? 'Sem cliente vinculado'
  const systemName = (id: string | null) => systems.find((system) => system.id === id)?.name ?? 'Sem sistema vinculado'

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('')
    const data = Object.fromEntries(new FormData(event.currentTarget).entries())
    const supabase = createClient()
    const isSystem = tab === 'systems'
    const table = isSystem ? 'systems' : 'system_modules'
    const payload = isSystem ? {
      name: String(data.name).trim(), internal_code: String(data.internal_code).trim(), description: String(data.description || '').trim() || null,
      client_id: String(data.client_id || '') || null, access_type: String(data.access_type || 'Externo').toLowerCase(), operational_status: String(data.operational_status || 'Em desenvolvimento'),
      production_url: String(data.production_url || '').trim() || null, started_at: String(data.started_at || '') || null, delivered_at: String(data.delivered_at || '') || null,
      plan_id: String(data.plan_id || '') || null, observations: String(data.observations || '').trim() || null,
    } : {
      system_id: String(data.system_id || '') || null, name: String(data.name).trim(), internal_code: String(data.internal_code).trim(), description: String(data.description || '').trim() || null,
      category: String(data.category || '').trim() || null, icon: String(data.icon || '').trim() || null, access_url: String(data.access_url || '').trim() || null,
      access_type: String(data.access_type || 'Interno').toLowerCase(), implementation_status: String(data.implementation_status || 'Não iniciado'), availability_status: String(data.availability_status || 'Indisponível'), observations: String(data.observations || '').trim() || null,
    }
    const result = editing ? await supabase.from(table).update(payload).eq('id', editing.id) : await supabase.from(table).insert(payload)
    if (result.error) setError('Não foi possível salvar. Confira os campos obrigatórios e os identificadores únicos.')
    else { setModal(false); setEditing(null); setNotice(editing ? 'Registro atualizado.' : 'Registro criado.'); await loadData() }
    setSaving(false)
  }

  async function remove(item: System | Module) {
    if (!window.confirm(`Excluir “${item.name}”? Esta ação não pode ser desfeita.`)) return
    const table = tab === 'systems' ? 'systems' : 'system_modules'
    const { error: removeError } = await createClient().from(table).delete().eq('id', item.id)
    if (removeError) setError('Não foi possível excluir este registro. Verifique se existem vínculos dependentes.')
    else { setNotice('Registro excluído.'); if (detail?.id === item.id) setDetail(null); await loadData() }
  }

  const openCreate = () => { setEditing(null); setModal(true); setError('') }
  const openEdit = (item: System | Module) => { setEditing(item); setModal(true); setError('') }
  const current = tab === 'systems' ? filteredSystems : filteredModules

  return <section className="mt-6 rounded-xl border border-white/[0.07] bg-[#11161e]">
    <header className="flex flex-col gap-4 border-b border-white/[0.07] p-5 lg:flex-row lg:items-center lg:justify-between">
      <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-violet-400">Catálogo de produtos</p><h2 className="mt-1 text-lg font-semibold text-white">{tab === 'systems' ? 'Sistemas dos clientes' : 'Módulos'}</h2><div className="flex items-start gap-2"><div><p className="mt-1 text-xs text-slate-500">{tab === 'systems' ? 'Sistemas desenvolvidos ou disponibilizados para cada cliente.' : 'Módulos vinculados a sistemas, com acesso e status independentes.'}</p></div><IntegrationHelp title={tab === 'systems' ? 'sistemas' : 'módulos'} steps={tab === 'systems' ? ['Cadastre o sistema e vincule-o ao cliente correspondente.', 'Adicione módulos associados e informe o tipo de acesso e o status.', 'Use a URL de produção somente quando o sistema estiver pronto.', 'Abra o sistema para consultar anexos e acessar os módulos liberados.'] : ['Crie o módulo com um código interno único; esse identificador é a identidade do módulo, não uma rota.', 'Associe-o a um sistema para que apareça no catálogo do cliente.', 'Defina o status de implementação e disponibilidade. A URL de acesso é apenas o endereço do módulo, quando existir.', 'O vínculo entre módulo e rota protegida é configurado na licença, porque pode variar por cliente e implantação.']} /></div></div>
      <div className="flex flex-wrap gap-2"><button onClick={() => setQuery('')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${tab === 'systems' ? 'bg-violet-500 text-white' : 'bg-white/[0.04] text-slate-400'}`}><Boxes className="size-3.5" />Sistemas dos clientes</button><button onClick={() => setQuery('')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${tab === 'modules' ? 'bg-violet-500 text-white' : 'bg-white/[0.04] text-slate-400'}`}><Database className="size-3.5" />Módulos</button><button onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-900"><Plus className="size-3.5" />{tab === 'systems' ? 'Adicionar sistema' : 'Novo módulo'}</button></div>
    </header>
    <div className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-3"><div className="flex flex-1 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2"><Search className="size-4 text-slate-600" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar por nome, código ou status..." className="w-full bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600" /></div><button onClick={() => void loadData()} className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-slate-400 hover:text-white">Atualizar</button></div>
    {(error || notice) && <div className={`mx-5 mt-4 flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${error ? 'border-amber-400/20 bg-amber-400/5 text-amber-300' : 'border-emerald-400/20 bg-emerald-400/5 text-emerald-300'}`}><span>{error || notice}</span><button onClick={() => { setError(''); setNotice('') }} aria-label="Fechar aviso"><X className="size-3.5" /></button></div>}
    {loading ? <div className="flex min-h-48 items-center justify-center text-xs text-slate-500"><Loader2 className="mr-2 size-4 animate-spin" />Carregando catálogo...</div> : current.length === 0 ? <div className="flex min-h-48 flex-col items-center justify-center text-center"><p className="text-sm text-slate-400">Nenhum {tab === 'systems' ? 'sistema' : 'módulo'} cadastrado</p><p className="mt-1 text-xs text-slate-600">Use o botão acima para começar.</p></div> : <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-b border-white/[0.07] text-[10px] uppercase tracking-wider text-slate-600"><tr><th className="px-5 py-3">Nome</th><th className="px-5 py-3">{tab === 'systems' ? 'Cliente' : 'Sistema'}</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Ações</th></tr></thead><tbody>{current.map((item) => { const system = tab === 'systems' ? item as System : null; const module = tab === 'modules' ? item as Module : null; return <tr key={item.id} className="border-b border-white/[0.05] last:border-0"><td className="px-5 py-3"><button onClick={() => system && setDetail(system)} className="text-left font-medium text-slate-200 hover:text-violet-300">{item.name}</button><p className="mt-0.5 text-[11px] text-slate-600">{item.internal_code}</p></td><td className="px-5 py-3 text-slate-400">{system ? clientName(system.client_id) : systemName(module?.system_id ?? null)}</td><td className="px-5 py-3"><span className="rounded-full bg-white/[0.05] px-2 py-1 text-[10px] text-slate-300">{system?.operational_status ?? module?.implementation_status}</span></td><td className="px-5 py-3"><div className="flex justify-end gap-2"><button onClick={() => openEdit(item)} aria-label="Editar" className="rounded-md p-1.5 text-slate-500 hover:bg-white/[0.05] hover:text-white"><Pencil className="size-3.5" /></button><button onClick={() => void remove(item)} aria-label="Excluir" className="rounded-md p-1.5 text-slate-500 hover:bg-red-400/10 hover:text-red-300"><Trash2 className="size-3.5" /></button></div></td></tr> })}</tbody></table></div>}
    {detail && <div className="border-t border-white/[0.07] p-5"><div className="flex items-start justify-between"><div><p className="text-xs uppercase tracking-wider text-violet-400">Detalhes do sistema</p><h3 className="mt-1 text-lg font-semibold text-white">{detail.name}</h3><p className="mt-1 text-xs text-slate-500">{clientName(detail.client_id)} · {detail.operational_status}</p></div><button onClick={() => setDetail(null)} aria-label="Fechar detalhes"><X className="size-4 text-slate-500" /></button></div><p className="mt-4 max-w-2xl text-sm text-slate-400">{detail.description || 'Sem descrição cadastrada.'}</p><div className="mt-4 grid gap-3 text-xs text-slate-400 sm:grid-cols-3"><span>Acesso: {detail.access_type}</span><span>Início: {detail.started_at || 'Não informado'}</span><span>Entrega: {detail.delivered_at || 'Não informado'}</span></div><EntityAttachments entityType="system" entityId={detail.id} /><div className="mt-5"><p className="mb-2 text-xs font-semibold text-slate-300">Módulos associados</p><div className="space-y-2">{modules.filter((module) => module.system_id === detail.id).map((module) => <div key={module.id} className="flex items-center justify-between rounded-lg border border-white/[0.07] bg-white/[0.02] p-3"><div><p className="text-xs font-medium text-slate-200">{module.name}</p><p className="text-[11px] text-slate-500">{module.implementation_status} · {module.availability_status}</p></div>{module.access_url && module.implementation_status !== 'Não iniciado' ? <a href={module.access_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-violet-300 hover:text-violet-200">Acessar<ExternalLink className="size-3" /></a> : <span className="text-[11px] text-slate-600">Acesso indisponível</span>}</div>)}{modules.filter((module) => module.system_id === detail.id).length === 0 && <p className="text-xs text-slate-600">Nenhum módulo associado.</p>}</div></div></div>}
    {modal && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-white/10 bg-[#151b24] p-5 shadow-2xl"><div className="mb-5 flex items-center justify-between"><div><h3 className="font-semibold text-white">{editing ? 'Editar' : 'Novo'} {tab === 'systems' ? 'sistema' : 'módulo'}</h3><p className="mt-1 text-xs text-slate-500">Os dados serão persistidos no Supabase.</p></div><button onClick={() => setModal(false)} aria-label="Fechar formulário"><X className="size-4 text-slate-500" /></button></div><form onSubmit={save} className="grid gap-3 sm:grid-cols-2"><input required name="name" defaultValue={editing?.name ?? ''} placeholder="Nome *" className={`${inputClass} sm:col-span-2`} /><input required name="internal_code" defaultValue={editing?.internal_code ?? ''} placeholder="Identificador único *" className={inputClass} />{tab === 'systems' ? <><select name="client_id" defaultValue={(editing as System | null)?.client_id ?? ''} className={inputClass}><option value="">Sem cliente vinculado</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select><select name="operational_status" defaultValue={(editing as System | null)?.operational_status ?? systemStatuses[0]} className={inputClass}>{systemStatuses.map((status) => <option key={status}>{status}</option>)}</select><select name="access_type" defaultValue={(editing as System | null)?.access_type ?? 'externo'} className={inputClass}>{accessTypes.map((type) => <option key={type} value={type.toLowerCase()}>{type}</option>)}</select><input name="production_url" defaultValue={(editing as System | null)?.production_url ?? ''} placeholder="URL de acesso" className={`${inputClass} sm:col-span-2`} /><input type="date" name="started_at" defaultValue={(editing as System | null)?.started_at ?? ''} className={inputClass} /><input type="date" name="delivered_at" defaultValue={(editing as System | null)?.delivered_at ?? ''} className={inputClass} /></> : <><select name="system_id" defaultValue={(editing as Module | null)?.system_id ?? ''} className={`${inputClass} sm:col-span-2`}><option value="">Sem sistema vinculado</option>{systems.map((system) => <option key={system.id} value={system.id}>{system.name} · {clientName(system.client_id)}</option>)}</select><input name="category" defaultValue={(editing as Module | null)?.category ?? ''} placeholder="Categoria" className={inputClass} /><input name="icon" defaultValue={(editing as Module | null)?.icon ?? ''} placeholder="Ícone" className={inputClass} /><input name="access_url" defaultValue={(editing as Module | null)?.access_url ?? ''} placeholder="URL ou rota real de acesso" className={`${inputClass} sm:col-span-2`} /><select name="implementation_status" defaultValue={(editing as Module | null)?.implementation_status ?? 'Não iniciado'} className={inputClass}><option>Não iniciado</option><option>Em desenvolvimento</option><option>Implementado</option></select><select name="availability_status" defaultValue={(editing as Module | null)?.availability_status ?? 'Indisponível'} className={inputClass}><option>Indisponível</option><option>Contratado</option><option>Licença válida</option><option>Acesso liberado</option></select></>}<textarea name="description" defaultValue={editing?.description ?? ''} placeholder="Descrição" rows={3} className={`${inputClass} resize-none sm:col-span-2`} /><textarea name="observations" defaultValue={editing?.observations ?? ''} placeholder="Observações" rows={2} className={`${inputClass} resize-none sm:col-span-2`} /><button disabled={saving} className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-violet-500 px-4 py-2.5 text-xs font-semibold text-white hover:bg-violet-400 disabled:opacity-60 sm:col-span-2">{saving && <Loader2 className="size-3.5 animate-spin" />}{saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar registro'}</button></form></div></div>}
  </section>
}
