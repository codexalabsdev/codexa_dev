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
const liftBrandColor = (hex: string) => `#${(hex.match(/[A-Fa-f0-9]{2}/g) ?? []).map((channel) => Math.round(Number.parseInt(channel, 16) + (255 - Number.parseInt(channel, 16)) * 0.58).toString(16).padStart(2, '0')).join('')}`
const contrastTextColor = (hex: string) => {
  const luminance = (value: string) => (value.match(/[A-Fa-f0-9]{2}/g) ?? []).map((channel) => Number.parseInt(channel, 16) / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
  const backgroundLuminance = luminance(hex)
  const whiteContrast = 1.05 / (backgroundLuminance + 0.05)
  const darkContrast = (backgroundLuminance + 0.05) / (luminance('#172033') + 0.05)
  return whiteContrast >= darkContrast ? '#FFFFFF' : '#172033'
}

export function CommercialDocumentPreview({ document, issuer, clientName, projectName, onClose }: {
  document: PreviewDocument
  issuer: Issuer
  clientName: string
  projectName?: string
  onClose: () => void
}) {
  const primaryColor = /^#[0-9A-F]{6}$/i.test(issuer?.issuer_primary_color ?? '') ? issuer!.issuer_primary_color! : '#17324D'
  const secondaryColor = /^#[0-9A-F]{6}$/i.test(issuer?.issuer_secondary_color ?? '') ? issuer!.issuer_secondary_color! : '#0F766E'
  const primaryTextColor = contrastTextColor(primaryColor)
  const primaryUiColor = liftBrandColor(primaryColor)

  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-3 backdrop-blur-sm sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby="commercial-preview-title" className="my-auto flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border bg-[#0d1220] shadow-2xl shadow-black/40" style={{ borderColor: `${primaryColor}66` }}>
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-4 py-3 sm:px-6">
        <div><p className="text-[11px] font-semibold uppercase tracking-[.18em]" style={{ color: primaryUiColor }}>Prévia do documento</p><h2 id="commercial-preview-title" className="mt-0.5 text-sm font-semibold text-white">{document.title}</h2></div>
        <button type="button" onClick={onClose} aria-label="Fechar prévia" className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 text-slate-300 transition hover:bg-white/5"><X className="size-4" /></button>
      </header>
      <div className="overflow-y-auto bg-[#101522] p-3 sm:p-8">
        <article className="relative mx-auto w-full max-w-[720px] overflow-hidden rounded-[3px] border-2 bg-white text-[var(--issuer-primary)] shadow-2xl shadow-black/35 sm:min-h-[820px]" style={{ borderColor: primaryColor, '--issuer-primary': primaryColor, '--issuer-secondary': secondaryColor } as import('react').CSSProperties}>
          <div className="pointer-events-none absolute inset-[7px] border" style={{ borderColor: primaryColor }} />
          <div className="relative h-2" style={{ background: `linear-gradient(90deg, ${primaryColor}, ${secondaryColor})` }} />
          <div className="relative p-7 sm:p-11">
            <header className="flex flex-wrap items-start justify-between gap-5 border-b-2 pb-6" style={{ borderColor: primaryColor }}>
              <div className="flex min-w-0 items-center gap-4">
                <div className="grid size-[104px] shrink-0 place-items-center rounded-xl border p-2.5" style={{ borderColor: `${secondaryColor}88`, backgroundColor: '#080B10' }}><img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Logotipo_futurista_CODEXA_em_neon__1_-removebg-preview-dAgeswjimSLf0J7eFIogrynbTr4DX2.png" alt="Logotipo CODEXA em azul e violeta neon" className="max-h-full max-w-full object-contain" /></div>
                <div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-[var(--issuer-primary)]">{issuer?.issuer_name || 'Codexa'}</p><p className="mt-1 max-w-[250px] text-xs leading-5 text-[var(--issuer-secondary)]">{[issuer?.issuer_tax_id, issuer?.issuer_email, issuer?.issuer_phone, issuer?.issuer_address].filter(Boolean).join(' · ') || 'Dados do emissor serão exibidos neste documento'}</p></div>
              </div>
              <div className="text-left sm:text-right"><span className="inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold" style={{ color: primaryTextColor, borderColor: primaryColor, backgroundColor: primaryColor }}>{statuses[document.status] ?? document.status}</span><p className="mt-3 text-xs font-medium uppercase tracking-wider text-[var(--issuer-secondary)]">{labels[document.document_type] ?? 'Documento comercial'}</p><p className="mt-1 text-xs text-[var(--issuer-secondary)]">{document.document_number || 'Número após emissão'}</p><p className="mt-1 text-xs text-[var(--issuer-secondary)]">{date(document.created_at)}</p></div>
            </header>
            <section className="mt-7 border-l-[3px] border-[var(--issuer-primary)] pl-4"><h3 className="text-xl font-semibold tracking-tight text-[var(--issuer-primary)] sm:text-2xl">{document.title}</h3>{document.description && <p className="mt-2 text-sm leading-6 text-[var(--issuer-primary)]">{document.description}</p>}</section>
            <section className="mt-7 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border bg-white p-4" style={{ borderColor: `${secondaryColor}66` }}><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[var(--issuer-primary)]">Destinatário</p><p className="mt-2 text-sm font-semibold text-[var(--issuer-primary)]">{clientName || 'Cliente não informado'}</p></div>
              <div className="rounded-lg border bg-white p-4" style={{ borderColor: `${secondaryColor}66` }}><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[var(--issuer-primary)]">Projeto</p><p className="mt-2 text-sm font-semibold text-[var(--issuer-primary)]">{projectName || 'Sem projeto vinculado'}</p></div>
            </section>
            <section className="mt-7 overflow-hidden rounded-lg border border-[var(--issuer-primary)]">
              <div className="grid grid-cols-[minmax(0,1fr)_48px_100px_100px] gap-2 border-b border-[var(--issuer-primary)] bg-[var(--issuer-primary)] px-3 py-3 text-[9px] font-bold uppercase tracking-wider text-white sm:grid-cols-[minmax(0,1fr)_64px_120px_120px] sm:px-4"><span>Descrição</span><span className="text-right">Qtd.</span><span className="text-right">Unitário</span><span className="text-right">Total</span></div>
              {document.line_items.map((item, index) => <div key={`${item.description}-${index}`} className="grid grid-cols-[minmax(0,1fr)_42px_84px_84px] gap-1.5 border-b px-3 py-3 text-[10px] last:border-b-0 sm:grid-cols-[minmax(0,1fr)_58px_112px_112px] sm:gap-3 sm:px-4 sm:text-xs" style={{ borderColor: `${secondaryColor}44`, backgroundColor: index % 2 ? '#F8FAFC' : '#FFFFFF' }}><span className="break-words font-medium text-[var(--issuer-primary)]">{item.description}</span><span className="text-right tabular-nums text-[var(--issuer-primary)]">{item.quantity}</span><span className="text-right tabular-nums text-[var(--issuer-primary)]">{money(item.unit_price_cents)}</span><span className="text-right font-semibold tabular-nums text-[var(--issuer-primary)]">{money(item.unit_price_cents * item.quantity)}</span></div>)}
              {document.line_items.length === 0 && <p className="px-4 py-7 text-center text-xs text-[var(--issuer-secondary)]">Nenhum item adicionado.</p>}
            </section>
            <section className="ml-auto mt-6 w-full max-w-sm rounded-lg border bg-white p-5" style={{ borderColor: `${secondaryColor}80` }}>
              <div className="flex justify-between gap-6 text-xs text-[var(--issuer-primary)]"><span>Subtotal</span><span>{money(document.subtotal_cents)}</span></div>
              <div className="mt-2 flex justify-between gap-6 text-xs text-[var(--issuer-primary)]"><span>Desconto</span><span>− {money(document.discount_cents)}</span></div>
              <div className="mt-3 flex justify-between gap-6 border-t pt-3 text-sm font-bold text-[var(--issuer-primary)]" style={{ borderColor: secondaryColor }}><span>Total</span><span className="text-[var(--issuer-secondary)] tabular-nums">{money(document.total_cents)}</span></div>
            </section>
            {(document.due_date || document.notes) && <section className="mt-6 grid gap-3 border-t border-[var(--issuer-primary)] pt-5 sm:grid-cols-2">{document.due_date && <div><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--issuer-secondary)]">Vencimento</p><p className="mt-1 text-xs font-medium text-[var(--issuer-primary)]">{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${document.due_date}T12:00:00Z`))}</p></div>}{document.notes && <div className="sm:col-span-2"><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--issuer-secondary)]">Observações</p><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[var(--issuer-primary)]">{document.notes}</p></div>}</section>}
            <footer className="mt-10 flex flex-col justify-between gap-2 border-t border-[var(--issuer-primary)] pt-4 text-[10px] text-[var(--issuer-secondary)] sm:flex-row"><span>Documento comercial não fiscal</span><span>Gerado pela Central de Documentos Codexa</span></footer>
          </div>
        </article>
      </div>
      <footer className="shrink-0 border-t border-white/10 px-4 py-3 text-xs text-slate-400 sm:px-6">Prévia para conferência — o documento só recebe numeração oficial depois da emissão.</footer>
    </section>
  </div>
}
