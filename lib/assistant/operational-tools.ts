import 'server-only'

import { randomUUID } from 'node:crypto'
import { jsonSchema, tool } from 'ai'
import { getWorkspaceActor, getWorkspacePermissions, type WorkspaceActor } from '@/lib/supabase/workspace-auth'

type WorkspaceEntity = 'clients' | 'leads' | 'projects' | 'project_tasks'
type ToolAction = 'view' | 'create' | 'update'
type ToolResult = { success: boolean; message: string; entity?: WorkspaceEntity; records?: Record<string, unknown>[]; recordId?: string; recordName?: string }
type QueryResult = { data: Record<string, unknown>[] | Record<string, unknown> | null; error: { message: string } | null }
type ToolInputError = Error & { name: 'ToolInputError' }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const ENTITIES: WorkspaceEntity[] = ['clients', 'leads', 'projects', 'project_tasks']
const PERMISSION_MODULE: Record<WorkspaceEntity, string> = {
  clients: 'clients',
  leads: 'leads',
  projects: 'projects',
  project_tasks: 'projects',
}
const ENTITY_LABEL: Record<WorkspaceEntity, string> = {
  clients: 'clientes',
  leads: 'leads',
  projects: 'projetos',
  project_tasks: 'tarefas',
}
const SEARCH_FIELDS: Record<WorkspaceEntity, string[]> = {
  clients: ['legal_name', 'trade_name', 'email', 'phone', 'status'],
  leads: ['name', 'contact_name', 'email', 'phone', 'source', 'status'],
  projects: ['name', 'description', 'status', 'priority'],
  project_tasks: ['title', 'description', 'status', 'priority'],
}
const ENTITY_FIELDS: Record<WorkspaceEntity, Record<string, { max: number; nullable?: boolean; email?: boolean; date?: boolean }>> = {
  clients: {
    legal_name: { max: 200 }, trade_name: { max: 200, nullable: true }, email: { max: 254, nullable: true, email: true }, phone: { max: 60, nullable: true }, status: { max: 60 },
  },
  leads: {
    name: { max: 200 }, contact_name: { max: 200, nullable: true }, email: { max: 254, nullable: true, email: true }, phone: { max: 60, nullable: true }, source: { max: 120, nullable: true }, status: { max: 80 }, priority: { max: 40 },
  },
  projects: {
    name: { max: 200 }, description: { max: 5000, nullable: true }, status: { max: 80 }, priority: { max: 40 }, due_date: { max: 10, nullable: true, date: true },
  },
  project_tasks: {
    title: { max: 200 }, description: { max: 5000, nullable: true }, status: { max: 80 }, priority: { max: 40 }, due_date: { max: 10, nullable: true, date: true },
  },
}

function inputError(message: string): ToolInputError {
  return Object.assign(new Error(message), { name: 'ToolInputError' as const })
}

function isEntity(value: unknown): value is WorkspaceEntity {
  return typeof value === 'string' && ENTITIES.includes(value as WorkspaceEntity)
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
}

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function fieldValue(fields: unknown, name: string, rule: { max: number; nullable?: boolean; email?: boolean; date?: boolean }, required = false): string | null | undefined {
  if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) throw inputError('Os campos do registro são inválidos.')
  const values = fields as Record<string, unknown>
  if (!(name in values)) {
    if (required) throw inputError(`Informe o campo obrigatório “${name}”.`)
    return undefined
  }
  if (typeof values[name] !== 'string') throw inputError(`O campo “${name}” deve ser um texto.`)
  const value = values[name].trim()
  if (!value && rule.nullable) return null
  if (!value && required) throw inputError(`Informe o campo obrigatório “${name}”.`)
  if (value.length > rule.max) throw inputError(`O campo “${name}” excede o limite de ${rule.max} caracteres.`)
  if (rule.email && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw inputError('Informe um e-mail válido.')
  if (rule.date && value && !isValidDate(value)) throw inputError('Informe uma data válida no formato AAAA-MM-DD.')
  return value || null
}

function parseFields(entity: WorkspaceEntity, input: unknown, required: string[] = []): Record<string, string | null> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw inputError('Os campos do registro são inválidos.')
  const source = input as Record<string, unknown>
  const allowed = ENTITY_FIELDS[entity]
  const fields: Record<string, string | null> = {}
  for (const name of Object.keys(source)) {
    const rule = allowed[name]
    if (!rule) throw inputError(`O campo “${name}” não pode ser alterado por esta ferramenta.`)
    const value = fieldValue(source, name, rule, required.includes(name))
    if (value !== undefined) fields[name] = value
  }
  for (const name of required) {
    if (!(name in fields)) {
      const value = fieldValue(source, name, allowed[name], true)
      if (value !== undefined) fields[name] = value
    }
  }
  if (!Object.keys(fields).length) throw inputError('Informe ao menos um campo para alterar.')
  return fields
}

