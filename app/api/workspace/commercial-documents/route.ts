import { NextResponse } from 'next/server'
import { AdminApiError } from '@/lib/supabase/server-client'
import { requireWorkspacePermission } from '@/lib/supabase/workspace-auth'

export const runtime = 'nodejs'
const types = new Set(['receipt', 'quote', 'billing_notice', 'service_order'])
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type LineItem = { description: string; quantity: number; unit_price_cents: number }
function fail(error: unknown) {
  if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error('Commercial document request failed:', error)
  return NextResponse.json({ error: 'Não foi possível acessar os documentos comerciais.' }, { status: 500 })
}
function validateLineItems(value: unknown): { items: LineItem[]; subtotal: number } | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) return null
  const items: LineItem[] = []
  let subtotal = 0
  for (const row of value) {
    if (typeof row !== 'object' || !row || Array.isArray(row)) return null
    const item = row as Record<string, unknown>
    if (typeof item.description !== 'string' || item.description.trim().length < 2 || item.description.trim().length > 200) return null
    if (!Number.isSafeInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > 10000) return null
    if (!Number.isSafeInteger(item.unit_price_cents) || Number(item.unit_price_cents) < 0 || Number(item.unit_price_cents) > 100_000_000) return null
    const lineTotal = Number(item.quantity) * Number(item.unit_price_cents)
    if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(subtotal + lineTotal)) return null
    subtotal += lineTotal
    items.push({ description: item.description.trim(), quantity: Number(item.quantity), unit_price_cents: Number(item.unit_price_cents) })
  }
  return { items, subtotal }
}
function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
}

export async function GET() {
  try {
    const actor = await requireWorkspacePermission('documents', 'view')
    const { data, error } = await actor.supabase
      .from('workspace_commercial_documents')
      .select('id,document_type,status,title,description,client_id,project_id,line_items,discount_cents,subtotal_cents,total_cents,due_date,notes,document_number,issued_at,pdf_storage_path,created_at,updated_at,created_by')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw new AdminApiError('A estrutura comercial ainda não está disponível. Aplique a migration pendente da Central de Documentos.', 503)
    const { data: settings, error: settingsError } = await actor.supabase.from('workspace_document_settings').select('issuer_name,issuer_tax_id,issuer_email,issuer_phone,issuer_address,updated_at').eq('id', true).maybeSingle()
    if (settingsError && settingsError.code !== 'PGRST116') throw new AdminApiError('Não foi possível carregar as configurações do emissor.', 503)
    const rows = data ?? []
    const documentIds = rows.map((row) => row.id)
    const paths = rows.flatMap((row) => row.pdf_storage_path ? [row.pdf_storage_path] : [])
    const [signed, eventResult] = await Promise.all([
      paths.length ? actor.supabase.storage.from('private-documents').createSignedUrls(paths, 300) : Promise.resolve({ data: [] }),
      documentIds.length ? actor.supabase.from('workspace_document_events').select('id,document_id,event_type,details,created_at').in('document_id', documentIds).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    ])
    if (eventResult.error) throw new AdminApiError('Não foi possível carregar o histórico dos documentos.', 503)
    const urls = new Map((signed.data ?? []).map((entry) => [entry.path, entry.signedUrl]))
    const eventsByDocument = new Map<string, NonNullable<typeof eventResult.data>>()
    for (const event of eventResult.data ?? []) eventsByDocument.set(event.document_id, [...(eventsByDocument.get(event.document_id) ?? []), event])
    return NextResponse.json({ documents: rows.map((row) => ({ ...row, pdf_url: row.pdf_storage_path ? urls.get(row.pdf_storage_path) ?? null : null, events: eventsByDocument.get(row.id) ?? [] })), settings: settings ?? null })
  } catch (error) { return fail(error) }
}

export async function POST(request: Request) {
  try {
    const actor = await requireWorkspacePermission('documents', 'create')
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body || typeof body.title !== 'string' || body.title.trim().length < 2 || body.title.trim().length > 160 || typeof body.document_type !== 'string' || !types.has(body.document_type)) {
      return NextResponse.json({ error: 'Informe um tipo e título válidos para o documento.' }, { status: 400 })
    }
    if (typeof body.description !== 'string' || body.description.length > 2000 || typeof body.notes !== 'string' || body.notes.length > 2000) return NextResponse.json({ error: 'Descrição ou observações acima do limite permitido.' }, { status: 400 })
    const parsed = validateLineItems(body.line_items)
    if (!parsed) return NextResponse.json({ error: 'Revise os itens: informe descrição, quantidade e valor em centavos válidos.' }, { status: 400 })
    const discount = body.discount_cents === undefined ? 0 : body.discount_cents
    if (!Number.isSafeInteger(discount) || Number(discount) < 0 || Number(discount) > parsed.subtotal) return NextResponse.json({ error: 'O desconto deve estar entre zero e o subtotal.' }, { status: 400 })
    const clientId = body.client_id || null
    const projectId = body.project_id || null
    if (clientId !== null && (typeof clientId !== 'string' || !idPattern.test(clientId))) return NextResponse.json({ error: 'Cliente inválido.' }, { status: 400 })
    if (projectId !== null && (typeof projectId !== 'string' || !idPattern.test(projectId))) return NextResponse.json({ error: 'Projeto inválido.' }, { status: 400 })
    if (body.due_date && !validDate(body.due_date)) return NextResponse.json({ error: 'Informe uma data de vencimento válida.' }, { status: 400 })

    if (clientId) {
      const { data: client, error } = await actor.sessionSupabase.from('clients').select('id').eq('id', clientId).maybeSingle()
      if (error || !client) return NextResponse.json({ error: 'Cliente não encontrado ou sem acesso.' }, { status: 404 })
    }
    if (projectId) {
      const { data: project, error } = await actor.sessionSupabase.from('projects').select('id').eq('id', projectId).maybeSingle()
      if (error || !project) return NextResponse.json({ error: 'Projeto não encontrado ou sem acesso.' }, { status: 404 })
    }

    const { data: document, error } = await actor.supabase.from('workspace_commercial_documents').insert({
      document_type: body.document_type,
      title: body.title.trim(),
      description: body.description.trim(),
      client_id: clientId,
      project_id: projectId,
      line_items: parsed.items,
      subtotal_cents: parsed.subtotal,
      discount_cents: Number(discount),
      total_cents: parsed.subtotal - Number(discount),
      due_date: body.due_date || null,
      notes: body.notes.trim(),
      status: 'draft',
      created_by: actor.actorId,
      updated_by: actor.actorId,
    }).select('*').single()
    if (error) throw new AdminApiError('Não foi possível salvar o rascunho. Confira se a migration pendente foi aplicada.', 503)
    await actor.supabase.from('workspace_document_events').insert({ document_id: document.id, actor_id: actor.actorId, event_type: 'created', details: { document_type: document.document_type } })
    return NextResponse.json({ document }, { status: 201 })
  } catch (error) { return fail(error) }
}
