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
  issued_at?: string | null
}
type Issuer = { issuer_name: string; issuer_tax_id: string; issuer_email: string; issuer_phone: string; issuer_address: string; issuer_primary_color?: string; issuer_secondary_color?: string } | null

const labels: Record<string, string> = { receipt: 'Recibo', quote: 'Orçamento', billing_notice: 'Nota de cobrança', service_order: 'Ordem de serviço' }
const statuses: Record<string, string> = { draft: 'Rascunho', review: 'Em revisão', issued: 'Emitido', cancelled: 'Cancelado' }
const money = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
const date = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(value))
const liftBrandColor = (hex: string) => `#${(hex.match(/[A-Fa-f0-9]{2}/g) ?? []).map((channel) => Math.round(Number.parseInt(channel, 16) + (255 - Number.parseInt(channel, 16)) * 0.58).toString(16).padStart(2, '0')).join('')}`
const contrastTextColor = (hex: string) => {
  const luminance = (value: string) => (value.match(/[A-Fa-f0-9]{2}/g) ?? []).map((channel) => Number.parseInt(channel, 16) / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
  const backgroundLuminance = luminance(hex)
  return 1.05 / (backgroundLuminance + 0.05) >= (backgroundLuminance + 0.05) / (luminance('#172033') + 0.05) ? '#FFFFFF' : '#172033'
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
  const isReceipt = document.document_type === 'receipt'
  const isQuote = document.document_type === 'quote'
  const isBilling = document.document_type === 'billing_notice'
  const isServiceOrder = document.document_type === 'service_order'
  const title = isReceipt ? 'RECIBO' : isQuote ? 'ORÇAMENTO' : isBilling ? 'NOTA DE COBRANÇA' : 'ORDEM DE SERVIÇO'
  const issuedDate = date(document.issued_at || document.created_at)

  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-3 backdrop-blur-sm sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby="commercial-preview-title" className="my-auto flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border bg-[#0d1220] shadow-2xl shadow-black/40" style={{ borderColor: `${primaryColor}66` }}>
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-4 py-3 sm:px-6"><div><p className="text-[11px] font-semibold uppercase tracking-[.18em]" style={{ color: primaryUiColor }}>Prévia do documento</p><h2 id="commercial-preview-title" className="mt-0.5 text-sm font-semibold text-white">{document.title}</h2></div><button type="button" onClick={onClose} aria-label="Fechar prévia" className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 text-slate-300 transition hover:bg-white/5"><X className="size-4" /></button></header>
      <div className="overflow-y-auto bg-[#101522] p-3 sm:p-8">
        <article className="mx-auto min-h-[820px] w-full max-w-[720px] overflow-hidden border-2 bg-white text-slate-900 shadow-2xl shadow-black/35" style={{ borderColor: primaryColor }}>
          <div className="h-2" style={{ background: `linear-gradient(90deg, ${primaryColor}, ${secondaryColor})` }} />
          <div className="p-7 sm:p-11">
            <header className={`flex flex-wrap items-center justify-between gap-5 ${isReceipt ? 'rounded-lg border-2 p-4' : 'border-b-2 pb-5'}`} style={{ borderColor: primaryColor }}>
              <div className="flex min-w-0 items-center gap-4"><img src="/codexa-logo.png" alt="Codexa" className="h-14 w-28 object-contain" /><div className="min-w-0"><p className="text-sm font-bold" style={{ color: primaryColor }}>{issuer?.issuer_name || 'Codexa'}</p><p className="mt-1 max-w-[300px] text-[10px] leading-4 text-slate-600">{[issuer?.issuer_tax_id, issuer?.issuer_email, issuer?.issuer_phone, issuer?.issuer_address].filter(Boolean).join(' · ') || 'Dados do emissor'}</p></div></div>
              <div className="text-right"><h3 className="text-lg font-extrabold tracking-tight sm:text-xl" style={{ color: primaryColor }}>{title}</h3><p className="mt-1 text-xs font-semibold">{document.document_number || 'Número após emissão'}</p><p className="mt-1 text-[10px] text-slate-500">Emissão: {issuedDate}</p><span className="mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={{ color: primaryColor, borderColor: `${primaryColor}55`, backgroundColor: `${primaryColor}0D` }}>{statuses[document.status] ?? document.status}</span></div>
            </header>

            {isReceipt && <>
              <section className="mt-8 rounded-lg border p-5" style={{ borderColor: `${secondaryColor}88` }}><p className="text-xs leading-6">Registro documental referente ao pagamento informado por <strong>{clientName || 'cliente não informado'}</strong> em favor de <span className="font-semibold">{issuer?.issuer_name || 'Codexa'}</span>:</p><h4 className="mt-4 text-2xl font-bold tabular-nums" style={{ color: primaryColor }}>{money(document.total_cents)}</h4><p className="mt-1 text-sm font-semibold">{document.title}</p>{document.description && <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{document.description}</p>}<p className="mt-5 text-[10px] text-slate-600">Referência: {projectName || 'não vinculada a projeto'} · Data do registro: {issuedDate}</p></section>
              <LineItems document={document} color={primaryColor} />
              <div className="mt-12 grid grid-cols-2 gap-8 text-center text-[10px] text-slate-600"><div className="border-t pt-2" style={{ borderColor: secondaryColor }}>{issuer?.issuer_name || 'Codexa'}<br />Responsável pelo recebimento</div><div className="border-t pt-2" style={{ borderColor: secondaryColor }}>{clientName || 'Pagador'}<br />Pagador</div></div>
              <p className="mt-5 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[10px] text-amber-900">Este documento registra informações de pagamento, mas não altera o financeiro nem confirma a baixa do pagamento no sistema.</p>
            </>}

            {isQuote && <>
              <section className="mt-7 grid grid-cols-2 gap-3"><Info label="CLIENTE" value={clientName || 'Não informado'} color={primaryColor} /><Info label="PROJETO" value={projectName || 'Sem projeto vinculado'} color={primaryColor} /><Info label="DATA DA PROPOSTA" value={issuedDate} color={primaryColor} /><Info label="VALIDADE" value={document.due_date ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${document.due_date}T12:00:00Z`)) : 'Não informada'} color={primaryColor} /></section>
              {document.description && <section className="mt-6"><h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: secondaryColor }}>Proposta comercial</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{document.description}</p></section>}
              <LineItems document={document} color={primaryColor} showTotals />
              {document.notes && <Note label="CONDIÇÕES E OBSERVAÇÕES COMERCIAIS" text={document.notes} color={primaryColor} />}
              <div className="mt-12 grid grid-cols-2 gap-8 text-center text-[10px] text-slate-600"><div className="border-t pt-2" style={{ borderColor: primaryColor }}>Codexa · Proponente</div><div className="border-t pt-2" style={{ borderColor: primaryColor }}>Aceite do cliente · Data e assinatura</div></div>
            </>}

            {isBilling && <>
              <section className="mt-7 rounded-lg border p-5" style={{ borderColor: `${primaryColor}55`, backgroundColor: `${primaryColor}07` }}><p className="text-[10px] font-bold uppercase tracking-[.16em]" style={{ color: secondaryColor }}>Responsável pelo pagamento</p><h4 className="mt-2 text-base font-bold" style={{ color: primaryColor }}>{clientName || 'Cliente não informado'}</h4><p className="mt-4 text-xs font-semibold">Origem da cobrança</p><p className="mt-1 text-sm">{document.title}</p>{projectName && <p className="mt-1 text-xs text-slate-600">Projeto: {projectName}</p>}{document.description && <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-600">{document.description}</p>}</section>
              <LineItems document={document} color={primaryColor} showTotals />
              <div className="mt-6 rounded-lg p-5 text-white" style={{ backgroundColor: primaryColor }}><p className="text-[10px] font-bold uppercase tracking-wider">Valor total devido</p><p className="mt-1 text-3xl font-bold tabular-nums">{money(document.total_cents)}</p><p className="mt-3 text-xs">Vencimento: {document.due_date ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${document.due_date}T12:00:00Z`)) : 'Não informado'}</p></div>
              {document.notes && <Note label="INSTRUÇÕES DE PAGAMENTO" text={document.notes} color={primaryColor} />}
              <p className="mt-6 border-t pt-4 text-[10px] font-semibold" style={{ borderColor: primaryColor, color: secondaryColor }}>Documento comercial de cobrança — não é nota fiscal e não representa confirmação de pagamento.</p>
            </>}

            {isServiceOrder && <>
              <section className="mt-7 grid grid-cols-2 gap-0 overflow-hidden border" style={{ borderColor: primaryColor }}><Band color={primaryColor}>SOLICITANTE</Band><Band color={primaryColor}>PROJETO / CONTRATO</Band><Cell>{clientName || 'Cliente não informado'}</Cell><Cell>{projectName || 'Não vinculado'}</Cell><Band color={primaryColor}>ABERTURA</Band><Band color={primaryColor}>SITUAÇÃO</Band><Cell>{issuedDate}</Cell><Cell>{statuses[document.status] ?? document.status}</Cell></section>
              <OperationSection title="SOLICITAÇÃO / DIAGNÓSTICO" text={document.description || document.title} color={primaryColor} />
              <section className="mt-5"><h4 className="border-b px-3 py-2 text-xs font-bold uppercase tracking-wider text-white" style={{ backgroundColor: primaryColor }}>ATIVIDADES / RECURSOS PREVISTOS</h4>{document.line_items.map((item, index) => <div key={`${item.description}-${index}`} className="flex gap-3 border-x border-b px-3 py-3 text-xs" style={{ borderColor: `${primaryColor}55` }}><span className="font-bold" style={{ color: secondaryColor }}>{String(index + 1).padStart(2, '0')}</span><span className="flex-1">{item.description}</span><span className="text-slate-500">Qtd. {item.quantity}</span></div>)}</section>
              {document.notes && <OperationSection title="OBSERVAÇÕES TÉCNICAS / CONDIÇÕES" text={document.notes} color={primaryColor} />}
              <div className="mt-7 grid grid-cols-2 gap-3 text-xs"><Info label="TOTAL ESTIMADO" value={money(document.total_cents)} color={primaryColor} /><Info label="PRAZO / VENCIMENTO" value={document.due_date ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${document.due_date}T12:00:00Z`)) : 'Não informado'} color={primaryColor} /></div>
              <div className="mt-12 grid grid-cols-2 gap-8 text-center text-[10px] text-slate-600"><div className="border-t pt-2" style={{ borderColor: primaryColor }}>Aprovação do solicitante</div><div className="border-t pt-2" style={{ borderColor: primaryColor }}>Conclusão / responsável técnico</div></div>
            </>}
            <footer className="mt-10 border-t pt-4 text-center text-[9px] text-slate-500" style={{ borderColor: `${primaryColor}55` }}>Gerado pela Central de Documentos · {issuer?.issuer_name || 'Codexa'}</footer>
          </div>
        </article>
      </div>
      <footer className="shrink-0 border-t border-white/10 px-4 py-3 text-xs text-slate-400 sm:px-6">Prévia para conferência — o documento só recebe numeração oficial depois da emissão.</footer>
    </section>
  </div>
}

function Info({ label, value, color }: { label: string; value: string; color: string }) {
  return <div className="border p-3" style={{ borderColor: `${color}55` }}><p className="text-[9px] font-bold tracking-wider" style={{ color }}>{label}</p><p className="mt-1 break-words text-xs font-semibold text-slate-800">{value}</p></div>
}
function Band({ children, color }: { children: string; color: string }) {
  return <h4 className="px-3 py-2 text-[9px] font-bold text-white" style={{ backgroundColor: color }}>{children}</h4>
}
function Cell({ children }: { children: string }) {
  return <p className="border-b px-3 py-3 text-xs text-slate-800">{children}</p>
}
function Note({ label, text, color }: { label: string; text: string; color: string }) {
  return <section className="mt-6 rounded border p-4" style={{ borderColor: `${color}55` }}><h4 className="text-[9px] font-bold tracking-wider" style={{ color }}>{label}</h4><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-700">{text}</p></section>
}
function OperationSection({ title, text, color }: { title: string; text: string; color: string }) {
  return <section className="mt-5"><h4 className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-white" style={{ backgroundColor: color }}>{title}</h4><p className="min-h-16 whitespace-pre-wrap border-x border-b px-3 py-4 text-xs leading-5 text-slate-700" style={{ borderColor: `${color}55` }}>{text}</p></section>
}
function LineItems({ document, color, showTotals = false }: { document: PreviewDocument; color: string; showTotals?: boolean }) {
  return <section className="mt-6 overflow-hidden rounded border" style={{ borderColor: `${color}88` }}><div className="grid grid-cols-[minmax(0,1fr)_48px_90px_90px] gap-2 px-3 py-2 text-[9px] font-bold text-white sm:grid-cols-[minmax(0,1fr)_58px_105px_105px]" style={{ backgroundColor: color }}><span>DESCRIÇÃO</span><span className="text-right">QTD.</span><span className="text-right">UNITÁRIO</span><span className="text-right">TOTAL</span></div>{document.line_items.map((item, index) => <div key={`${item.description}-${index}`} className="grid grid-cols-[minmax(0,1fr)_48px_90px_90px] gap-2 border-b px-3 py-2.5 text-[10px] last:border-0 sm:grid-cols-[minmax(0,1fr)_58px_105px_105px] sm:text-xs" style={{ borderColor: `${color}33`, backgroundColor: index % 2 ? '#F8FAFC' : '#FFFFFF' }}><span className="break-words">{item.description}</span><span className="text-right tabular-nums">{item.quantity}</span><span className="text-right tabular-nums">{money(item.unit_price_cents)}</span><span className="text-right font-semibold tabular-nums">{money(item.unit_price_cents * item.quantity)}</span></div>)}{showTotals && <div className="grid gap-1 border-t p-3 text-xs" style={{ borderColor: color }}><div className="flex justify-between"><span>Subtotal</span><span>{money(document.subtotal_cents)}</span></div><div className="flex justify-between"><span>Desconto</span><span>− {money(document.discount_cents)}</span></div><div className="mt-1 flex justify-between border-t pt-2 text-sm font-bold" style={{ borderColor: `${color}55`, color }}><span>TOTAL</span><span>{money(document.total_cents)}</span></div></div>}</section>
}
