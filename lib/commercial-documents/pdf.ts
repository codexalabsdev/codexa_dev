import 'server-only'

import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib'

type LineItem = { description?: string; quantity?: number; unit_price_cents?: number }
type Snapshot = {
  document_number?: string
  title?: string
  description?: string
  document_type?: string
  line_items?: LineItem[]
  subtotal_cents?: number
  discount_cents?: number
  total_cents?: number
  due_date?: string | null
  notes?: string
  issued_at?: string
  issuer?: { name?: string; tax_id?: string; email?: string; phone?: string; address?: string; issuer_primary_color?: string; issuer_secondary_color?: string }
  client?: { name?: string; legal_name?: string; email?: string; phone?: string }
  project?: { name?: string }
}

const money = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
const safeText = (value: unknown, max = 160) => String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[^\x20-\xFF]/g, ' ').slice(0, max)
const documentColor = (value: string | undefined, fallback: string) => {
  const hex = /^#[0-9A-Fa-f]{6}$/.test(value ?? '') ? value!.slice(1) : fallback.slice(1)
  return rgb(Number.parseInt(hex.slice(0, 2), 16) / 255, Number.parseInt(hex.slice(2, 4), 16) / 255, Number.parseInt(hex.slice(4, 6), 16) / 255)
}
const labels: Record<string, string> = { receipt: 'RECIBO', quote: 'ORCAMENTO', billing_notice: 'NOTA DE COBRANCA', service_order: 'ORDEM DE SERVICO' }