function isCompletionStatus(value: string | null | undefined): boolean {
  const status = normalized(value ?? '')
  return ['concluido', 'concluida', 'completed', 'done', 'finalizado', 'finalizada', 'entregue', 'entregue ao cliente'].includes(status)
}

function queryData(result: QueryResult): Record<string, unknown>[] {
  if (!result.data) return []
  return Array.isArray(result.data) ? result.data : [result.data]
}

async function listRows(actor: WorkspaceActor, entity: WorkspaceEntity, projectId?: string): Promise<QueryResult> {
  const supabase = actor.sessionSupabase
  if (entity === 'clients') return await supabase.from('clients').select('id,legal_name,trade_name,email,phone,status,entry_date,created_at').order('created_at', { ascending: false }).limit(100) as unknown as QueryResult
  if (entity === 'leads') return await supabase.from('leads').select('id,name,contact_name,email,phone,status,priority,source,created_at').order('created_at', { ascending: false }).limit(100) as unknown as QueryResult
  if (entity === 'projects') return await supabase.from('projects').select('id,name,description,status,priority,due_date,client_id,responsible_id,created_at').order('created_at', { ascending: false }).limit(100) as unknown as QueryResult
  return await supabase.from('project_tasks').select('id,project_id,title,description,status,priority,due_date,responsible_id,created_at,updated_at,sort_order').eq('project_id', projectId!).order('sort_order', { ascending: true }).order('created_at', { ascending: true }).limit(100) as unknown as QueryResult
}

async function getRow(actor: WorkspaceActor, entity: WorkspaceEntity, id: string, projectId?: string): Promise<QueryResult> {
  const supabase = actor.sessionSupabase
  if (entity === 'clients') return await supabase.from('clients').select('id,legal_name,trade_name,email,phone,status,entry_date,created_at').eq('id', id).maybeSingle() as unknown as QueryResult
  if (entity === 'leads') return await supabase.from('leads').select('id,name,contact_name,email,phone,status,priority,source,created_at').eq('id', id).maybeSingle() as unknown as QueryResult
  if (entity === 'projects') return await supabase.from('projects').select('id,name,description,status,priority,due_date,client_id,responsible_id,created_at').eq('id', id).maybeSingle() as unknown as QueryResult
  return await supabase.from('project_tasks').select('id,project_id,title,description,status,priority,due_date,responsible_id,created_at,updated_at,sort_order').eq('id', id).eq('project_id', projectId!).maybeSingle() as unknown as QueryResult
}

async function createRow(actor: WorkspaceActor, entity: WorkspaceEntity, fields: Record<string, string | null>, projectId?: string): Promise<QueryResult> {
  const supabase = actor.sessionSupabase
  if (entity === 'clients') return await supabase.from('clients').insert(fields).select('id,legal_name').single() as unknown as QueryResult
  if (entity === 'leads') return await supabase.from('leads').insert(fields).select('id,name').single() as unknown as QueryResult
  if (entity === 'projects') return await supabase.from('projects').insert({ id: randomUUID(), ...fields }).select('id,name').single() as unknown as QueryResult
  const { data: lastTask, error: lookupError } = await supabase.from('project_tasks').select('sort_order').eq('project_id', projectId!).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  if (lookupError) return { data: null, error: lookupError }
  return await supabase.from('project_tasks').insert({ id: randomUUID(), project_id: projectId, ...fields, sort_order: Math.max(0, (lastTask?.sort_order ?? -1) + 1) }).select('id,title').single() as unknown as QueryResult
}

async function updateRow(actor: WorkspaceActor, entity: WorkspaceEntity, id: string, fields: Record<string, string | null>, projectId?: string): Promise<QueryResult> {
  const supabase = actor.sessionSupabase
  if (entity === 'clients') return await supabase.from('clients').update(fields).eq('id', id).select('id,legal_name').maybeSingle() as unknown as QueryResult
  if (entity === 'leads') return await supabase.from('leads').update(fields).eq('id', id).select('id,name').maybeSingle() as unknown as QueryResult
  if (entity === 'projects') return await supabase.from('projects').update(fields).eq('id', id).select('id,name').maybeSingle() as unknown as QueryResult
  return await supabase.from('project_tasks').update(fields).eq('id', id).eq('project_id', projectId!).select('id,title').maybeSingle() as unknown as QueryResult
}

