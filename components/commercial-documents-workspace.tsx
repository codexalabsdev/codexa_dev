'use client'

import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import useSWR from 'swr'
import { Archive, ArrowDownToLine, ArrowLeft, ArrowRight, Check, CircleAlert, Clock3, FileCheck2, FilePlus2, FileText, LoaderCircle, Plus, Search, Settings2, Trash2, X } from 'lucide-react'

type DocumentType = 'receipt' | 'quote' | 'billing_notice' | 'service_order'
type Status = 'draft' | 'review' | 'issued' | 'cancelled'
type LineItem = { description: string; quantity: number; unit_price_cents: number }
type DocumentEvent = { id: string; event_type: string; details: Record<string, unknown>; created_at: string }
type CommercialDocument = {
  id: string; document_type: DocumentType; status: Status; title: string; description: string; client_id: string | null; project_id: string | null
  line_items: LineItem[]; subtotal_cents: number; discount_cents: number; total_cents: number; due_date: string | null; notes: string
  document_number: string | null; issued_at: string | null; pdf_url: string | null; created_at: string; events?: DocumentEvent[]
}
type Client = { id: string; legal_name: string; trade_name: string | null }
type Project = { id: string; name: string; client_id: string | null }
type Settings = { issuer_name: string; issuer_tax_id: string; issuer_email: string; issuer_phone: string; issuer_address: string }
type LineForm = { description: string; quantity: string; unit_price: string }