export async function createCommercialDocumentPdf(snapshot: Snapshot): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const type = snapshot.document_type ?? ''
  const isReceipt = type === 'receipt'
  const isQuote = type === 'quote'
  const isBilling = type === 'billing_notice'
  const isServiceOrder = type === 'service_order'
  const issuer = snapshot.issuer ?? {}
  const client = snapshot.client ?? {}
  const lines = snapshot.line_items ?? []
  const primary = documentColor(issuer.issuer_primary_color, '#17324D')
  const secondary = documentColor(issuer.issuer_secondary_color, '#0F766E')
  const white = rgb(1, 1, 1)
  const pale = rgb(0.95, 0.96, 0.97)
  const ink = rgb(0.12, 0.16, 0.21)
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const pageSize: [number, number] = [595.28, 841.89]
  const pages: PDFPage[] = []
  let page = pdf.addPage(pageSize)
  pages.push(page)
  let y = 790
  const addPage = (continuation = false) => {
    page = pdf.addPage(pageSize)
    pages.push(page)
    y = 790
    if (continuation) {
      page.drawText(`${labels[type] ?? 'DOCUMENTO'} · CONTINUACAO`, { x: 44, y, size: 11, font: bold, color: primary })
      page.drawText(safeText(snapshot.document_number, 80), { x: 410, y, size: 9, font: bold, color: primary })
      y -= 32
    }
  }
  const text = (value: unknown, x = 44, size = 10, font: typeof regular = regular, color = ink, max = 110) => {
    const content = safeText(value, max)
    if (content) page.drawText(content, { x, y, size, font, color })
  }
  const right = (value: unknown, rightX: number, size = 9, font: typeof regular = regular, color = ink) => {
    const content = safeText(value, 40)
    page.drawText(content, { x: rightX - font.widthOfTextAtSize(content, size), y, size, font, color })
  }
  const line = (color = secondary) => page.drawLine({ start: { x: 44, y }, end: { x: 551, y }, thickness: 0.8, color })
  const section = (label: string) => {
    y -= 8
    page.drawRectangle({ x: 44, y: y - 8, width: 507, height: 22, color: primary })
    page.drawText(label, { x: 52, y, size: 8, font: bold, color: white })
    y -= 27
  }
  const drawItems = (totals: boolean) => {
    page.drawRectangle({ x: 44, y: y - 8, width: 507, height: 23, color: primary })
    page.drawText('DESCRICAO', { x: 52, y, size: 8, font: bold, color: white })
    right('QTD.', 376, 8, bold, white)
    right('UNITARIO', 460, 8, bold, white)
    right('TOTAL', 543, 8, bold, white)
    y -= 25
    for (const [index, item] of lines.entries()) {
      if (y < 100) addPage(true)
      if (index % 2) page.drawRectangle({ x: 44, y: y - 8, width: 507, height: 20, color: pale })
      const quantity = Math.max(0, Number(item.quantity) || 0)
      const unit = Math.max(0, Number(item.unit_price_cents) || 0)
      text(item.description, 52, 9, regular, ink, 48)
      right(quantity, 376)
      right(money(unit), 460)
      right(money(unit * quantity), 543, 9, bold)
      y -= 23
    }
    if (totals) {
      y -= 8
      right(`Subtotal: ${money(Number(snapshot.subtotal_cents) || 0)}`, 543, 9)
      y -= 17
      right(`Desconto: ${money(Number(snapshot.discount_cents) || 0)}`, 543, 9)
      y -= 22
      page.drawRectangle({ x: 345, y: y - 8, width: 206, height: 27, color: primary })
      page.drawText('TOTAL', { x: 355, y, size: 10, font: bold, color: white })
      right(money(Number(snapshot.total_cents) || 0), 541, 12, bold, white)
      y -= 35
    }
  }

  pdf.setTitle(safeText(snapshot.title, 160))
  pdf.setSubject(`Documento comercial ${safeText(snapshot.document_number, 80)}`)
  pdf.setCreator('Codexa Workspace')

  try {
    const response = await fetch('https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Logotipo_futurista_CODEXA_em_neon__1_-removebg-preview-dAgeswjimSLf0J7eFIogrynbTr4DX2.png', { cache: 'force-cache' })
    if (!response.ok) throw new Error('Nao foi possivel carregar o logotipo CODEXA.')
    const image = await pdf.embedPng(new Uint8Array(await response.arrayBuffer()))
    const size = image.scale(Math.min(110 / image.width, 48 / image.height))
    page.drawImage(image, { x: 44, y: y - size.height + 5, width: size.width, height: size.height })
  } catch {
    page.drawText('CODEXA', { x: 44, y: y - 24, size: 18, font: bold, color: primary })
  }
  page.drawText(safeText(issuer.name || 'Codexa', 80), { x: 170, y: y - 7, size: 11, font: bold, color: primary })
  page.drawText(safeText([issuer.tax_id, issuer.email, issuer.phone, issuer.address].filter(Boolean).join(' · '), 100), { x: 170, y: y - 23, size: 8, font: regular, color: secondary })
  const title = labels[type] ?? 'DOCUMENTO COMERCIAL'
  page.drawText(title, { x: 350, y: y - 2, size: 12, font: bold, color: primary })
  page.drawText(safeText(snapshot.document_number || 'Apos emissao', 40), { x: 350, y: y - 19, size: 9, font: bold, color: primary })
  page.drawText(new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(snapshot.issued_at ?? Date.now())), { x: 350, y: y - 34, size: 8, font: regular, color: secondary })
  y -= 61
  line(primary)
  y -= 27

  if (isReceipt) {
    text('REGISTRO DE PAGAMENTO INFORMADO', 44, 11, bold, secondary)
    y -= 28
    text(`Pagador informado: ${client.name || client.legal_name || 'Cliente nao informado'}`, 44, 10, bold)
    y -= 21
    text(`Referente a: ${snapshot.title}`, 44, 10, bold)
    y -= 19
    if (snapshot.description) { text(snapshot.description, 44, 9, regular, ink, 150); y -= 18 }
    page.drawRectangle({ x: 44, y: y - 35, width: 507, height: 52, color: primary })
    page.drawText('VALOR INFORMADO', { x: 57, y: y + 1, size: 8, font: bold, color: white })
    page.drawText(money(Number(snapshot.total_cents) || 0), { x: 57, y: y - 22, size: 18, font: bold, color: white })
    y -= 75
    if (snapshot.project?.name) { text(`Projeto: ${snapshot.project.name}`, 44, 9); y -= 20 }
    text(`Data do registro: ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(snapshot.issued_at ?? Date.now()))}`, 44, 9)
    y -= 70
    line()
    y -= 17
    text(`${issuer.name || 'Codexa'} · Responsavel pelo recebimento`, 80, 8)
    y -= 34
    line()
    y -= 17
    text(`${client.name || client.legal_name || 'Pagador'} · Pagador`, 80, 8)
    y -= 30
    text('Este documento nao altera o financeiro nem confirma a baixa do pagamento no sistema.', 44, 8, bold, secondary, 110)
  } else if (isQuote) {
    section('DESTINATARIO E PROPOSTA')
    text(`Cliente: ${client.name || client.legal_name || 'Nao informado'}`, 52, 9, bold)
    y -= 17
    text(`Projeto: ${snapshot.project?.name || 'Nao vinculado'}`, 52, 9)
    y -= 17
    text(`Data: ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(snapshot.issued_at ?? Date.now()))}   Validade: ${snapshot.due_date ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' }).format(new Date(`${snapshot.due_date}T12:00:00Z`)) : 'Nao informada'}`, 52, 9)
    y -= 25
    if (snapshot.description) { section('APRESENTACAO') ; text(snapshot.description, 52, 9, regular, ink, 150); y -= 26 }
    section('ITENS DA PROPOSTA')
    drawItems(true)
    if (snapshot.notes) { section('CONDICOES E OBSERVACOES COMERCIAIS'); text(snapshot.notes, 52, 9, regular, ink, 150); y -= 26 }
    if (y < 110) addPage(true)
    y -= 30
    line(primary); y -= 16; text('Codexa · Proponente', 115, 8)
    page.drawLine({ start: { x: 330, y: y + 16 }, end: { x: 540, y: y + 16 }, thickness: 0.8, color: primary }); text('Aceite do cliente · Data e assinatura', 340, 8)
  } else if (isBilling) {
    section('RESPONSAVEL PELO PAGAMENTO')
    text(client.name || client.legal_name || 'Cliente nao informado', 52, 11, bold, primary)
    y -= 20
    text(`Origem: ${snapshot.title}`, 52, 9, bold)
    y -= 17
    if (snapshot.project?.name) { text(`Projeto: ${snapshot.project.name}`, 52, 9); y -= 16 }
    if (snapshot.description) { text(snapshot.description, 52, 9, regular, ink, 150); y -= 25 }
    section('ITENS COBRADOS')
    drawItems(false)
    page.drawRectangle({ x: 44, y: y - 39, width: 507, height: 57, color: primary })
    page.drawText('VALOR TOTAL DEVIDO', { x: 57, y: y + 1, size: 8, font: bold, color: white })
    page.drawText(money(Number(snapshot.total_cents) || 0), { x: 57, y: y - 25, size: 18, font: bold, color: white })
    y -= 75
    text(`Vencimento: ${snapshot.due_date ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${snapshot.due_date}T12:00:00Z`)) : 'Nao informado'}`, 44, 10, bold)
    y -= 28
    if (snapshot.notes) { section('INSTRUCOES DE PAGAMENTO'); text(snapshot.notes, 52, 9, regular, ink, 150); y -= 28 }
    text('Documento comercial de cobranca — nao e nota fiscal e nao confirma pagamento.', 44, 8, bold, secondary, 110)
  } else if (isServiceOrder) {
    section('IDENTIFICACAO DA ORDEM')
    text(`Solicitante: ${client.name || client.legal_name || 'Cliente nao informado'}`, 52, 9, bold)
    y -= 17
    text(`Projeto / contrato: ${snapshot.project?.name || 'Nao vinculado'}`, 52, 9)
    y -= 17
    text(`Abertura: ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(snapshot.issued_at ?? Date.now()))}   Situacao: Emitida`, 52, 9)
    y -= 26
    section('SOLICITACAO / DIAGNOSTICO')
    text(snapshot.description || snapshot.title, 52, 9, regular, ink, 150)
    y -= 28
    section('ATIVIDADES / RECURSOS PREVISTOS')
    for (const [index, item] of lines.entries()) {
      if (y < 100) addPage(true)
      text(`${String(index + 1).padStart(2, '0')}  ${item.description}`, 52, 9, regular, ink, 68)
      right(`Qtd. ${Number(item.quantity) || 0}`, 543, 8, regular, secondary)
      y -= 22
    }
    if (snapshot.notes) { section('OBSERVACOES TECNICAS / CONDICOES'); text(snapshot.notes, 52, 9, regular, ink, 150); y -= 26 }
    y -= 5
    text(`Total estimado: ${money(Number(snapshot.total_cents) || 0)}`, 44, 10, bold, primary)
    y -= 18
    text(`Prazo / vencimento: ${snapshot.due_date ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${snapshot.due_date}T12:00:00Z`)) : 'Nao informado'}`, 44, 9)
    y -= 40
    line(primary); y -= 16; text('Aprovacao do solicitante', 70, 8)
    page.drawLine({ start: { x: 330, y: y + 16 }, end: { x: 540, y: y + 16 }, thickness: 0.8, color: primary }); text('Conclusao / responsavel tecnico', 340, 8)
  } else {
    text(safeText(snapshot.title, 120), 44, 18, bold, primary)
    y -= 30
    if (snapshot.description) { text(snapshot.description, 44, 9, regular, secondary, 150); y -= 25 }
    text(`Cliente: ${client.name || client.legal_name || 'Nao informado'}`, 44, 9, bold)
    y -= 18
    drawItems(true)
    if (snapshot.notes) { section('OBSERVACOES'); text(snapshot.notes, 52, 9, regular, ink, 150); y -= 26 }
  }

  for (const pdfPage of pages) {
    pdfPage.drawRectangle({ x: 24, y: 24, width: 547, height: 794, borderColor: primary, borderWidth: 1.2 })
    pdfPage.drawLine({ start: { x: 44, y: 47 }, end: { x: 551, y: 47 }, thickness: 0.8, color: secondary })
    pdfPage.drawText(`Central de Documentos Codexa · ${labels[type] ?? 'DOCUMENTO COMERCIAL'} · Documento comercial nao fiscal`, { x: 44, y: 31, size: 7, font: regular, color: secondary })
  }
  return pdf.save()
}