export function createOperationalAssistantTools(requestId: string) {
  let toolCalls = 0
  let writeCalls = 0

  async function execute(
    toolName: string,
    entity: WorkspaceEntity,
    action: ToolAction,
    operation: (actor: WorkspaceActor) => Promise<ToolResult>,
  ): Promise<ToolResult> {
    toolCalls += 1
    if (toolCalls > 8) return { success: false, message: 'Esta resposta atingiu o limite de consultas. Envie uma nova mensagem para continuar.' }

    try {
      const actor = await getWorkspaceActor()
      const permissions = await getWorkspacePermissions(actor)
      const permission = `${PERMISSION_MODULE[entity]}:${action}`
      if (!permissions.has('*') && !permissions.has(permission)) {
        return { success: false, message: `Você não tem permissão para ${action === 'view' ? 'consultar' : action === 'create' ? 'criar' : 'alterar'} ${ENTITY_LABEL[entity]}.` }
      }
      if (action !== 'view') {
        if (writeCalls >= 1) return { success: false, message: 'Esta resposta já executou uma alteração. Envie uma nova mensagem para outra alteração.' }
        writeCalls += 1
      }
      return await operation(actor)
    } catch (error) {
      if (error instanceof Error && error.name === 'ToolInputError') return { success: false, message: error.message }
      console.warn('[Code-X] operational_tool_failed', {
        requestId,
        toolName,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      })
      return { success: false, message: 'A operação não foi concluída. Verifique o acesso ao registro e tente novamente.' }
    }
  }

  const entitySchema = { type: 'string', enum: ENTITIES }
  const fieldsSchema = {
    type: 'object',
    properties: {
      legal_name: { type: 'string', maxLength: 200 }, trade_name: { type: 'string', maxLength: 200 },
      name: { type: 'string', maxLength: 200 }, contact_name: { type: 'string', maxLength: 200 },
      email: { type: 'string', maxLength: 254 }, phone: { type: 'string', maxLength: 60 }, source: { type: 'string', maxLength: 120 },
      title: { type: 'string', maxLength: 200 }, description: { type: 'string', maxLength: 5000 },
      status: { type: 'string', maxLength: 80 }, priority: { type: 'string', maxLength: 40 }, due_date: { type: 'string', maxLength: 10 },
    },
    additionalProperties: false,
  }

  return {
    list_workspace_records: tool({
      description: 'Consulta até 50 clientes, leads, projetos ou tarefas. Requer permissão de visualização e aplica o escopo do Supabase. Para tarefas, informe projectId. Use search/status para restringir a lista.',
      inputSchema: jsonSchema<{ entity: WorkspaceEntity; search?: string; status?: string; projectId?: string; limit?: number }>({
        type: 'object', properties: {
          entity: entitySchema, search: { type: 'string', maxLength: 120 }, status: { type: 'string', maxLength: 80 },
          projectId: { type: 'string', pattern: UUID_PATTERN.source }, limit: { type: 'integer', minimum: 1, maximum: 50 },
        }, required: ['entity'], additionalProperties: false,
      }),
      execute: async ({ entity, search, status, projectId, limit }) => {
        if (!isEntity(entity)) return { success: false, message: 'Tipo de registro inválido.' }
        if (entity === 'project_tasks' && !isUuid(projectId)) return { success: false, message: 'Informe o identificador do projeto para consultar tarefas.' }
        return execute('list_workspace_records', entity, 'view', async (actor) => {
          const result = await listRows(actor, entity, projectId)
          if (result.error) throw new Error(result.error.message)
          const term = typeof search === 'string' ? normalized(search.trim()) : ''
          const statusFilter = typeof status === 'string' ? normalized(status.trim()) : ''
          const rows = queryData(result).filter((row) => {
            const matchesStatus = !statusFilter || normalized(String(row.status ?? '')) === statusFilter
            const matchesSearch = !term || SEARCH_FIELDS[entity].some((field) => normalized(String(row[field] ?? '')).includes(term))
            return matchesStatus && matchesSearch
          }).slice(0, Math.min(50, Math.max(1, limit ?? 20)))
          return { success: true, message: `${rows.length} registro(s) encontrado(s).`, entity, records: rows }
        })
      },
    }),
    get_workspace_record: tool({
      description: 'Consulta um registro por identificador UUID. Para tarefas, informe também o projectId. A consulta respeita o escopo e as permissões existentes.',
      inputSchema: jsonSchema<{ entity: WorkspaceEntity; id: string; projectId?: string }>({
        type: 'object', properties: { entity: entitySchema, id: { type: 'string', pattern: UUID_PATTERN.source }, projectId: { type: 'string', pattern: UUID_PATTERN.source } },
        required: ['entity', 'id'], additionalProperties: false,
      }),
      execute: async ({ entity, id, projectId }) => {
        if (!isEntity(entity) || !isUuid(id)) return { success: false, message: 'Tipo ou identificador de registro inválido.' }
        if (entity === 'project_tasks' && !isUuid(projectId)) return { success: false, message: 'Informe o identificador do projeto para consultar a tarefa.' }
        return execute('get_workspace_record', entity, 'view', async (actor) => {
          const result = await getRow(actor, entity, id, projectId)
          if (result.error) throw new Error(result.error.message)
          const record = queryData(result)[0]
          return record
            ? { success: true, message: 'Registro encontrado.', entity, records: [record] }
            : { success: false, message: 'Registro não encontrado ou sem acesso.' }
        })
      },
    }),
    create_workspace_record: tool({
      description: 'Cria um cliente, lead, projeto ou tarefa com campos permitidos. Não cria mensagens, não define responsáveis, não exclui nem finaliza registros. Para tarefa, projectId é obrigatório.',
      inputSchema: jsonSchema<{ entity: WorkspaceEntity; projectId?: string; fields: Record<string, string> }>({
        type: 'object', properties: { entity: entitySchema, projectId: { type: 'string', pattern: UUID_PATTERN.source }, fields: fieldsSchema },
        required: ['entity', 'fields'], additionalProperties: false,
      }),
      execute: async ({ entity, projectId, fields }) => {
        if (!isEntity(entity)) return { success: false, message: 'Tipo de registro inválido.' }
        if (entity === 'project_tasks' && !isUuid(projectId)) return { success: false, message: 'Informe o identificador do projeto para criar a tarefa.' }
        return execute('create_workspace_record', entity, 'create', async (actor) => {
          const requiredField = entity === 'clients' ? 'legal_name' : entity === 'leads' ? 'name' : entity === 'projects' ? 'name' : 'title'
          const validated = parseFields(entity, fields, [requiredField])
          if (isCompletionStatus(validated.status)) throw inputError('A finalização de registros permanece disponível na tela para preservar os efeitos de conclusão.')
          if (entity === 'clients' && !('status' in validated)) validated.status = 'Ativo'
          if (entity === 'leads') {
            if (!('status' in validated)) validated.status = 'Novo lead'
            if (!('priority' in validated)) validated.priority = 'Média'
          }
          if (entity === 'projects' || entity === 'project_tasks') {
            if (!('status' in validated)) validated.status = 'Backlog'
            if (!('priority' in validated)) validated.priority = 'Média'
          }
          const result = await createRow(actor, entity, validated, projectId)
          if (result.error) throw new Error(result.error.message)
          const record = queryData(result)[0]
          if (!record) throw new Error('No record returned')
          const name = String(record.legal_name ?? record.name ?? record.title ?? '')
          return { success: true, message: `${ENTITY_LABEL[entity].slice(0, -1)} criado com sucesso.`, entity, recordId: String(record.id), recordName: name }
        })
      },
    }),
    update_workspace_record: tool({
      description: 'Altera campos não críticos de um cliente, lead, projeto ou tarefa existente. Informe UUID; para tarefa informe projectId. Não altera responsáveis, não exclui nem finaliza registros.',
      inputSchema: jsonSchema<{ entity: WorkspaceEntity; id: string; projectId?: string; fields: Record<string, string> }>({
        type: 'object', properties: {
          entity: entitySchema, id: { type: 'string', pattern: UUID_PATTERN.source }, projectId: { type: 'string', pattern: UUID_PATTERN.source }, fields: fieldsSchema,
        }, required: ['entity', 'id', 'fields'], additionalProperties: false,
      }),
      execute: async ({ entity, id, projectId, fields }) => {
        if (!isEntity(entity) || !isUuid(id)) return { success: false, message: 'Tipo ou identificador de registro inválido.' }
        if (entity === 'project_tasks' && !isUuid(projectId)) return { success: false, message: 'Informe o identificador do projeto para alterar a tarefa.' }
        return execute('update_workspace_record', entity, 'update', async (actor) => {
          const validated = parseFields(entity, fields)
          if (isCompletionStatus(validated.status)) throw inputError('A finalização de registros permanece disponível na tela para preservar os efeitos de conclusão.')
          const result = await updateRow(actor, entity, id, validated, projectId)
          if (result.error) throw new Error(result.error.message)
          const record = queryData(result)[0]
          if (!record) return { success: false, message: 'Registro não encontrado ou sem permissão para alteração.' }
          return { success: true, message: `${ENTITY_LABEL[entity].slice(0, -1)} atualizado com sucesso.`, entity, recordId: String(record.id), recordName: String(record.legal_name ?? record.name ?? record.title ?? '') }
        })
      },
    }),
    create_commercial_document_draft: tool({
      description: 'Cria somente um rascunho de recibo, orçamento, cobrança ou ordem de serviço. Nunca emite o documento nem registra pagamento. A emissão exige confirmação explícita na Central de Documentos.',
      inputSchema: jsonSchema<{ documentType: 'receipt' | 'quote' | 'billing_notice' | 'service_order'; title: string; description?: string; items: Array<{ description: string; quantity: number; unitPriceCents: number }> }>({
        type: 'object',
        properties: {
          documentType: { type: 'string', enum: ['receipt', 'quote', 'billing_notice', 'service_order'] },
          title: { type: 'string', minLength: 2, maxLength: 160 },
          description: { type: 'string', maxLength: 2000 },
          items: { type: 'array', minItems: 1, maxItems: 30, items: { type: 'object', properties: { description: { type: 'string', minLength: 2, maxLength: 200 }, quantity: { type: 'integer', minimum: 1, maximum: 10000 }, unitPriceCents: { type: 'integer', minimum: 0, maximum: 100000000 } }, required: ['description', 'quantity', 'unitPriceCents'], additionalProperties: false } },
        },
        required: ['documentType', 'title', 'items'], additionalProperties: false,
      }),
      execute: async ({ documentType, title, description = '', items }) => {
        toolCalls += 1
        if (toolCalls > 8) return { success: false, message: 'Esta resposta atingiu o limite de consultas.' }
        if (writeCalls >= 1) return { success: false, message: 'Esta resposta já executou uma alteração. Envie uma nova mensagem para outra alteração.' }
        const validTypes = ['receipt', 'quote', 'billing_notice', 'service_order']
        if (!validTypes.includes(documentType) || typeof title !== 'string' || title.trim().length < 2 || title.length > 160 || !Array.isArray(items) || items.length < 1 || items.length > 30) return { success: false, message: 'Os dados do rascunho são inválidos.' }
        let subtotal = 0
        const lineItems: { description: string; quantity: number; unit_price_cents: number }[] = []
        for (const item of items) {
          if (typeof item.description !== 'string' || item.description.trim().length < 2 || item.description.length > 200 || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10000 || !Number.isSafeInteger(item.unitPriceCents) || item.unitPriceCents < 0 || item.unitPriceCents > 100_000_000) return { success: false, message: 'Revise a descrição, quantidade e valores informados.' }
          const lineTotal = item.quantity * item.unitPriceCents
          if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(subtotal + lineTotal)) return { success: false, message: 'O valor total excede o limite permitido.' }
          subtotal += lineTotal
          lineItems.push({ description: item.description.trim(), quantity: item.quantity, unit_price_cents: item.unitPriceCents })
        }
        if (description.length > 2000) return { success: false, message: 'A descrição excede o limite permitido.' }
        try {
          const actor = await getWorkspaceActor()
          const permissions = await getWorkspacePermissions(actor)
          if (!permissions.has('*') && !permissions.has('documents:create')) return { success: false, message: 'Você não tem permissão para criar rascunhos de documentos.' }
          writeCalls += 1
          const { data, error } = await actor.supabase.from('workspace_commercial_documents').insert({ document_type: documentType, title: title.trim(), description: description.trim(), line_items: lineItems, subtotal_cents: subtotal, discount_cents: 0, total_cents: subtotal, status: 'draft', notes: '', created_by: actor.actorId, updated_by: actor.actorId }).select('id,title,document_type,total_cents').single()
          if (error || !data) throw new Error(error?.message ?? 'No document returned')
          await actor.supabase.from('workspace_document_events').insert({ document_id: data.id, actor_id: actor.actorId, event_type: 'created', details: { document_type: documentType, source: 'assistant' } })
          return { success: true, message: `Rascunho “${data.title}” criado. Ele ainda não foi emitido; revise e confirme a emissão na Central de Documentos.`, recordId: data.id, recordName: data.title }
        } catch (error) {
          console.warn('[Code-X] commercial_document_draft_failed', { requestId, errorName: error instanceof Error ? error.name : 'UnknownError' })
          return { success: false, message: 'Não foi possível salvar o rascunho. Confira as permissões e se a migration da Central de Documentos está aplicada.' }
        }
      },
    }),
  }
}
