'use client'

import { X } from 'lucide-react'

type DocumentLine = { description: string; quantity: number; unit_price_cents: number }
type PreviewDocument = {
  document_type: string
  status: string
  title: string
  description: string | null
  line_items: DocumentLine[]
  subtotal_cents: number
  discount_cents: number
  total_cents: number
  due_date: string | null
  notes: string | null
  document_number: string | null
  created_at: string
}
type Issuer = { issuer_name: string; issuer_tax_id: string; issuer_email: string; issuer_phone: string; issuer_address: string; issuer_primary_color?: string; issuer_secondary_color?: string } | null

const labels: Record<string, string> = { receipt: 'Recibo', quote: 'Orçamento', billing_notice: 'Cobrança', service_order: 'Ordem de serviço' }
const statuses: Record<string, string> = { draft: 'Rascunho', review: 'Em revisão', issued: 'Emitido', cancelled: 'Cancelado' }
const money = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
const date = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(value))

export function CommercialDocumentPreview({ document, issuer, clientName, projectName, onClose }: {
  document: PreviewDocument
  issuer: Issuer
  clientName: string
  projectName?: string
  onClose: () => void
}) {
  const primaryColor = /^#[0-9A-F]{6}$/i.test(issuer?.issuer_primary_color ?? '') ? issuer!.issuer_primary_color! : '#17324D'
  const secondaryColor = /^#[0-9A-F]{6}$/i.test(issuer?.issuer_secondary_color ?? '') ? issuer!.issuer_secondary_color! : '#0F766E'

  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-3 backdrop-blur-sm sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby="commercial-preview-title" className="my-auto flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-indigo-300/25 bg-[#0d1220] shadow-2xl shadow-black/40">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-4 py-3 sm:px-6">
        <div><p className="text-[11px] font-semibold uppercase tracking-[.18em] text-indigo-200">Prévia do documento</p><h2 id="commercial-preview-title" className="mt-0.5 text-sm font-semibold text-white">{document.title}</h2></div>
        <button type="button" onClick={onClose} aria-label="Fechar prévia" className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 text-slate-300 transition hover:bg-white/5"><X className="size-4" /></button>
      </header>
      <div className="overflow-y-auto bg-[#101522] p-3 sm:p-7">
        <article className="relative mx-auto w-full max-w-[720px] overflow-hidden rounded-[3px] border-2 bg-white text-slate-800 shadow-2xl shadow-black/35 sm:min-h-[820px]" style={{ borderColor: primaryColor, '--issuer-primary': primaryColor, '--issuer-secondary': secondaryColor } as import('react').CSSProperties}>
          <div className="pointer-events-none absolute inset-[7px] border" style={{ borderColor: `${primaryColor}35` }} />
          <div className="relative h-2" style={{ background: `linear-gradient(90deg, ${primaryColor}, ${secondaryColor})` }} />
          <div className="relative p-7 sm:p-11">
            <header className="flex flex-wrap items-start justify-between gap-5 border-b-2 pb-6" style={{ borderColor: `${primaryColor}35` }}>
              <div className="flex min-w-0 items-center gap-4">
                <div className="grid size-[92px] shrink-0 place-items-center rounded-xl bg-[#10172b] p-2"><img src="/codexa-logo.png" alt="Codexa" className="max-h-full max-w-full object-contain" /></div>
                <div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[var(--issuer-primary)]">{issuer?.issuer_name || 'Codexa'}</p><p className="mt-1 max-w-[250px] text-xs leading-5 text-slate-500">{[issuer?.issuer_tax_id, issuer?.issuer_email, issuer?.issuer_phone, issuer?.issuer_address].filter(Boolean).join(' · ') || 'Dados do emissor serão exibidos neste documento'}</p></div>
              </div>
              <div className="text-left sm:text-right"><span className="inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold" style={{ color: primaryColor, borderColor: `${primaryColor}40`, backgroundColor: `${primaryColor}12` }}>{statuses[document.status] ?? document.status}</span><p className="mt-3 text-xs font-medium uppercase tracking-wider text-slate-400">{labels[document.document_type] ?? 'Documento comercial'}</p><p className="mt-1 text-xs text-slate-500">{document.document_number || 'Número após emissão'}</p><p className="mt-1 text-xs text-slate-500">{date(document.created_at)}</p></div>
            </header>
            <section className="mt-7 border-l-[3px] border-[var(--issuer-primary)] pl-4"><h3 className="text-xl font-semibold tracking-tight text-[var(--issuer-primary)] sm:text-2xl">{document.title}</h3>{document.description && <p className="mt-2 text-sm leading-6 text-slate-600">{document.description}</p>}</section>
            <section className="mt-7 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[var(--issuer-primary)]">Destinatário</p><p className="mt-2 text-sm font-semibold text-slate-800">{clientName || 'Cliente não informado'}</p></div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[var(--issuer-primary)]">Projeto</p><p className="mt-2 text-sm font-semibold text-slate-800">{projectName || 'Sem projeto vinculado'}</p></div>
            </section>
            <section className="mt-7 overflow-hidden rounded-lg border border-slate-200">
              <div className="grid grid-cols-[minmax(0,1fr)_48px_100px_100px] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-3 text-[9px] font-bold uppercase tracking-wider text-slate-500 sm:grid-cols-[minmax(0,1fr)_64px_120px_120px] sm:px-4"><span>Descrição</span><span className="text-right">Qtd.</span><span className="text-right">Unitário</span><span className="text-right">Total</span></div>
              {document.line_items.map((item, index) => <div key={`${item.description}-${index}`} className="grid grid-cols-[minmax(0,1fr)_48px_100px_100px] gap-2 border-b border-slate-100 px-3 py-3 text-[11px] last:border-b-0 sm:grid-cols-[minmax(0,1fr)_64px_120px_120px] sm:px-4 sm:text-xs"><span className="break-words font-medium text-slate-700">{item.description}</span><span className="text-right text-slate-600">{item.quantity}</span><span className="text-right text-slate-600">{money(item.unit_price_cents)}</span><span className="text-right font-medium text-slate-800">{money(item.unit_price_cents * item.quantity)}</span></div>)}
              {document.line_items.length === 0 && <p className="px-4 py-7 text-center text-xs text-slate-400">Nenhum item adicionado.</p>}
            </section>
            <section className="ml-auto mt-5 max-w-sm rounded-lg border p-4" style={{ borderColor: `${primaryColor}30`, backgroundColor: `${primaryColor}0D` }}>
              <div className="flex justify-between gap-6 text-xs text-slate-600"><span>Subtotal</span><span>{money(document.subtotal_cents)}</span></div>
              <div className="mt-2 flex justify-between gap-6 text-xs text-slate-600"><span>Desconto</span><span>− {money(document.discount_cents)}</span></div>
              <div className="mt-3 flex justify-between gap-6 border-t pt-3 text-sm font-bold text-slate-900" style={{ borderColor: `${secondaryColor}60` }}><span>Total</span><span style={{ color: secondaryColor }}>{money(document.total_cents)}</span></div>
            </section>
            {(document.due_date || document.notes) && <section className="mt-6 grid gap-3 border-t border-slate-200 pt-5 sm:grid-cols-2">{document.due_date && <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Vencimento</p><p className="mt-1 text-xs font-medium text-slate-700">{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${document.due_date}T12:00:00Z`))}</p></div>}{document.notes && <div className="sm:col-span-2"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Observações</p><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-700">{document.notes}</p></div>}</section>}
            <footer className="mt-10 flex flex-col justify-between gap-2 border-t border-slate-200 pt-4 text-[10px] text-slate-400 sm:flex-row"><span>Documento comercial não fiscal</span><span>Gerado pela Central de Documentos Codexa</span></footer>
          </div>
        </article>
      </div>
      <footer className="shrink-0 border-t border-white/10 px-4 py-3 text-xs text-slate-400 sm:px-6">Prévia para conferência — o documento só recebe numeração oficial depois da emissão.</footer>
    </section>
  </div>
}
