import { NextResponse } from 'next/server'
import { AdminApiError } from '@/lib/supabase/server-client'
import { getWorkspaceActor } from '@/lib/supabase/workspace-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const conversationColumns = 'id,title,selected_model,fallback_models,fallback_enabled,summary,summarized_message_count,created_at,updated_at,last_message_at'

function isAssistantSchemaMissing(error: { code?: string }) {
  return ['PGRST204', 'PGRST205', '42P01'].includes(error.code ?? '')
}

function limitedModelId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 200 ? value.trim() : null
}

function fallbackModelIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter((item) => item.length > 0 && item.length <= 200))].slice(0, 2)
}

export async function GET() {
  try {
    const actor = await getWorkspaceActor()
    const { data, error } = await actor.sessionSupabase
      .from('assistant_conversations')
      .select(conversationColumns)
      .eq('user_id', actor.actorId)
      .order('last_message_at', { ascending: false })
      .limit(40)

    if (error && isAssistantSchemaMissing(error)) {
      return NextResponse.json({ conversations: [], storageReady: false }, { headers: { 'Cache-Control': 'private, no-store' } })
    }
    if (error) {
      console.warn('[Code-X] conversation_list_failed', { code: error.code })
      return NextResponse.json({ error: 'Não foi possível carregar o histórico.' }, { status: 503 })
    }

    return NextResponse.json({ conversations: data ?? [], storageReady: true }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[Code-X] conversation_list_failed', { errorName: error instanceof Error ? error.name : 'UnknownError' })
    return NextResponse.json({ error: 'Não foi possível carregar o histórico.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getWorkspaceActor()
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const title = typeof body.title === 'string' && body.title.trim()
      ? body.title.trim().replace(/[\r\n\t]+/g, ' ').slice(0, 120)
      : 'Nova conversa'
    const selectedModel = limitedModelId(body.selectedModel)
    const fallbackModels = fallbackModelIds(body.fallbackModels).filter((model) => model !== selectedModel)
    const { data, error } = await actor.sessionSupabase
      .from('assistant_conversations')
      .insert({
        user_id: actor.actorId,
        title,
        selected_model: selectedModel,
        fallback_models: fallbackModels,
        fallback_enabled: body.fallbackEnabled === true,
      })
      .select(conversationColumns)
      .single()

    if (error && isAssistantSchemaMissing(error)) {
      return NextResponse.json({ conversation: null, storageReady: false }, { headers: { 'Cache-Control': 'private, no-store' } })
    }
    if (error) {
      console.warn('[Code-X] conversation_create_failed', { code: error.code })
      return NextResponse.json({ error: 'Não foi possível iniciar uma conversa persistente.' }, { status: 503 })
    }

    return NextResponse.json({ conversation: data, storageReady: true }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[Code-X] conversation_create_failed', { errorName: error instanceof Error ? error.name : 'UnknownError' })
    return NextResponse.json({ error: 'Não foi possível iniciar uma conversa.' }, { status: 500 })
  }
}
