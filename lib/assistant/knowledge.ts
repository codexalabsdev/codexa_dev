import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, getOpenRouterApiKey } from '@/lib/assistant/openrouter'

export type AssistantKnowledgeEntry = {
  id: string
  slug: string
  title: string
  category: string
  module: string
  content: string
  sourceUrl: string | null
  relevance: number
}

type EmbeddingResponse = { data?: Array<{ index?: number; embedding?: number[] }> }

export async function createEmbeddings(texts: string[]): Promise<number[][]> {
  if (!texts.length) return []

  const apiKey = getOpenRouterApiKey()
  const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.SITE_URL ?? 'https://codexa.dev',
      'X-Title': 'Code-X',
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    throw new Error(response.status === 401 || response.status === 403
      ? 'A autenticação do serviço de embeddings falhou.'
      : response.status === 429
        ? 'O limite temporário do serviço de embeddings foi atingido.'
        : 'O serviço de embeddings está indisponível.')
  }

  const payload = await response.json() as EmbeddingResponse
  const vectors = (payload.data ?? [])
    .slice()
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
    .map((item) => item.embedding)

  if (vectors.length !== texts.length || vectors.some((vector) => !Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS || vector.some((value) => !Number.isFinite(value)))) {
    throw new Error('O serviço de embeddings retornou dimensões incompatíveis com a configuração do Supabase.')
  }

  return vectors as number[][]
}

export function chunkAssistantText(content: string, maxCharacters = 1200, overlap = 160): string[] {
  const normalized = content.replace(/\r\n/g, '\n').replace(/[\t ]+/g, ' ').trim()
  if (!normalized) return []

  const chunks: string[] = []
  let start = 0
  while (start < normalized.length) {
    let end = Math.min(start + maxCharacters, normalized.length)
    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf(' ', end)
      if (boundary > start + Math.floor(maxCharacters * 0.6)) end = boundary
    }
    const chunk = normalized.slice(start, end).trim()
    if (chunk) chunks.push(chunk)
    if (end >= normalized.length) break
    start = Math.max(end - overlap, start + 1)
  }

  return chunks
}

function isMissingKnowledgeSchema(error: { code?: string }): boolean {
  return ['PGRST202', 'PGRST205', '42P01', '42883'].includes(error.code ?? '')
}

function parseKnowledgeEntries(data: unknown): AssistantKnowledgeEntry[] {
  if (!Array.isArray(data)) return []
  return data.flatMap((value) => {
    if (typeof value !== 'object' || value === null) return []
    const row = value as Record<string, unknown>
    if (typeof row.id !== 'string' || typeof row.title !== 'string' || typeof row.content !== 'string') return []
    return [{
      id: row.id,
      slug: typeof row.slug === 'string' ? row.slug : row.id,
      title: row.title.slice(0, 160),
      category: typeof row.category === 'string' ? row.category.slice(0, 80) : 'geral',
      module: typeof row.module_slug === 'string' ? row.module_slug : 'global',
      content: row.content.slice(0, 2400),
      sourceUrl: typeof row.source_url === 'string' ? row.source_url : null,
      relevance: typeof row.relevance === 'number' ? row.relevance : 0,
    }]
  })
}

export async function searchAssistantKnowledge(
  supabase: SupabaseClient,
  query: string,
  moduleSlug?: string,
  limit = 5,
): Promise<AssistantKnowledgeEntry[]> {
  const normalizedQuery = query.trim().slice(0, 700)
  if (!normalizedQuery) return []
  const resultLimit = Math.min(Math.max(limit, 1), 8)

  async function searchLexically() {
    const { data, error } = await supabase.rpc('search_assistant_knowledge_text', {
      p_query: normalizedQuery,
      p_module: moduleSlug ?? null,
      p_limit: resultLimit,
    })
    if (error) {
      if (isMissingKnowledgeSchema(error)) {
        console.info('[Code-X] knowledge_text_search_unavailable', { code: error.code })
      } else {
        console.warn('[Code-X] knowledge_text_search_failed', { code: error.code })
      }
      return []
    }
    return parseKnowledgeEntries(data).slice(0, resultLimit)
  }

  const { data: visibleChunks, error: chunksError } = await supabase
    .from('assistant_knowledge_chunks')
    .select('id')
    .limit(1)
  if (chunksError) {
    if (isMissingKnowledgeSchema(chunksError)) {
      console.info('[Code-X] knowledge_schema_not_applied', { code: chunksError.code })
      return []
    }
    console.warn('[Code-X] knowledge_access_failed', { code: chunksError.code })
    return []
  }

  const lexicalEntries = await searchLexically()
  if (!visibleChunks?.length) return lexicalEntries

  let embedding: number[]
  try {
    const embeddings = await createEmbeddings([normalizedQuery])
    embedding = embeddings[0]
  } catch (error) {
    console.warn('[Code-X] knowledge_embedding_failed', { errorName: error instanceof Error ? error.name : 'UnknownError' })
    return lexicalEntries
  }

  const { data, error } = await supabase.rpc('search_assistant_knowledge', {
    p_query: normalizedQuery,
    p_embedding: `[${embedding.map((value) => value.toFixed(8)).join(',')}]`,
    p_module: moduleSlug ?? null,
    p_limit: Math.max(resultLimit - Math.min(2, resultLimit - 1), 1),
  })

  if (error) {
    if (isMissingKnowledgeSchema(error)) {
      console.info('[Code-X] knowledge_vector_search_unavailable', { code: error.code })
    } else {
      console.warn('[Code-X] knowledge_vector_search_failed', { code: error.code })
    }
    return lexicalEntries
  }

  const combined = [...parseKnowledgeEntries(data), ...lexicalEntries]
  const unique = new Map<string, AssistantKnowledgeEntry>()
  for (const entry of combined) {
    const existing = unique.get(entry.id)
    if (!existing) unique.set(entry.id, entry)
    else if (entry.relevance > existing.relevance) unique.set(entry.id, { ...existing, relevance: entry.relevance })
  }
  return [...unique.values()].slice(0, resultLimit)
}
