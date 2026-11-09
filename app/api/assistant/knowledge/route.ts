import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { AdminApiError } from '@/lib/supabase/server-client'
import { getWorkspaceActor } from '@/lib/supabase/workspace-auth'
import { chunkAssistantText, createEmbeddings } from '@/lib/assistant/knowledge'

export const runtime = 'nodejs'
export const maxDuration = 60

function isAssistantSchemaMissing(error: { code?: string }) {
  return ['PGRST204', 'PGRST205', '42P01'].includes(error.code ?? '')
}

function looksLikeCredential(content: string): boolean {
  return /(?:sk-or-v1-[A-Za-z0-9_-]{16,}|(?:api[_-]?key|password|secret|access[_-]?token)\s*[:=]\s*[^\s,;]{12,}|Bearer\s+[A-Za-z0-9._-]{24,})/i.test(content)
}

function normalizeSourceUrl(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || value.length > 1000) return undefined
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : undefined
  } catch {
    return undefined
  }
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get('content-length') ?? 0)
    if (contentLength > 250_000) return NextResponse.json({ error: 'O documento excede o tamanho permitido.' }, { status: 413 })

    const actor = await getWorkspaceActor()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    const content = typeof body?.content === 'string' ? body.content.trim() : ''
    const category = typeof body?.category === 'string' ? body.category.trim().slice(0, 80) || 'geral' : 'geral'
    const moduleSlug = typeof body?.module === 'string' ? body.module.trim().slice(0, 80) || 'global' : 'global'
    const sourceUrl = normalizeSourceUrl(body?.sourceUrl)

    if (!title || title.length > 160 || !content || content.length > 100_000) {
      return NextResponse.json({ error: 'Informe um título e um conteúdo de até 100 mil caracteres.' }, { status: 400 })
    }
    if (!/^[a-z0-9-]{1,80}$/i.test(moduleSlug) || sourceUrl === undefined) {
      return NextResponse.json({ error: 'O módulo ou a URL de origem não é válido.' }, { status: 400 })
    }
    if (looksLikeCredential(content)) {
      return NextResponse.json({ error: 'O conteúdo parece conter uma credencial. Remova-a antes de indexar.' }, { status: 400 })
    }

    const chunks = chunkAssistantText(content)
    if (!chunks.length) return NextResponse.json({ error: 'O documento não contém texto indexável.' }, { status: 400 })

    const keywords = Array.isArray(body?.keywords)
      ? [...new Set(body.keywords.filter((keyword): keyword is string => typeof keyword === 'string').map((keyword) => keyword.trim().slice(0, 60)).filter(Boolean))].slice(0, 20)
      : []
    const identity = sourceUrl ?? title.toLocaleLowerCase('pt-BR')
    const slug = `assistant-${createHash('sha256').update(`${actor.actorId}\u0000${moduleSlug}\u0000${identity}`).digest('hex')}`
    const { data: existing, error: existingError } = await actor.sessionSupabase
      .from('assistant_knowledge')
      .select('id,content')
      .eq('slug', slug)
      .eq('created_by', actor.actorId)
      .maybeSingle()
    if (existingError && isAssistantSchemaMissing(existingError)) {
      return NextResponse.json({ error: 'Aplique o SQL manual do assistente antes de indexar documentos.', sqlRequired: true }, { status: 503 })
    }
    if (existingError) {
      console.warn('[Code-X] knowledge_document_lookup_failed', { code: existingError.code })
      return NextResponse.json({ error: 'Não foi possível verificar o índice do documento.' }, { status: 503 })
    }

    if (existing?.content === content) {
      const { count, error: countError } = await actor.sessionSupabase
        .from('assistant_knowledge_chunks')
        .select('id', { count: 'exact', head: true })
        .eq('knowledge_id', existing.id)
      if (countError && isAssistantSchemaMissing(countError)) {
        return NextResponse.json({ error: 'Aplique o SQL manual do assistente antes de indexar documentos.', sqlRequired: true }, { status: 503 })
      }
      if (countError) {
        console.warn('[Code-X] knowledge_chunks_count_failed', { code: countError.code })
        return NextResponse.json({ error: 'Não foi possível verificar os fragmentos do documento.' }, { status: 503 })
      }
      if (count === chunks.length) {
        const { error: metadataError } = await actor.sessionSupabase
          .from('assistant_knowledge')
          .update({ title, category, keywords, module_slug: moduleSlug, source_url: sourceUrl, is_active: true, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .eq('created_by', actor.actorId)
        if (metadataError) {
          console.warn('[Code-X] knowledge_metadata_update_failed', { code: metadataError.code })
          return NextResponse.json({ error: 'Não foi possível atualizar os metadados do documento.' }, { status: 503 })
        }
        return NextResponse.json({ id: existing.id, chunkCount: chunks.length, reusedEmbeddings: true }, { status: 200 })
      }
    }

    const embeddings: number[][] = []
    for (let offset = 0; offset < chunks.length; offset += 24) {
      embeddings.push(...await createEmbeddings(chunks.slice(offset, offset + 24)))
    }

    const { data: document, error: documentError } = await actor.sessionSupabase
      .from('assistant_knowledge')
      .upsert({
        slug,
        title,
        category,
        content,
        keywords,
        module_slug: moduleSlug,
        source_url: sourceUrl,
        created_by: actor.actorId,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'slug' })
      .select('id')
      .single()

    if (documentError && isAssistantSchemaMissing(documentError)) {
      return NextResponse.json({ error: 'Aplique o SQL manual do assistente antes de indexar documentos.', sqlRequired: true }, { status: 503 })
    }
    if (documentError || !document) {
      console.warn('[Code-X] knowledge_document_upsert_failed', { code: documentError?.code })
      return NextResponse.json({ error: 'Não foi possível armazenar o documento.' }, { status: 503 })
    }

    const chunkRows = chunks.map((chunk, index) => ({
      knowledge_id: document.id,
      chunk_index: index,
      content: chunk,
      embedding: `[${embeddings[index].map((value) => value.toFixed(8)).join(',')}]`,
    }))
    const { error: chunksError } = await actor.sessionSupabase
      .from('assistant_knowledge_chunks')
      .upsert(chunkRows, { onConflict: 'knowledge_id,chunk_index' })
    if (chunksError) {
      console.warn('[Code-X] knowledge_chunks_upsert_failed', { code: chunksError.code })
      return NextResponse.json({ error: isAssistantSchemaMissing(chunksError) ? 'Aplique o SQL manual do assistente antes de indexar documentos.' : 'Não foi possível indexar o documento.', sqlRequired: isAssistantSchemaMissing(chunksError) }, { status: 503 })
    }

    const { error: staleChunksError } = await actor.sessionSupabase
      .from('assistant_knowledge_chunks')
      .delete()
      .eq('knowledge_id', document.id)
      .gte('chunk_index', chunks.length)
    if (staleChunksError) {
      console.warn('[Code-X] knowledge_stale_chunks_cleanup_failed', { code: staleChunksError.code })
      return NextResponse.json({ error: 'O documento foi indexado, mas não foi possível remover fragmentos antigos.' }, { status: 503 })
    }

    return NextResponse.json({ id: document.id, chunkCount: chunks.length, reusedEmbeddings: false }, { status: existing ? 200 : 201 })
  } catch (error) {
    if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[Code-X] knowledge_ingest_failed', { errorName: error instanceof Error ? error.name : 'UnknownError' })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível indexar o documento.' }, { status: 502 })
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await getWorkspaceActor()
    const id = new URL(request.url).searchParams.get('id')
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Documento inválido.' }, { status: 400 })

    const { data, error } = await actor.sessionSupabase
      .from('assistant_knowledge')
      .delete()
      .eq('id', id)
      .eq('created_by', actor.actorId)
      .select('id')
      .maybeSingle()

    if (error && isAssistantSchemaMissing(error)) {
      return NextResponse.json({ error: 'Aplique o SQL manual do assistente antes de remover documentos.', sqlRequired: true }, { status: 503 })
    }
    if (error) {
      console.warn('[Code-X] knowledge_document_delete_failed', { code: error.code })
      return NextResponse.json({ error: 'Não foi possível remover o documento.' }, { status: 503 })
    }
    if (!data) return NextResponse.json({ error: 'Documento não encontrado ou sem permissão.' }, { status: 404 })
    return new Response(null, { status: 204 })
  } catch (error) {
    if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[Code-X] knowledge_document_delete_failed', { errorName: error instanceof Error ? error.name : 'UnknownError' })
    return NextResponse.json({ error: 'Não foi possível remover o documento.' }, { status: 500 })
  }
}