const typeLabels: Record<DocumentType, string> = { receipt: 'Recibo', quote: 'Orçamento', billing_notice: 'Cobrança', service_order: 'Ordem de serviço' }
const statusLabels: Record<Status, string> = { draft: 'Rascunho', review: 'Em revisão', issued: 'Emitido', cancelled: 'Cancelado' }
const eventLabels: Record<string, string> = { created: 'Rascunho criado', updated: 'Rascunho atualizado', review_requested: 'Enviado para revisão', issued: 'Documento emitido', cancelled: 'Emissão cancelada', deleted: 'Rascunho removido', pdf_downloaded: 'PDF acessado' }
const statusStyles: Record<Status, string> = { draft: 'border-white/10 bg-white/[.04] text-slate-300', review: 'border-amber-300/20 bg-amber-300/[.08] text-amber-200', issued: 'border-emerald-300/20 bg-emerald-300/[.08] text-emerald-200', cancelled: 'border-rose-300/20 bg-rose-300/[.08] text-rose-200' }
const currency = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
const inputClass = 'w-full rounded-lg border border-white/10 bg-[#151b24] px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/10'
const fetcher = async (url: string) => { const response = await fetch(url, { cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os documentos.'); return data }
const emptyItem = (): LineForm => ({ description: '', quantity: '1', unit_price: '' })

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-xs font-medium text-slate-400"><span>{label}</span>{children}</label>
}

export function CommercialDocumentsWorkspace({ permissions = [] }: { permissions?: string[] }) {
  const { data, error, isLoading, mutate } = useSWR<{ documents: CommercialDocument[]; settings: Settings | null }>('/api/workspace/commercial-documents', fetcher)
  const { data: references } = useSWR<{ clients: Client[]; projects: Project[] }>('/api/workspace/commercial-documents/references', fetcher)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [modal, setModal] = useState<'create' | 'settings' | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [formError, setFormError] = useState('')
  const [lines, setLines] = useState<LineForm[]>([emptyItem()])
  const [settingsForm, setSettingsForm] = useState<Settings>({ issuer_name: '', issuer_tax_id: '', issuer_email: '', issuer_phone: '', issuer_address: '' })

  const docs = data?.documents ?? []
  const visible = useMemo(() => docs.filter((doc) => (typeFilter === 'all' || doc.document_type === typeFilter) && (statusFilter === 'all' || doc.status === statusFilter) && `${doc.title} ${doc.document_number ?? ''} ${doc.description}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))), [docs, typeFilter, statusFilter, query])
  const subtotal = lines.reduce((sum, item) => sum + Math.round(Number(item.unit_price || 0) * 100) * Math.max(0, Number(item.quantity) || 0), 0)
  const counts = { issued: docs.filter((doc) => doc.status === 'issued').length, review: docs.filter((doc) => doc.status === 'review').length, drafts: docs.filter((doc) => doc.status === 'draft').length }
  const canCreate = permissions.includes('*') || permissions.includes('documents:create')
  const canUpdate = permissions.includes('*') || permissions.includes('documents:update')
  const canDelete = permissions.includes('*') || permissions.includes('documents:delete')
  const canIssue = permissions.includes('*') || permissions.includes('documents:issue')
  const canCancel = permissions.includes('*') || permissions.includes('documents:cancel')
  const canDownload = permissions.includes('*') || permissions.includes('documents:download')
  const canConfigure = permissions.includes('*') || permissions.includes('documents:configure')

  function openCreate() { setLines([emptyItem()]); setFormError(''); setModal('create') }
  function openSettings() { const current = data?.settings; setSettingsForm({ issuer_name: current?.issuer_name || 'Codexa', issuer_tax_id: current?.issuer_tax_id || '', issuer_email: current?.issuer_email || '', issuer_phone: current?.issuer_phone || '', issuer_address: current?.issuer_address || '' }); setFormError(''); setModal('settings') }
  function setLine(index: number, key: keyof LineForm, value: string) { setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, [key]: value } : line)) }

  async function submitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setFormError('')
    const form = new FormData(event.currentTarget)
    const lineItems = lines.map((line) => ({ description: line.description, quantity: Number(line.quantity), unit_price_cents: Math.round(Number(line.unit_price) * 100) }))
    try {
      const response = await fetch('/api/workspace/commercial-documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document_type: form.get('document_type'), title: form.get('title'), description: form.get('description') || '', client_id: form.get('client_id') || null, project_id: form.get('project_id') || null, line_items: lineItems, discount_cents: Math.round(Number(form.get('discount') || 0) * 100), due_date: form.get('due_date') || null, notes: form.get('notes') || '' }) })
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Não foi possível salvar o rascunho.')
      setMessage('Rascunho salvo na Central de Documentos.'); setModal(null); await mutate()
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Não foi possível salvar o rascunho.') } finally { setBusy(false) }
  }

  async function updateStatus(document: CommercialDocument, status: 'draft' | 'review') {
    setBusy(true); setMessage('')
    try { const response = await fetch(`/api/workspace/commercial-documents/${document.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setMessage(status === 'review' ? 'Documento encaminhado para revisão.' : 'Documento voltou para rascunho.'); await mutate() }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não foi possível atualizar o documento.') } finally { setBusy(false) }
  }

  async function issue(document: CommercialDocument) {
    if (!window.confirm(`Emitir “${document.title}”? A emissão atribui um número sequencial e o conteúdo ficará imutável.`)) return
    setBusy(true); setMessage('')
    try { const response = await fetch(`/api/workspace/commercial-documents/${document.id}`, { method: 'POST' }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setMessage(result.warning ?? `Documento ${result.document.document_number} emitido.`); await mutate() }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não foi possível emitir o documento.') } finally { setBusy(false) }
  }

  async function cancel(document: CommercialDocument) {
    const reason = window.prompt(`Informe o motivo para cancelar ${document.document_number ?? document.title}.`)
    if (reason === null) return
    if (reason.trim().length < 3) { setMessage('Informe um motivo de cancelamento com pelo menos 3 caracteres.'); return }
    setBusy(true)
    try { const response = await fetch(`/api/workspace/commercial-documents/${document.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', reason }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setMessage('Documento cancelado e motivo registrado no histórico.'); await mutate() }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não foi possível cancelar o documento.') } finally { setBusy(false) }
  }

  async function remove(document: CommercialDocument) {
    if (!window.confirm(`Excluir o rascunho “${document.title}”? Esta ação não pode ser desfeita.`)) return
    setBusy(true)
    try { const response = await fetch(`/api/workspace/commercial-documents/${document.id}`, { method: 'DELETE' }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setMessage('Rascunho excluído.'); await mutate() }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não foi possível excluir o rascunho.') } finally { setBusy(false) }
  }

  async function download(document: CommercialDocument) {
    try { const response = await fetch(`/api/workspace/commercial-documents/${document.id}/pdf`); const result = await response.json(); if (!response.ok) throw new Error(result.error); window.location.assign(result.url) }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não foi possível abrir o PDF.') }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setFormError('')
    try { const response = await fetch('/api/workspace/commercial-documents/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settingsForm) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setMessage('Dados do emissor atualizados.'); setModal(null); await mutate() }
    catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Não foi possível salvar os dados do emissor.') } finally { setBusy(false) }
  }

  return <main className="mt-6 flex flex-col gap-6 pb-10">
    <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-cyan-300"><Archive className="size-3.5" />Central documental</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Documentos comerciais</h1><p className="mt-1 max-w-2xl text-sm text-slate-400">Prepare, revise e emita documentos comerciais com histórico e numeração sequencial.</p></div>
      <div className="flex flex-wrap gap-2">{canConfigure && <button type="button" onClick={openSettings} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/5"><Settings2 className="size-4" />Dados do emissor</button>}<button type="button" onClick={() => void mutate()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/5"><Archive className="size-4" />Atualizar</button>{canCreate && <button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"><FilePlus2 className="size-4" />Novo documento</button>}</div>
    </header>

    {message && <div role="status" className="flex items-start gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/[.06] px-4 py-3 text-sm text-cyan-100"><CircleAlert className="mt-0.5 size-4 shrink-0" />{message}</div>}
    {error && <div role="alert" className="rounded-xl border border-rose-300/20 bg-rose-300/[.06] px-4 py-3 text-sm text-rose-100">{error.message}</div>}

    <section aria-label="Resumo de documentos" className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-white/[.08] bg-[#11161e] p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium uppercase tracking-wider text-slate-500">Emitidos</p><FileCheck2 className="size-4 text-emerald-300" /></div><p className="mt-3 text-2xl font-semibold text-white">{counts.issued}</p><p className="mt-1 text-xs text-slate-500">Com PDF privado e registro imutável</p></div>
      <div className="rounded-2xl border border-white/[.08] bg-[#11161e] p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium uppercase tracking-wider text-slate-500">Em revisão</p><Clock3 className="size-4 text-amber-300" /></div><p className="mt-3 text-2xl font-semibold text-white">{counts.review}</p><p className="mt-1 text-xs text-slate-500">Aguardando aprovação para emissão</p></div>
      <div className="rounded-2xl border border-white/[.08] bg-[#11161e] p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium uppercase tracking-wider text-slate-500">Rascunhos</p><FileText className="size-4 text-cyan-300" /></div><p className="mt-3 text-2xl font-semibold text-white">{counts.drafts}</p><p className="mt-1 text-xs text-slate-500">Ainda não têm número oficial</p></div>
    </section>

    <section className="overflow-hidden rounded-2xl border border-white/[.08] bg-[#11161e]">
      <div className="flex flex-col gap-3 border-b border-white/[.07] p-4 lg:flex-row lg:items-center lg:justify-between">
        <div><h2 className="text-sm font-semibold text-slate-100">Todos os documentos</h2><p className="mt-1 text-xs text-slate-500">Recibos, orçamentos, cobranças e ordens de serviço</p></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative min-w-52"><span className="sr-only">Pesquisar documentos</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><input className={`${inputClass} pl-9`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar documento" /></label>
          <label><span className="sr-only">Filtrar por tipo</span><select className={inputClass} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">Todos os tipos</option>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span className="sr-only">Filtrar por estado</span><select className={inputClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Todos os estados</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
      </div>
      {isLoading ? <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-slate-500"><LoaderCircle className="size-4 animate-spin" />Carregando documentos...</div> : visible.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center"><div className="grid size-12 place-items-center rounded-2xl border border-white/[.08] bg-white/[.03]"><FileText className="size-5 text-slate-500" /></div><h3 className="mt-4 text-sm font-medium text-slate-200">Nenhum documento nesta lista</h3><p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">{query || typeFilter !== 'all' || statusFilter !== 'all' ? 'Ajuste os filtros para ver outros resultados.' : 'Crie um rascunho para iniciar o fluxo de revisão e emissão.'}</p></div> : <div className="divide-y divide-white/[.06]">{visible.map((document) => <article key={document.id} className="flex flex-col gap-4 p-4 transition hover:bg-white/[.015] sm:flex-row sm:items-center sm:justify-between sm:px-5"><div className="flex min-w-0 items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[.06]"><FileText className="size-4 text-cyan-200" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-semibold text-slate-100">{document.title}</h3><span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusStyles[document.status]}`}>{statusLabels[document.status]}</span></div><p className="mt-1 text-xs text-slate-500">{typeLabels[document.document_type]}{document.document_number ? ` · ${document.document_number}` : ''} · {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(document.created_at))}</p><p className="mt-1 text-xs text-slate-400">{currency(document.total_cents)}{document.description ? ` · ${document.description}` : ''}</p>{document.events?.length ? <details className="mt-2 text-xs"><summary className="w-fit cursor-pointer text-slate-500 hover:text-slate-300">Histórico · {document.events.length} eventos</summary><ol className="mt-2 grid gap-1.5 border-l border-white/10 pl-3 text-slate-400">{document.events.map((event) => <li key={event.id}><span className="text-slate-200">{eventLabels[event.event_type] ?? 'Atualização'}</span><time className="ml-2 text-slate-500">{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(event.created_at))}</time>{event.event_type === 'cancelled' && typeof event.details.reason === 'string' && <p className="mt-0.5 text-slate-500">Motivo: {event.details.reason}</p>}</li>)}</ol></details> : null}</div></div><div className="flex flex-wrap items-center gap-2 sm:justify-end">{canUpdate && document.status === 'draft' && <button type="button" disabled={busy} onClick={() => void updateStatus(document, 'review')} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-50"><ArrowRight className="size-3.5" />Enviar para revisão</button>}{canUpdate && document.status === 'review' && <button type="button" disabled={busy} onClick={() => void updateStatus(document, 'draft')} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-50"><ArrowLeft className="size-3.5" />Voltar ao rascunho</button>}{canIssue && ['draft', 'review'].includes(document.status) && <button type="button" disabled={busy} onClick={() => void issue(document)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-300 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-200 disabled:opacity-50"><Check className="size-3.5" />Emitir</button>}{canCancel && document.status === 'issued' && <button type="button" disabled={busy} onClick={() => void cancel(document)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300/20 px-3 py-2 text-xs text-rose-200 hover:bg-rose-300/[.06] disabled:opacity-50">Cancelar emissão</button>}{canDownload && ['issued', 'cancelled'].includes(document.status) && <button type="button" onClick={() => void download(document)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5"><ArrowDownToLine className="size-3.5" />PDF</button>}{canDelete && ['draft', 'review'].includes(document.status) && <button type="button" disabled={busy} onClick={() => void remove(document)} aria-label={`Excluir rascunho ${document.title}`} className="grid size-9 place-items-center rounded-lg border border-white/10 text-slate-400 hover:border-rose-300/30 hover:text-rose-200 disabled:opacity-50"><Trash2 className="size-4" /></button>}</div></article>)}</div>}
      <div className="flex items-center justify-between border-t border-white/[.07] px-4 py-3 text-xs text-slate-500"><span>{visible.length} de {docs.length} documentos</span><span>Valores em BRL · sem emissão fiscal</span></div>
    </section>

    {modal && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setModal(null) }}><section role="dialog" aria-modal="true" aria-labelledby="document-modal-title" className="my-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0e131b] shadow-2xl"><header className="flex items-start justify-between gap-4 border-b border-white/[.08] p-5"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-cyan-300">{modal === 'create' ? 'Novo rascunho' : 'Configurações'}</p><h2 id="document-modal-title" className="mt-1 text-lg font-semibold text-white">{modal === 'create' ? 'Preparar documento comercial' : 'Dados do emissor'}</h2><p className="mt-1 text-xs text-slate-500">{modal === 'create' ? 'Os valores são calculados em centavos no servidor.' : 'Esses dados serão capturados no momento da emissão.'}</p></div><button type="button" onClick={() => !busy && setModal(null)} aria-label="Fechar" className="grid size-9 place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white"><X className="size-4" /></button></header>
      {modal === 'create' ? <form onSubmit={submitDraft} className="grid gap-5 p-5"><div className="grid gap-4 sm:grid-cols-2"><Field label="Tipo de documento"><select name="document_type" className={inputClass}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Título"><input name="title" required minLength={2} maxLength={160} className={inputClass} placeholder="Ex.: Consultoria de implantação" /></Field></div><Field label="Descrição"><textarea name="description" maxLength={2000} rows={2} className={inputClass} placeholder="Contexto breve do documento" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Cliente"><select name="client_id" className={inputClass}><option value="">Sem vínculo com cliente</option>{(references?.clients ?? []).map((client) => <option key={client.id} value={client.id}>{client.trade_name || client.legal_name}</option>)}</select></Field><Field label="Projeto"><select name="project_id" className={inputClass}><option value="">Sem vínculo com projeto</option>{(references?.projects ?? []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field></div><div className="grid gap-3 rounded-xl border border-white/[.08] bg-white/[.02] p-4"><div className="flex items-center justify-between"><div><h3 className="text-sm font-medium text-slate-200">Itens</h3><p className="mt-0.5 text-xs text-slate-500">O total é calculado automaticamente.</p></div><button type="button" onClick={() => lines.length < 30 && setLines((current) => [...current, emptyItem()])} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/5"><Plus className="size-3.5" />Adicionar item</button></div>{lines.map((line, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_90px_130px_36px]"><Field label={index === 0 ? 'Descrição do item' : `Item ${index + 1}`}><input required minLength={2} maxLength={200} className={inputClass} value={line.description} onChange={(event) => setLine(index, 'description', event.target.value)} placeholder="Serviço ou produto" /></Field><Field label={index === 0 ? 'Quantidade' : 'Qtd.'}><input required type="number" min="1" max="10000" step="1" className={inputClass} value={line.quantity} onChange={(event) => setLine(index, 'quantity', event.target.value)} /></Field><Field label={index === 0 ? 'Valor unitário (R$)' : 'Valor unitário'}><input required type="number" min="0" max="1000000" step="0.01" className={inputClass} value={line.unit_price} onChange={(event) => setLine(index, 'unit_price', event.target.value)} placeholder="0,00" /></Field>{lines.length > 1 && <button type="button" aria-label={`Remover item ${index + 1}`} onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} className="mt-auto grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-rose-300/10 hover:text-rose-200"><X className="size-4" /></button>}</div>)}<div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[.08] pt-3"><label className="flex items-center gap-2 text-xs text-slate-400">Desconto (R$)<input name="discount" type="number" min="0" max={subtotal / 100} step="0.01" defaultValue="0" className="w-28 rounded-lg border border-white/10 bg-[#151b24] px-2.5 py-2 text-sm text-white" /></label><p className="text-xs text-slate-400">Subtotal <strong className="ml-2 text-lg text-white">{currency(subtotal)}</strong></p></div></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Vencimento (opcional)"><input name="due_date" type="date" className={inputClass} /></Field><Field label="Observações"><input name="notes" maxLength={2000} className={inputClass} placeholder="Condições e informações adicionais" /></Field></div>{formError && <p role="alert" className="rounded-lg border border-rose-300/20 bg-rose-300/[.06] px-3 py-2 text-xs text-rose-100">{formError}</p>}<footer className="flex flex-col-reverse gap-2 border-t border-white/[.08] pt-4 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={() => setModal(null)} className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5">Cancelar</button><button type="submit" disabled={busy || lines.some((line) => !line.description.trim() || Number(line.quantity) < 1 || Number(line.unit_price) < 0)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-200 disabled:opacity-50">{busy && <LoaderCircle className="size-4 animate-spin" />}Salvar rascunho</button></footer></form> : <form onSubmit={saveSettings} className="grid gap-4 p-5"><Field label="Nome / razão social"><input required minLength={2} maxLength={160} value={settingsForm.issuer_name} onChange={(event) => setSettingsForm((current) => ({ ...current, issuer_name: event.target.value }))} className={inputClass} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="CPF/CNPJ (opcional)"><input maxLength={40} value={settingsForm.issuer_tax_id} onChange={(event) => setSettingsForm((current) => ({ ...current, issuer_tax_id: event.target.value }))} className={inputClass} /></Field><Field label="E-mail"><input type="email" maxLength={254} value={settingsForm.issuer_email} onChange={(event) => setSettingsForm((current) => ({ ...current, issuer_email: event.target.value }))} className={inputClass} /></Field></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Telefone"><input maxLength={60} value={settingsForm.issuer_phone} onChange={(event) => setSettingsForm((current) => ({ ...current, issuer_phone: event.target.value }))} className={inputClass} /></Field><Field label="Endereço"><input maxLength={500} value={settingsForm.issuer_address} onChange={(event) => setSettingsForm((current) => ({ ...current, issuer_address: event.target.value }))} className={inputClass} /></Field></div><p className="rounded-lg border border-amber-300/20 bg-amber-300/[.05] p-3 text-xs leading-5 text-amber-100/80">Documentos comerciais não substituem nota fiscal e não registram pagamentos ou movimentações financeiras.</p>{formError && <p role="alert" className="text-xs text-rose-200">{formError}</p>}<footer className="flex justify-end gap-2 border-t border-white/[.08] pt-4"><button type="button" disabled={busy} onClick={() => setModal(null)} className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5">Cancelar</button><button type="submit" disabled={busy} className="rounded-lg bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-200 disabled:opacity-50">Salvar dados do emissor</button></footer></form>}
    </section></div>}
  </main>
}
