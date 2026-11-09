'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Building2, Check, Eye, Inbox, Loader2, MessageSquare, Pencil, Plus, Search, Trash2, X } from 'lucide-react'

type Module = 'leads' | 'clients' | 'messages'
type Lead = { id: string; name: string; contact_name: string | null; email: string | null; phone: string | null; status: string; priority: string; source: string | null; created_at: string }
type Client = { id: string; legal_name: string; trade_name: string | null; email: string | null; phone: string | null; status: string; entry_date: string }
type Message = { id: string; sender: string; subject: string; content: string; channel: string; status: string; priority: string; received_at: string }
type RecordData = Lead | Client | Message

const statuses = ['Novo lead', 'Primeiro contato', 'Qualificação', 'Reunião agendada', 'Levantamento de requisitos', 'Proposta em preparação', 'Proposta enviada', 'Negociação', 'Fechado — ganho', 'Fechado — perdido']
const inputClass = 'w-full rounded-lg border border-white/10 bg-[#151b24] p-3 text-sm text-white'
const moduleForPermission: Record<Module, string> = { leads: 'leads', clients: 'clients', messages: 'contacts' }

export function CrmWorkspace({ initialModule = 'leads', permissions = [] }: { initialModule?: Module; permissions?: string[] }) {
  const [module, setModule] = useState<Module>(initialModule)
  const [leads, setLeads] = useState<Lead[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(false)
  const [record, setRecord] = useState<RecordData | null>(null)
  const [editingRecord, setEditingRecord] = useState(false)

  const canCreate = permissions.includes('*') || permissions.includes(`${moduleForPermission[module]}:create`)
  const canUpdate = permissions.includes('*') || permissions.includes(`${moduleForPermission[module]}:update`)
  const canDelete = permissions.includes('*') || permissions.includes(`${moduleForPermission[module]}:delete`)

  async function loadData() {
    setLoading(true)
    setError('')
    const supabase = createClient()
    const [leadResult, clientResult, messageResult] = await Promise.all([
      supabase.from('leads').select('id,name,contact_name,email,phone,status,priority,source,created_at').order('created_at', { ascending: false }),
      supabase.from('clients').select('id,legal_name,trade_name,email,phone,status,entry_date').order('created_at', { ascending: false }),
      supabase.from('messages').select('id,sender,subject,content,channel,status,priority,received_at').order('received_at', { ascending: false }),
    ])
    if (leadResult.error || clientResult.error || messageResult.error) setError('Não foi possível carregar os registros. Verifique sua permissão e sessão.')
    setLeads((leadResult.data ?? []) as Lead[])
    setClients((clientResult.data ?? []) as Client[])
    setMessages((messageResult.data ?? []) as Message[])
    setLoading(false)
  }

  useEffect(() => { void loadData() }, [])

  const filtered = useMemo(() => {
    const term = query.toLowerCase()
    if (module === 'leads') return leads.filter((item) => `${item.name} ${item.contact_name ?? ''} ${item.email ?? ''}`.toLowerCase().includes(term))
    if (module === 'clients') return clients.filter((item) => `${item.legal_name} ${item.trade_name ?? ''} ${item.email ?? ''}`.toLowerCase().includes(term))
    return messages.filter((item) => `${item.sender} ${item.subject} ${item.channel}`.toLowerCase().includes(term))
  }, [clients, leads, messages, module, query])

  async function remove(id: string) {
    if (!canDelete || !window.confirm('Excluir este registro? Esta ação não pode ser desfeita.')) return
    const table = module === 'leads' ? 'leads' : module === 'clients' ? 'clients' : 'messages'
    const { error: deleteError } = await createClient().from(table).delete().eq('id', id)
    if (deleteError) setError(`Não foi possível excluir: ${deleteError.message}`)
    else await loadData()
  }

  async function createRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canCreate) return
    setSaving(true)
    setError('')
    const data = Object.fromEntries(new FormData(event.currentTarget).entries())
    const table = module === 'leads' ? 'leads' : module === 'clients' ? 'clients' : 'messages'
    const payload = module === 'leads'
      ? { name: data.name, contact_name: data.contact_name || null, email: data.email || null, phone: data.phone || null, source: data.source || null }
      : module === 'clients'
        ? { legal_name: data.legal_name, trade_name: data.trade_name || null, email: data.email || null, phone: data.phone || null }
        : { sender: data.sender, subject: data.subject, content: data.content, channel: data.channel || 'Manual' }
    const { error: insertError } = await createClient().from(table).insert(payload)
    if (insertError) setError(`Não foi possível salvar: ${insertError.message}`)
    else { setModal(false); await loadData() }
    setSaving(false)
  }

  async function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!record || !canUpdate) return
    setSaving(true)
    setError('')
    const data = Object.fromEntries(new FormData(event.currentTarget).entries())
    const table = module === 'leads' ? 'leads' : module === 'clients' ? 'clients' : 'messages'
    const payload = module === 'leads'
      ? { name: data.name, contact_name: data.contact_name || null, email: data.email || null, phone: data.phone || null, source: data.source || null, status: data.status, priority: data.priority }
      : module === 'clients'
        ? { legal_name: data.legal_name, trade_name: data.trade_name || null, email: data.email || null, phone: data.phone || null, status: data.status }
        : { sender: data.sender, subject: data.subject, content: data.content, channel: data.channel, status: data.status, priority: data.priority }
    const { error: updateError } = await createClient().from(table).update(payload).eq('id', record.id)
    if (updateError) setError(`Não foi possível salvar as alterações: ${updateError.message}`)
    else { setRecord(null); setEditingRecord(false); await loadData() }
    setSaving(false)
  }

  const title = module === 'leads' ? 'Leads' : module === 'clients' ? 'Clientes' : 'Mensagens recebidas'
  const empty = module === 'leads' ? 'Nenhum lead encontrado' : module === 'clients' ? 'Nenhum cliente encontrado' : 'Nenhuma mensagem encontrada'
  const recordTitle = record ? ('name' in record ? record.name : 'legal_name' in record ? record.legal_name : record.subject) : ''

  function field(name: string, label: string, value: string | null | undefined, type = 'text') {
    return <label key={name} className="text-xs text-slate-400">{label}<input name={name} type={type} defaultValue={value || ''} className={`${inputClass} mt-1`} /></label>
  }

  return <section className="mt-6 rounded-xl border border-white/[0.07] bg-[#11161e]">
    <div className="flex flex-col gap-4 border-b border-white/[0.07] p-5 lg:flex-row lg:items-center lg:justify-between">
      <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-blue-400">CRM operacional</p><h2 className="mt-1 text-lg font-semibold text-white">{title}</h2><p className="mt-1 text-xs text-slate-500">Registros sincronizados com o Supabase.</p></div>
      <div className="flex flex-wrap gap-2">{([['leads', Inbox, 'Leads'], ['clients', Building2, 'Clientes'], ['messages', MessageSquare, 'Mensagens']] as const).map(([key, Icon, label]) => <button key={key} onClick={() => { setModule(key); setQuery(''); setRecord(null); setEditingRecord(false) }} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${module === key ? 'bg-blue-500 text-white' : 'bg-white/[0.04] text-slate-400 hover:text-white'}`}><Icon className="size-3.5" />{label}</button>)}<button disabled={!canCreate} onClick={() => setModal(true)} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="size-3.5" />Novo registro</button></div>
    </div>
    <div className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-3"><div className="flex flex-1 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2"><Search className="size-4 text-slate-600" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar registros..." className="w-full bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600" /></div><button onClick={() => void loadData()} className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-slate-400 hover:text-white">Atualizar</button></div>
    {error && <div className="mx-5 mt-4 flex items-center justify-between rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-300"><span>{error}</span><button onClick={() => setError('')} aria-label="Fechar aviso"><X className="size-3.5" /></button></div>}
    <div className="overflow-x-auto">{loading ? <div className="flex min-h-40 items-center justify-center text-xs text-slate-500"><Loader2 className="mr-2 size-4 animate-spin" />Carregando registros...</div> : filtered.length === 0 ? <div className="flex min-h-40 flex-col items-center justify-center text-center"><div className="mb-2 grid size-9 place-items-center rounded-full bg-white/[0.04] text-slate-600"><Inbox className="size-4" /></div><p className="text-sm text-slate-400">{empty}</p><p className="mt-1 text-xs text-slate-600">{canCreate ? 'Use “Novo registro” para começar.' : 'Nenhum registro encontrado.'}</p></div> : <table className="w-full text-left text-xs">
      <thead className="border-b border-white/[0.07] text-[10px] uppercase tracking-wider text-slate-600"><tr>{module === 'leads' ? <><th className="px-5 py-3">Nome</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Origem</th></> : module === 'clients' ? <><th className="px-5 py-3">Cliente</th><th className="px-5 py-3">Contato</th><th className="px-5 py-3">Status</th></> : <><th className="px-5 py-3">Remetente</th><th className="px-5 py-3">Assunto</th><th className="px-5 py-3">Canal</th></>}<th className="px-5 py-3 text-right">Ações</th></tr></thead>
      <tbody>{filtered.map((item) => <tr key={item.id} className="border-b border-white/[0.05] last:border-0">
        <td className="px-5 py-3 font-medium text-slate-200">{module === 'leads' ? (item as Lead).name : module === 'clients' ? (item as Client).legal_name : (item as Message).sender}</td>
        <td className="px-5 py-3 text-slate-400">{module === 'leads' ? (item as Lead).status : module === 'clients' ? ((item as Client).email || (item as Client).phone || 'Sem contato') : (item as Message).subject}</td>
        <td className="px-5 py-3 text-slate-500">{module === 'leads' ? ((item as Lead).source || 'Não informado') : module === 'clients' ? (item as Client).status : (item as Message).channel}</td>
        <td className="px-5 py-3 text-right"><div className="inline-flex gap-1"><button onClick={() => { setRecord(item); setEditingRecord(false); setError('') }} aria-label="Ver detalhes" className="rounded p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"><Eye className="size-3.5" /></button>{canUpdate && <button onClick={() => { setRecord(item); setEditingRecord(true); setError('') }} aria-label="Editar registro" className="rounded p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"><Pencil className="size-3.5" /></button>}{canDelete && <button onClick={() => void remove(item.id)} className="rounded p-1.5 text-slate-600 hover:bg-rose-400/10 hover:text-rose-300" aria-label="Excluir registro"><Trash2 className="size-3.5" /></button>}</div></td>
      </tr>)}</tbody>
    </table>}</div>
    {modal && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><div className="w-full max-w-lg rounded-xl border border-white/10 bg-[#151b24] p-5 shadow-2xl">
      <div className="mb-5 flex items-center justify-between"><div><h3 className="font-semibold text-white">Novo {module === 'leads' ? 'lead' : module === 'clients' ? 'cliente' : 'mensagem'}</h3><p className="mt-1 text-xs text-slate-500">Os campos obrigatórios são validados pelo banco.</p></div><button onClick={() => setModal(false)} aria-label="Fechar formulário" className="text-slate-500 hover:text-white"><X className="size-4" /></button></div>
      <form onSubmit={(event) => void createRecord(event)} className="flex flex-col gap-3">{module === 'leads' && <><input required name="name" placeholder="Nome da pessoa ou empresa *" className={inputClass} /><input name="contact_name" placeholder="Nome do contato" className={inputClass} /><input type="email" name="email" placeholder="E-mail" className={inputClass} /><input name="phone" placeholder="Telefone" className={inputClass} /><input name="source" placeholder="Origem do lead" className={inputClass} /></>}{module === 'clients' && <><input required name="legal_name" placeholder="Nome completo ou razão social *" className={inputClass} /><input name="trade_name" placeholder="Nome fantasia" className={inputClass} /><input type="email" name="email" placeholder="E-mail" className={inputClass} /><input name="phone" placeholder="Telefone" className={inputClass} /></>}{module === 'messages' && <><input required name="sender" placeholder="Remetente *" className={inputClass} /><input required name="subject" placeholder="Assunto *" className={inputClass} /><textarea required name="content" placeholder="Conteúdo da mensagem *" rows={4} className={`${inputClass} resize-none`} /><select name="channel" className={inputClass}><option>Manual</option><option>Formulário do site</option><option>E-mail</option><option>WhatsApp</option></select></>}<div className="mt-2 flex justify-end gap-2"><button type="button" onClick={() => setModal(false)} className="rounded-lg px-3 py-2 text-xs text-slate-400 hover:text-white">Cancelar</button><button disabled={saving} className="flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">{saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}Salvar registro</button></div></form>
    </div></div>}
    {record && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRecord(null) }}><div className="w-full max-w-xl rounded-xl border border-white/10 bg-[#151b24] p-5 shadow-2xl">
      <div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-wider text-blue-300">{title.slice(0, -1)}</p><h3 className="mt-1 text-lg font-semibold text-white">{editingRecord ? 'Editar registro' : recordTitle}</h3></div><button type="button" onClick={() => setRecord(null)} aria-label="Fechar detalhes" className="text-slate-500 hover:text-white"><X className="size-5" /></button></div>
      {editingRecord ? <form onSubmit={(event) => void saveRecord(event)} className="grid gap-3 sm:grid-cols-2">
        {module === 'leads' && <>{field('name', 'Nome', (record as Lead).name)}{field('contact_name', 'Contato', (record as Lead).contact_name)}{field('email', 'E-mail', (record as Lead).email, 'email')}{field('phone', 'Telefone', (record as Lead).phone)}{field('source', 'Origem', (record as Lead).source)}<label className="text-xs text-slate-400">Status<select name="status" defaultValue={(record as Lead).status} className={`${inputClass} mt-1`}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label><label className="text-xs text-slate-400">Prioridade<select name="priority" defaultValue={(record as Lead).priority} className={`${inputClass} mt-1`}><option>Baixa</option><option>Média</option><option>Alta</option><option>Urgente</option></select></label></>}
        {module === 'clients' && <>{field('legal_name', 'Razão social / nome', (record as Client).legal_name)}{field('trade_name', 'Nome fantasia', (record as Client).trade_name)}{field('email', 'E-mail', (record as Client).email, 'email')}{field('phone', 'Telefone', (record as Client).phone)}<label className="text-xs text-slate-400">Status<select name="status" defaultValue={(record as Client).status} className={`${inputClass} mt-1`}><option>Ativo</option><option>Inativo</option><option>Prospecto</option></select></label></>}
        {module === 'messages' && <>{field('sender', 'Remetente', (record as Message).sender)}{field('subject', 'Assunto', (record as Message).subject)}{field('channel', 'Canal', (record as Message).channel)}<label className="text-xs text-slate-400">Status<select name="status" defaultValue={(record as Message).status} className={`${inputClass} mt-1`}><option>Novo</option><option>Em andamento</option><option>Respondido</option><option>Arquivado</option></select></label><label className="text-xs text-slate-400 sm:col-span-2">Conteúdo<textarea name="content" required defaultValue={(record as Message).content} rows={5} className={`${inputClass} mt-1`} /></label></>}
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setEditingRecord(false)} className="rounded-lg px-3 py-2 text-xs text-slate-300">Cancelar</button><button disabled={saving} className="rounded-lg bg-blue-500 px-4 py-2 text-xs font-semibold text-white">{saving ? 'Salvando...' : 'Salvar alterações'}</button></div>
      </form> : <div className="grid gap-4 text-sm sm:grid-cols-2">
        {'name' in record && <><p className="text-slate-400">Contato<span className="mt-1 block text-slate-200">{record.contact_name || 'Não informado'}</span></p><p className="text-slate-400">E-mail<span className="mt-1 block text-slate-200">{record.email || 'Não informado'}</span></p><p className="text-slate-400">Telefone<span className="mt-1 block text-slate-200">{record.phone || 'Não informado'}</span></p><p className="text-slate-400">Origem / status<span className="mt-1 block text-slate-200">{record.source || 'Não informado'} · {record.status}</span></p></>}
        {'legal_name' in record && <><p className="text-slate-400">Nome fantasia<span className="mt-1 block text-slate-200">{record.trade_name || 'Não informado'}</span></p><p className="text-slate-400">Status<span className="mt-1 block text-slate-200">{record.status}</span></p><p className="text-slate-400">E-mail<span className="mt-1 block text-slate-200">{record.email || 'Não informado'}</span></p><p className="text-slate-400">Telefone<span className="mt-1 block text-slate-200">{record.phone || 'Não informado'}</span></p></>}
        {'sender' in record && <><p className="text-slate-400">Remetente<span className="mt-1 block text-slate-200">{record.sender}</span></p><p className="text-slate-400">Canal / status<span className="mt-1 block text-slate-200">{record.channel} · {record.status}</span></p><p className="whitespace-pre-wrap text-slate-300 sm:col-span-2">{record.content}</p></>}
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setRecord(null)} className="rounded-lg px-3 py-2 text-xs text-slate-300">Fechar</button>{canUpdate && <button type="button" onClick={() => setEditingRecord(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-2 text-xs font-semibold text-white"><Pencil className="size-3.5" />Editar</button>}</div>
      </div>}
      {error && <p role="alert" className="mt-4 rounded-lg bg-amber-400/10 p-3 text-xs text-amber-300">{error}</p>}
    </div></div>}
  </section>
}
