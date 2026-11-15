'use client'

import { FormEvent, PointerEvent, useRef, useState } from 'react'
import useSWR from 'swr'
import { Check, ChevronLeft, ChevronRight, Download, FileSignature, FileUp, Loader2, PenLine, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { SignaturePdfPreview } from '@/components/signature-pdf-preview'

type Signer = { id: string; full_name: string; email: string; status: string; signed_at: string | null; signing_order: number }
type Process = { id: string; title: string; status: string; original_sha256: string; final_sha256: string | null; page_count: number; created_at: string; signed_at: string | null; signed_file_deleted: boolean; signers: Signer[] }
type LibraryDocument = { id: string; title: string; file_name: string; created_at: string }
type Detail = Process & { original_url: string; final_url: string | null; fields: Array<{ page_number: number; x_percent: number; y_percent: number; width_percent: number; height_percent: number }>; events: Array<{ id: string; event_type: string; event_data: Record<string, unknown>; actor_id: string | null; actor_name: string | null; ip_address: string | null; user_agent: string | null; created_at: string }> }
const consentText = 'Declaro que li e concordo com o conteúdo deste documento e confirmo minha assinatura eletrônica.'
const labels: Record<string, string> = { draft: 'Aguardando assinatura', processing: 'Finalizando', signed: 'Assinado', cancelled: 'Cancelado', refused: 'Recusado', expired: 'Expirado', awaiting_signatures: 'Aguardando assinatura', partially_signed: 'Assinatura parcial' }
const eventLabels: Record<string, string> = { uploaded: 'PDF original enviado', prepared: 'Campo de assinatura posicionado', authenticated: 'Sessão de usuário autenticada', signed: 'Signatário confirmou a assinatura', finalized: 'PDF finalizado', cancelled: 'Processo cancelado' }
const fetcher = async (url: string) => { const response = await fetch(url, { cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os processos.'); return data }
const formatDate = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

export function DocumentSignaturesWorkspace({ permissions }: { permissions: string[] }) {
  const { data, error, isLoading, mutate } = useSWR<{ processes: Process[]; libraryDocuments: LibraryDocument[] }>('/api/workspace/signatures', fetcher)
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [selectedDocumentId, setSelectedDocumentId] = useState('')
  const [detail, setDetail] = useState<Detail | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [position, setPosition] = useState({ x_percent: 10, y_percent: 78, width_percent: 42, height_percent: 12 })
  const [suggestedPosition, setSuggestedPosition] = useState<{ page_number: number; x_percent: number; y_percent: number; width_percent: number; height_percent: number } | null>(null)
  const [signerName, setSignerName] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [signaturePng, setSignaturePng] = useState('')
  const [signatureType, setSignatureType] = useState<'drawn' | 'typed' | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [showEvidence, setShowEvidence] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const canUpload = permissions.includes('*') || permissions.includes('documents:signature_upload')
  const canPrepare = permissions.includes('*') || permissions.includes('documents:signature_prepare')
  const canSign = permissions.includes('*') || permissions.includes('documents:signature_sign')
  const canCancel = permissions.includes('*') || permissions.includes('documents:signature_cancel')

  async function createProcess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file && !selectedDocumentId) { setMessage('Escolha um PDF da biblioteca ou envie um arquivo.'); return }
    setBusy(true); setMessage('')
    try {
      const body = new FormData(); body.set('title', title); if (file) body.set('file', file); if (selectedDocumentId) body.set('document_id', selectedDocumentId)
      const response = await fetch('/api/workspace/signatures', { method: 'POST', body })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Não foi possível iniciar a assinatura.')
      setTitle(''); setFile(null); setSelectedDocumentId(''); formRef.current?.reset(); setMessage('Documento enviado com segurança. Revise a posição do campo e assine quando estiver pronto.'); await mutate()
      await openProcess(result.process.id)
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não foi possível iniciar a assinatura.') } finally { setBusy(false) }
  }

  async function openProcess(id: string) {
    setBusy(true); setMessage('')
    try {
      const result = await fetcher(`/api/workspace/signatures/${id}`)
      setDetail(result.process)
      setSuggestedPosition(null)
      const field = result.process.fields?.[0]
      if (field) { setPageNumber(field.page_number); setPosition({ x_percent: Number(field.x_percent), y_percent: Number(field.y_percent), width_percent: Number(field.width_percent), height_percent: Number(field.height_percent) }) }
      setSignerName(result.process.signers?.[0]?.full_name ?? ''); setConfirmed(false); setSignaturePng(''); setSignatureType(null); setShowEvidence(false)
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não foi possível abrir o processo.') } finally { setBusy(false) }
  }

  function draw(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget
    const rect = canvas.getBoundingClientRect()
    const context = canvas.getContext('2d')
    if (!context) return
    const x = (event.clientX - rect.left) * canvas.width / rect.width
    const y = (event.clientY - rect.top) * canvas.height / rect.height
    if (event.type === 'pointerdown') {
      canvas.setPointerCapture(event.pointerId)
      setSignatureType('drawn')
      context.beginPath(); context.moveTo(x, y)
      context.fillStyle = '#162d42'; context.beginPath(); context.arc(x, y, 1.5, 0, Math.PI * 2); context.fill(); context.beginPath(); context.moveTo(x, y)
      return
    }
    if (event.type === 'pointerup' || event.type === 'pointercancel') { setSignaturePng(canvas.toDataURL('image/png')); return }
    if (event.type !== 'pointermove' || event.buttons !== 1) return
    context.strokeStyle = '#162d42'; context.lineWidth = 2.2; context.lineCap = 'round'; context.lineJoin = 'round'
    context.lineTo(x, y); context.stroke(); context.beginPath(); context.moveTo(x, y)
  }

  function clearSignature() { const canvas = canvasRef.current; if (!canvas) return; canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height); setSignaturePng(''); setSignatureType(null) }
  async function useTypedSignature() {
    const canvas = canvasRef.current
    const name = signerName.trim().slice(0, 48)
    if (!canvas || name.length < 2) return
    const context = canvas.getContext('2d')
    if (!context) return
    await document.fonts.load('92px "Great Vibes"')
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#162d42'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    const desiredFontSize = 92
    context.font = `${desiredFontSize}px "Great Vibes", cursive`
    const measuredWidth = context.measureText(name).width || 1
    context.font = `${Math.min(desiredFontSize, desiredFontSize * 590 / measuredWidth)}px "Great Vibes", cursive`
    context.fillText(name, canvas.width / 2, 75, 590)
    context.beginPath()
    context.strokeStyle = '#162d42'
    context.lineWidth = 1.8
    context.lineCap = 'round'
    context.moveTo(58, 112)
    context.bezierCurveTo(180, 151, 380, 106, 518, 126)
    context.bezierCurveTo(546, 130, 557, 121, 574, 117)
    context.stroke()
    setSignaturePng(canvas.toDataURL('image/png'))
    setSignatureType('typed')
  }

  async function savePosition() {
    if (!detail) return
    setBusy(true); setMessage('')
    try {
      const response = await fetch(`/api/workspace/signatures/${detail.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...position, page_number: pageNumber, full_name: signerName.trim() }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Não foi possível salvar a posição.')
      setMessage('Posição do campo salva.'); await openProcess(detail.id)
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não foi possível salvar a posição.') } finally { setBusy(false) }
  }

  async function signDocument() {
    if (!detail || !signaturePng || !signatureType || !confirmed) { setMessage('Desenhe ou digite sua assinatura e confirme a declaração.'); return }
    setBusy(true); setMessage('')
    try {
      const positionResponse = await fetch(`/api/workspace/signatures/${detail.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...position, page_number: pageNumber, full_name: signerName.trim() }) })
      const positionResult = await positionResponse.json()
      if (!positionResponse.ok) throw new Error(positionResult.error || 'Não foi possível salvar a posição.')
      const response = await fetch(`/api/workspace/signatures/${detail.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signature_png: signaturePng, signature_type: signatureType, confirmed, consent_text: consentText }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Não foi possível assinar.')
      setMessage('Assinatura registrada e PDF finalizado.'); await mutate(); await openProcess(detail.id)
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não foi possível assinar o documento.') } finally { setBusy(false) }
  }

  async function cancelProcess(id: string) {
    if (!window.confirm('Cancelar este processo de assinatura?')) return
    setBusy(true); setMessage('')
    try { const response = await fetch(`/api/workspace/signatures/${id}`, { method: 'DELETE' }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Não foi possível cancelar.'); setMessage('Processo cancelado.'); setDetail(null); await mutate() }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não foi possível cancelar.') } finally { setBusy(false) }
  }

  async function deleteSignedFile(process: Process) {
    if (!window.confirm(`Excluir somente o PDF assinado de “${process.title}”? O PDF original e todo o histórico de auditoria serão mantidos.`)) return
    setBusy(true); setMessage('')
    try {
      const response = await fetch(`/api/workspace/signatures/${process.id}`, { method: 'DELETE' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Não foi possível excluir o PDF assinado.')
      setMessage('PDF assinado excluído. O original e o histórico de auditoria foram preservados.')
      if (detail?.id === process.id) setDetail(null)
      await mutate()
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não foi possível excluir o PDF assinado.') } finally { setBusy(false) }
  }

  return <div className="mt-6 space-y-6">
    <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-cyan-300"><FileSignature className="size-3.5" />Fluxo de assinatura eletrônica</div><h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Assinaturas</h1><p className="mt-1 max-w-2xl text-sm text-slate-400">Envie um PDF, posicione o campo, assine com sua conta e mantenha o original, o arquivo final e a trilha de evidências protegidos.</p></div><button type="button" onClick={() => void mutate()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-3 text-sm font-medium text-slate-300 hover:bg-white/5" title="Atualizar processos"><RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />Atualizar</button></header>
    {message && <div role="status" className="rounded-xl border border-cyan-300/20 bg-cyan-300/5 px-4 py-3 text-sm text-cyan-100">{message}</div>}
    {canUpload && <form ref={formRef} onSubmit={createProcess} className="grid gap-4 rounded-2xl border border-white/[.08] bg-[#11161e] p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_auto] md:items-end"><label className="grid min-w-0 gap-2 text-sm text-slate-300">Nome do processo<input value={title} onChange={(event) => setTitle(event.target.value)} minLength={2} maxLength={160} required placeholder="Ex.: Acordo de prestação de serviços" className="h-11 w-full min-w-0 rounded-xl border border-white/10 bg-[#0b0f16] px-3 text-white outline-none focus:border-cyan-300/50" /></label><label className="grid min-w-0 gap-2 text-sm text-slate-300">Usar PDF da biblioteca<select value={selectedDocumentId} onChange={(event) => { const value = event.target.value; setSelectedDocumentId(value); setFile(null); const source = data?.libraryDocuments.find((document) => document.id === value); if (source) setTitle((current) => current || source.title) }} className="h-11 w-full min-w-0 rounded-xl border border-white/10 bg-[#0b0f16] px-3 text-sm text-white"><option value="">Escolher documento existente</option>{(data?.libraryDocuments ?? []).map((document) => <option key={document.id} value={document.id}>{document.title} · {document.file_name}</option>)}</select></label><label className="grid min-w-0 gap-2 text-sm text-slate-300">Ou enviar PDF (máx. 20 MB)<input type="file" accept="application/pdf,.pdf" required={!selectedDocumentId} onChange={(event) => { const nextFile = event.target.files?.[0] ?? null; setFile(nextFile); if (nextFile) setSelectedDocumentId('') }} className="block min-h-11 w-full min-w-0 rounded-xl border border-white/10 bg-[#0b0f16] px-3 py-2 text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-300/10 file:px-3 file:py-2 file:text-cyan-100" /></label><button disabled={busy} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 text-sm font-semibold text-[#071016] hover:bg-cyan-200 disabled:opacity-60">{busy ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}Enviar PDF</button></form>}
    {error && <p role="alert" className="rounded-xl border border-rose-300/20 bg-rose-300/5 px-4 py-3 text-sm text-rose-100">{error.message}</p>}
    <section aria-label="Processos de assinatura" className="grid gap-3">{(data?.processes ?? []).map((process) => <article key={process.id} className="flex flex-col gap-4 rounded-2xl border border-white/[.08] bg-[#11161e] p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-base font-semibold text-white">{process.title}</h2><span className={`rounded-full border px-2.5 py-1 text-xs ${process.status === 'signed' ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200' : 'border-amber-300/20 bg-amber-300/10 text-amber-100'}`}>{labels[process.status] ?? process.status}</span></div><p className="mt-2 text-xs text-slate-500">{process.page_count} {process.page_count === 1 ? 'página' : 'páginas'} · Criado em {formatDate(process.created_at)} · SHA-256 {process.original_sha256.slice(0, 12)}…</p><p className="mt-1 text-xs text-slate-400">{process.signers.map((signer) => `${signer.full_name} — ${signer.status === 'signed' ? 'assinado' : 'pendente'}`).join(' · ')}</p></div><div className="flex shrink-0 flex-wrap items-center gap-2"><button type="button" onClick={() => void openProcess(process.id)} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5">{process.status === 'draft' ? <PenLine className="size-4" /> : <ShieldCheck className="size-4" />}{process.status === 'draft' ? 'Abrir e assinar' : 'Ver evidências'}</button>{canCancel && process.status === 'draft' && <button type="button" onClick={() => void cancelProcess(process.id)} aria-label={`Cancelar ${process.title}`} className="grid size-10 place-items-center rounded-lg border border-white/10 text-slate-400 hover:border-rose-300/30 hover:text-rose-200"><Trash2 className="size-4" /></button>}{canCancel && process.status === 'signed' && !process.signed_file_deleted && <button type="button" onClick={() => void deleteSignedFile(process)} aria-label={`Excluir somente o PDF assinado de ${process.title}`} title="Excluir somente o PDF assinado; manter original e histórico" className="grid size-10 place-items-center rounded-lg border border-white/10 text-slate-400 hover:border-rose-300/30 hover:text-rose-200"><Trash2 className="size-4" /></button>}</div></article>)}{!isLoading && !error && !data?.processes?.length && <div className="rounded-2xl border border-dashed border-white/10 px-5 py-12 text-center"><FileSignature className="mx-auto size-8 text-slate-500" /><h2 className="mt-3 text-sm font-semibold text-white">Nenhum processo de assinatura</h2><p className="mt-1 text-sm text-slate-400">Envie um PDF para iniciar um processo interno.</p></div>}</section>
    {detail && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/85 p-3 backdrop-blur-sm sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDetail(null) }}><section role="dialog" aria-modal="true" aria-labelledby="signature-detail-title" className="my-auto flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d1220] shadow-2xl"><header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6"><div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[.18em] text-cyan-300">Processo de assinatura</p><h2 id="signature-detail-title" className="mt-1 truncate text-base font-semibold text-white">{detail.title}</h2></div><button type="button" onClick={() => setDetail(null)} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300">Fechar</button></header>
      <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,.7fr)]"><div className="min-h-[420px] border-b border-white/10 bg-[#111722] lg:min-h-[620px] lg:border-b-0 lg:border-r"><div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3"><span className="text-xs text-slate-400">{detail.status === 'signed' && detail.final_url ? 'PDF assinado' : 'PDF original'} · Página {pageNumber} de {detail.page_count}</span><div className="flex items-center gap-2"><button type="button" disabled={pageNumber <= 1} onClick={() => setPageNumber((page) => Math.max(1, page - 1))} className="grid size-8 place-items-center rounded-lg border border-white/10 text-slate-300 disabled:opacity-40" aria-label="Página anterior"><ChevronLeft className="size-4" /></button><button type="button" disabled={pageNumber >= detail.page_count} onClick={() => setPageNumber((page) => Math.min(detail.page_count, page + 1))} className="grid size-8 place-items-center rounded-lg border border-white/10 text-slate-300 disabled:opacity-40" aria-label="Próxima página"><ChevronRight className="size-4" /></button><a href={detail.status === 'signed' && detail.final_url ? detail.final_url : detail.original_url} target="_blank" rel="noreferrer" className="grid size-8 place-items-center rounded-lg border border-white/10 text-slate-300" aria-label="Abrir PDF em outra aba"><Download className="size-4" /></a></div></div><div className="px-3 py-4"><SignaturePdfPreview url={detail.status === 'signed' && detail.final_url ? detail.final_url : detail.original_url} pageNumber={pageNumber} position={position} suggestion={suggestedPosition} signaturePreview={detail.status === 'draft' ? signaturePng : ''} canMove={detail.status === 'draft' && canPrepare} onPositionChange={setPosition} onSuggestion={setSuggestedPosition} /></div></div>
        <div className="flex flex-col gap-5 p-4 sm:p-5">{detail.status === 'draft' && canPrepare && <section className="grid gap-3"><div><h3 className="text-sm font-semibold text-white">Campo de assinatura</h3><p className="mt-1 text-xs leading-5 text-slate-400">A sugestão é calculada pelos espaços livres da página. Arraste o campo diretamente no documento ou use as setas do teclado para ajustar.</p></div><div className="grid grid-cols-2 gap-3">{(['x_percent', 'y_percent', 'width_percent', 'height_percent'] as const).map((key) => <label key={key} className="grid gap-1.5 text-xs text-slate-400">{{ x_percent: 'Posição X (%)', y_percent: 'Posição Y (%)', width_percent: 'Largura (%)', height_percent: 'Altura (%)' }[key]}<input type="number" min={0} max={100} step={1} value={position[key]} onChange={(event) => setPosition((current) => ({ ...current, [key]: Number(event.target.value) }))} className="h-10 rounded-lg border border-white/10 bg-[#080c12] px-3 text-sm text-white" /></label>)}</div><p className="text-xs text-slate-400">Tamanho atual do campo: {position.width_percent}% da largura × {position.height_percent}% da altura da página. A assinatura aparece na prévia do PDF ao gerar ou desenhar.</p>{suggestedPosition?.page_number === pageNumber && <div role="status" className="grid gap-2 rounded-lg border border-violet-300/20 bg-violet-300/5 p-3"><p className="text-xs leading-5 text-violet-100">Sugestão automática com base nos espaços livres desta página. A área violeta aparece sobre o documento.</p><button type="button" onClick={() => setPosition({ x_percent: suggestedPosition.x_percent, y_percent: suggestedPosition.y_percent, width_percent: suggestedPosition.width_percent, height_percent: suggestedPosition.height_percent })} className="rounded-lg border border-violet-300/30 px-3 py-2 text-xs font-medium text-violet-100 hover:bg-violet-300/10">Usar posição sugerida</button></div>}<button type="button" onClick={() => void savePosition()} disabled={busy || !canPrepare} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 disabled:opacity-50">Salvar posição na página {pageNumber}</button></section>}
        {detail.status === 'draft' && canSign ? <section className="grid gap-3 border-t border-white/10 pt-4"><div><h3 className="text-sm font-semibold text-white">Sua assinatura</h3><p className="mt-1 text-xs leading-5 text-slate-400">Desenhe no campo ou gere uma representação visual com seu nome.</p></div><label className="grid gap-1.5 text-xs text-slate-400">Nome que aparecerá na assinatura<input value={signerName} onChange={(event) => { setSignerName(event.target.value); if (signatureType === 'typed') { setSignaturePng(''); setSignatureType(null); const canvas = canvasRef.current; if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height) } }} minLength={2} maxLength={160} required className="h-10 rounded-lg border border-white/10 bg-[#080c12] px-3 text-sm text-white outline-none focus:border-cyan-300/50" /></label><canvas ref={canvasRef} width={640} height={160} onPointerDown={draw} onPointerMove={draw} onPointerUp={draw} onPointerCancel={draw} aria-label="Campo para desenhar a assinatura" className="h-28 w-full touch-none rounded-lg border border-dashed border-white/20 bg-white" /><div className="flex flex-wrap gap-2"><button type="button" onClick={useTypedSignature} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200">Usar nome digitado</button><button type="button" onClick={clearSignature} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300">Limpar assinatura</button></div><label className="flex items-start gap-2 text-xs leading-5 text-slate-300"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 accent-cyan-300" /><span>{consentText}</span></label><button type="button" onClick={() => void signDocument()} disabled={busy || !confirmed || !signaturePng || !signatureType} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-[#071016] disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}Confirmar e assinar</button></section> : null}
        {detail.status === 'signed' && <section className="grid gap-3 rounded-xl border border-emerald-300/20 bg-emerald-300/[.06] p-4"><h3 className="text-sm font-semibold text-emerald-100">Documento assinado</h3><p className="text-xs text-slate-300">Data: {detail.signed_at ? formatDate(detail.signed_at) : '—'}</p>{detail.signed_file_deleted && <p className="rounded-lg border border-amber-300/20 bg-amber-300/5 p-3 text-xs text-amber-100">O PDF assinado foi excluído. O PDF original e o histórico de auditoria foram preservados.</p>}<p className="break-all text-[11px] leading-5 text-slate-400">SHA-256 original: {detail.original_sha256}<br />SHA-256 final: {detail.final_sha256}</p>{detail.final_url && <><a href={detail.final_url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-300/20 px-3 py-2 text-sm text-emerald-100"><Download className="size-4" />Baixar PDF assinado</a><a href={`/api/workspace/signatures/${detail.id}/package`} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200"><Download className="size-4" />Baixar pacote de evidências</a></>}</section>}
        <section className="grid gap-3 border-t border-white/10 pt-4"><button type="button" onClick={() => setShowEvidence((value) => !value)} className="text-left text-sm font-semibold text-white">Trilha de auditoria <span className="ml-1 text-xs font-normal text-slate-400">{showEvidence ? 'Ocultar' : 'Exibir'}</span></button>{showEvidence && <ol className="grid gap-3">{detail.events.map((event) => <li key={event.id} className="border-l border-cyan-300/30 pl-3"><p className="text-xs font-medium text-slate-200">{event.event_data.action === 'signed_file_deleted' ? 'PDF assinado removido; evidências preservadas' : eventLabels[event.event_type] ?? event.event_type}</p><time className="mt-1 block text-[11px] text-slate-500">{formatDate(event.created_at)}</time><p className="mt-1 break-words text-[10px] text-slate-500">{event.actor_name || event.actor_id || 'Sistema'}{event.ip_address ? ` · IP ${event.ip_address}` : ''}</p><p className="mt-1 break-all text-[10px] text-slate-500">{JSON.stringify(event.event_data)}{event.user_agent ? ` · ${event.user_agent}` : ''}</p></li>)}</ol>}</section></div></div></section></div>}
  </div>
}
