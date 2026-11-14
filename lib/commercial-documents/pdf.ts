import 'server-only'

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

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

export async function createCommercialDocumentPdf(snapshot: Snapshot): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(safeText(snapshot.title, 160))
  pdf.setSubject(`Documento comercial ${safeText(snapshot.document_number, 80)}`)
  pdf.setCreator('Codexa Workspace')
  let page = pdf.addPage([595.28, 841.89])
  const pages = [page]
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.09, 0.13, 0.19)
  const muted = rgb(0.37, 0.42, 0.49)
  const accent = documentColor(snapshot.issuer?.issuer_primary_color, '#17324D')
  const secondary = documentColor(snapshot.issuer?.issuer_secondary_color, '#0F766E')
  const line = rgb(0.88, 0.91, 0.94)
  let y = 790

  try {
    const logo = await readFile(join(process.cwd(), 'public', 'codexa-logo.png'))
    const image = await pdf.embedPng(logo)
    const size = image.scale(Math.min(110 / image.width, 42 / image.height))
    page.drawImage(image, { x: 44, y: y - size.height, width: size.width, height: size.height })
  } catch {
    page.drawText('CODEXA', { x: 44, y: y - 24, size: 18, font: bold, color: accent })
  }
  page.drawText(safeText(snapshot.document_number, 80), { x: 360, y: y - 2, size: 11, font: bold, color: accent })
  page.drawText(new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(snapshot.issued_at ?? Date.now())), { x: 360, y: y - 20, size: 9, font: regular, color: muted })
  y -= 66

  page.drawLine({ start: { x: 44, y }, end: { x: 551, y }, thickness: 1, color: line })
  y -= 38
  page.drawText(safeText(snapshot.title, 120), { x: 44, y, size: 20, font: bold, color: ink })
  y -= 22
  if (snapshot.description) {
    page.drawText(safeText(snapshot.description, 180), { x: 44, y, size: 10, font: regular, color: muted })
    y -= 30
  } else y -= 16

  const issuer = snapshot.issuer ?? {}
  const client = snapshot.client ?? {}
  page.drawText('EMITIDO POR', { x: 44, y, size: 8, font: bold, color: muted })
  page.drawText(safeText(issuer.name || 'Codexa', 100), { x: 44, y: y - 17, size: 10, font: bold, color: ink })
  page.drawText(safeText(issuer.tax_id, 100), { x: 44, y: y - 32, size: 9, font: regular, color: muted })
  page.drawText(safeText(issuer.email || issuer.phone || issuer.address, 100), { x: 44, y: y - 46, size: 9, font: regular, color: muted })
  page.drawText('DESTINATÁRIO', { x: 305, y, size: 8, font: bold, color: muted })
  page.drawText(safeText(client.name || client.legal_name || 'Não informado', 100), { x: 305, y: y - 17, size: 10, font: bold, color: ink })
  page.drawText(safeText(client.email || client.phone, 100), { x: 305, y: y - 32, size: 9, font: regular, color: muted })
  if (snapshot.project?.name) page.drawText(`Projeto: ${safeText(snapshot.project.name, 80)}`, { x: 305, y: y - 46, size: 9, font: regular, color: muted })
  y -= 82

  page.drawLine({ start: { x: 44, y }, end: { x: 551, y }, thickness: 1, color: line })
  y -= 22
  page.drawText('DESCRIÇÃO', { x: 44, y, size: 8, font: bold, color: muted })
  page.drawText('QTD.', { x: 365, y, size: 8, font: bold, color: muted })
  page.drawText('VALOR UNIT.', { x: 416, y, size: 8, font: bold, color: muted })
  page.drawText('TOTAL', { x: 500, y, size: 8, font: bold, color: muted })
  y -= 15
  page.drawLine({ start: { x: 44, y }, end: { x: 551, y }, thickness: 1, color: line })
  y -= 22

  for (const item of (snapshot.line_items ?? []).slice(0, 30)) {
    if (y < 160) {
      page = pdf.addPage([595.28, 841.89])
      pages.push(page)
      y = 790
      page.drawText(`Continuação · ${safeText(snapshot.title, 80)}`, { x: 44, y, size: 12, font: bold, color: ink })
      page.drawText(safeText(snapshot.document_number, 80), { x: 400, y, size: 9, font: bold, color: accent })
      y -= 36
      page.drawText('DESCRIÇÃO', { x: 44, y, size: 8, font: bold, color: muted })
      page.drawText('QTD.', { x: 365, y, size: 8, font: bold, color: muted })
      page.drawText('VALOR UNIT.', { x: 416, y, size: 8, font: bold, color: muted })
      page.drawText('TOTAL', { x: 500, y, size: 8, font: bold, color: muted })
      y -= 25
    }
    const quantity = Math.max(0, Number(item.quantity) || 0)
    const unit = Math.max(0, Number(item.unit_price_cents) || 0)
    page.drawText(safeText(item.description, 52), { x: 44, y, size: 9, font: regular, color: ink })
    page.drawText(String(quantity), { x: 365, y, size: 9, font: regular, color: ink })
    page.drawText(money(unit), { x: 416, y, size: 9, font: regular, color: ink })
    page.drawText(money(unit * quantity), { x: 500, y, size: 9, font: regular, color: ink })
    y -= 24
  }

  if (y < 185) {
    page = pdf.addPage([595.28, 841.89])
    pages.push(page)
    y = 760
  }
  y -= 6
  page.drawLine({ start: { x: 350, y }, end: { x: 551, y }, thickness: 1, color: line })
  y -= 22
  page.drawText('Subtotal', { x: 382, y, size: 9, font: regular, color: muted })
  page.drawText(money(Number(snapshot.subtotal_cents) || 0), { x: 480, y, size: 9, font: regular, color: ink })
  y -= 18
  page.drawText('Desconto', { x: 382, y, size: 9, font: regular, color: muted })
  page.drawText(money(Number(snapshot.discount_cents) || 0), { x: 480, y, size: 9, font: regular, color: ink })
  y -= 23
  page.drawText('TOTAL', { x: 382, y, size: 10, font: bold, color: ink })
  page.drawText(money(Number(snapshot.total_cents) || 0), { x: 475, y, size: 12, font: bold, color: accent })

  if (snapshot.due_date) {
    y -= 38
    page.drawText(`Vencimento: ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${snapshot.due_date}T12:00:00Z`))}`, { x: 44, y, size: 9, font: bold, color: ink })
  }
  if (snapshot.notes) {
    if (y < 90) {
      page = pdf.addPage([595.28, 841.89])
      pages.push(page)
      y = 760
    }
    y -= 32
    page.drawText('OBSERVAÇÕES', { x: 44, y, size: 8, font: bold, color: muted })
    page.drawText(safeText(snapshot.notes, 220), { x: 44, y: y - 16, size: 9, font: regular, color: ink })
  }

  for (const pdfPage of pages) {
    pdfPage.drawRectangle({ x: 24, y: 24, width: 547, height: 794, borderColor: line, borderWidth: 1 })
    pdfPage.drawLine({ start: { x: 24, y: 817 }, end: { x: 320, y: 817 }, thickness: 3, color: accent })
    pdfPage.drawLine({ start: { x: 320, y: 817 }, end: { x: 571, y: 817 }, thickness: 3, color: secondary })
    pdfPage.drawLine({ start: { x: 44, y: 48 }, end: { x: 551, y: 48 }, thickness: 1, color: line })
    pdfPage.drawText('Documento comercial não fiscal · Gerado pela Central de Documentos Codexa', { x: 44, y: 32, size: 8, font: regular, color: muted })
  }
  return pdf.save()
}
