import { NextResponse } from 'next/server'
import { AdminApiError } from '@/lib/supabase/server-client'
import { getWorkspaceActor } from '@/lib/supabase/workspace-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const conversationColumns = 'id,title,selected_model,fallback_models,fallback_enabled,summary,summarized_message_count,created_at,updated_at,last_message_at'

function isAssistantSchemaMissing(error: { code?: string }) {
  return ['PGRST204', 'PGRST205', '42P01'].includes(error.code ?? '')
}

function isValidId(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value)
}

function normalizeFallbackModels(value: unknown, selectedModel?: string): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= 200 && item !== selectedModel))].slice(0, 2)
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getWorkspaceActor()
    const { id } = await params
    if (!isValidId(id)) return NextResponse.json({ error: 'Conversa inválida.' }, { status: 400 })

    const { data: conversation, error: conversationError } = await actor.sessionSupabase
      .from('assistant_conversations')
      .select(conversationColumns)
      .eq('id', id)
      .eq('user_id', actor.actorId)
      .maybeSingle()
    if (conversationError && isAssistantSchemaMissing(conversationError)) {
      return NextResponse.json({ error: 'Aplique o SQL manual do assistente para habilitar o histórico.', sqlRequired: true }, { status: 503 })
    }
    if (conversationError) return NextResponse.json({ error: 'Não foi possível carregar esta conversa.' }, { status: 503 })
    if (!conversation) return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })

    const messages: unknown[] = []
    const messagePageSize = 500
    for (let offset = 0; ; offset += messagePageSize) {
      const { data: messagePage, error: messagesError } = await actor.sessionSupabase
        .from('assistant_messages')
        .select('client_message_id,role,content,model_id,metadata,created_at')
        .eq('conversation_id', id)
        .eq('user_id', actor.actorId)
        .order('created_at', { ascending: true })
        .range(offset, offset + messagePageSize - 1)
      if (messagesError && isAssistantSchemaMissing(messagesError)) {
        return NextResponse.json({ error: 'Aplique o SQL manual do assistente para habilitar o histórico.', sqlRequired: true }, { status: 503 })
      }
      if (messagesError) return NextResponse.json({ error: 'Não foi possível carregar as mensagens.' }, { status: 503 })
      messages.push(...(messagePage ?? []))
      if ((messagePage ?? []).length < messagePageSize) break
    }

    return NextResponse.json(
      { conversation, messages, storageReady: true },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (error) {
    if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[Code-X] conversation_load_failed', { errorName: error instanceof Error ? error.name : 'UnknownError' })
    return NextResponse.json({ error: 'Não foi possível carregar esta conversa.' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getWorkspaceActor()
    const { id } = await params
    if (!isValidId(id)) return NextResponse.json({ error: 'Conversa inválida.' }, { status: 400 })

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const update: Record<string, unknown> = {}
    if (typeof body.title === 'string') update.title = body.title.trim().replace(/[\r\n\t]+/g, ' ').slice(0, 120) || 'Nova conversa'
    if (typeof body.selectedModel === 'string' && body.selectedModel.trim().length <= 200) update.selected_model = body.selectedModel.trim()
    if (typeof body.fallbackEnabled === 'boolean') update.fallback_enabled = body.fallbackEnabled
    if (Array.isArray(body.fallbackModels)) update.fallback_models = normalizeFallbackModels(body.fallbackModels, typeof body.selectedModel === 'string' ? body.selectedModel.trim() : undefined)
    if (!Object.keys(update).length) return NextResponse.json({ error: 'Nenhuma configuração válida foi enviada.' }, { status: 400 })

    const { data, error } = await actor.sessionSupabase
      .from('assistant_conversations')
      .update(update)
      .eq('id', id)
      .eq('user_id', actor.actorId)
      .select(conversationColumns)
      .maybeSingle()
    if (error && isAssistantSchemaMissing(error)) {
      return NextResponse.json({ error: 'Aplique o SQL manual do assistente para habilitar o histórico.', sqlRequired: true }, { status: 503 })
    }
    if (error) return NextResponse.json({ error: 'Não foi possível atualizar a conversa.' }, { status: 503 })
    if (!data) return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
    return NextResponse.json({ conversation: data }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[Code-X] conversation_update_failed', { errorName: error instanceof Error ? error.name : 'UnknownError' })
    return NextResponse.json({ error: 'Não foi possível atualizar a conversa.' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getWorkspaceActor()
    const { id } = await params
    if (!isValidId(id)) return NextResponse.json({ error: 'Conversa inválida.' }, { status: 400 })

    const { data, error } = await actor.sessionSupabase
      .from('assistant_conversations')
      .delete()
      .eq('id', id)
      .eq('user_id', actor.actorId)
      .select('id')
      .maybeSingle()
    if (error && isAssistantSchemaMissing(error)) {
      return NextResponse.json({ error: 'Aplique o SQL manual do assistente para habilitar o histórico.', sqlRequired: true }, { status: 503 })
    }
    if (error) return NextResponse.json({ error: 'Não foi possível excluir a conversa.' }, { status: 503 })
    if (!data) return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
    return new Response(null, { status: 204 })
  } catch (error) {
    if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[Code-X] conversation_delete_failed', { errorName: error instanceof Error ? error.name : 'UnknownError' })
    return NextResponse.json({ error: 'Não foi possível excluir a conversa.' }, { status: 500 })
  }
}
