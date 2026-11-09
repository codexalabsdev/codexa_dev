'use client'

import { useChat } from '@ai-sdk/react'
import Image from 'next/image'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { MessageScroller } from '@shadcn/react/message-scroller'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import useSWR from 'swr'
import { Bot, ChevronDown, ChevronUp, Clock3, Copy, GripVertical, Loader2, Plus, Send, Settings2, Sparkles, Square, Trash2, User, X } from 'lucide-react'
import { AssistantMarkdown } from '@/components/assistant-markdown'
import { Button } from '@/components/ui/button'
import { Message, MessageAvatar, MessageContent, MessageFooter, MessageGroup, MessageHeader } from '@/components/ui/message'

type AssistantMetadata = {
  modelId?: string
  requestedModel?: string
  fallbackUsed?: boolean
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  conversationId?: string
  sources?: Array<{ title: string; sourceUrl: string | null; module: string }>
}
type AssistantUIMessage = UIMessage<AssistantMetadata>
type AssistantModel = {
  id: string
  name: string
  provider: string
  contextLength: number | null
  pricing: 'free' | 'paid' | 'unknown'
  promptPricePerMillion: number | null
  completionPricePerMillion: number | null
  supportsTools: boolean
  supportsStructuredOutput: boolean
  supportsStreaming: boolean | null
}
type Conversation = {
  id: string
  title: string
  selected_model: string | null
  fallback_models: string[]
  fallback_enabled: boolean
  last_message_at: string
}
type ConversationList = { conversations: Conversation[]; storageReady: boolean }
type ConversationDetail = { conversation: Conversation; messages: Array<{ client_message_id: string; role: 'user' | 'assistant'; content: string; model_id: string | null; metadata: AssistantMetadata | null }> }
type ModelCatalog = { models: AssistantModel[]; defaultModel: string }
type RequestState = { context: string; module: string; conversationId: string | null; modelId: string; fallbackEnabled: boolean; fallbackModels: string[]; storageReady: boolean }

type CommandAssistantProps = {
  context: string
  module: string
  isOpen: boolean
  onClose: () => void
  onConversationActiveChange: (active: boolean) => void
}

async function fetchAssistantJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Não foi possível carregar os dados do assistente.')
  return payload as T
}

function modelPriceLabel(model: AssistantModel): string {
  if (model.pricing === 'free') return 'Gratuito'
  if (model.pricing === 'unknown') return 'Preço não informado'
  const format = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('en-US', { maximumSignificantDigits: 4 }).format(value)
  return `Pago · $${format(model.promptPricePerMillion)}/$${format(model.completionPricePerMillion)} por 1M tokens`
}

function messageText(message: AssistantUIMessage): string {
  return message.parts.filter((part) => part.type === 'text').map((part) => part.text).join('\n').trim()
}

function toolStatus(part: unknown): string | null {
  if (typeof part !== 'object' || part === null) return null
  const value = part as { type?: unknown; state?: unknown }
  if (typeof value.type !== 'string' || !value.type.startsWith('tool_') && !value.type.startsWith('tool-')) return null
  return value.state === 'output-available' ? 'Documentação consultada' : 'Consultando documentação da Codexa…'
}

function CodexaNeonLogo({ size = 'compact' }: { size?: 'compact' | 'large' }) {
  const isCompact = size === 'compact'

  return (
    <span className={`relative isolate grid shrink-0 place-items-center overflow-hidden rounded-2xl border border-cyan-200/20 bg-[#07111a] shadow-[0_0_16px_rgba(34,211,238,.28),0_0_34px_rgba(99,102,241,.2)] ${isCompact ? 'size-10' : 'size-20'}`}>
      <span aria-hidden="true" className="absolute -inset-1 rounded-full bg-[radial-gradient(circle,rgba(34,211,238,.55)_0%,rgba(99,102,241,.3)_44%,transparent_72%)] blur-md motion-safe:animate-pulse" />
      <Image
        src="/codexa-logo.png"
        alt="Codexa"
        width={isCompact ? 32 : 56}
        height={isCompact ? 32 : 56}
        className={`relative z-10 size-auto max-w-full object-contain object-center drop-shadow-[0_0_8px_rgba(34,211,238,.85)] ${isCompact ? 'max-h-7 max-w-7' : 'max-h-14 max-w-14'}`}
      />
    </span>
  )
}

export function CommandAssistant({ context, module, isOpen, onClose, onConversationActiveChange }: CommandAssistantProps) {
  const [input, setInput] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [restoreConversationId, setRestoreConversationId] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState('')
  const [fallbackEnabled, setFallbackEnabled] = useState(false)
  const [fallbackModels, setFallbackModels] = useState<string[]>(['', ''])
  const [showHistory, setShowHistory] = useState(false)
  const [showFallbackSettings, setShowFallbackSettings] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [panelPosition, setPanelPosition] = useState<{ left: number; top: number } | null>(null)
  const [panelSize, setPanelSize] = useState({ width: 440, height: 660 })
  const panelRef = useRef<HTMLElement>(null)
  const panelDrag = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null)
  const panelResize = useRef<{ pointerId: number; clientX: number; clientY: number; left: number; top: number; width: number; height: number } | null>(null)
  const [actionError, setActionError] = useState('')
  const { data: modelCatalog, error: modelError, isLoading: modelsLoading } = useSWR<ModelCatalog>(isOpen ? '/api/assistant/models' : null, fetchAssistantJson)
  const { data: historyData, error: historyError, mutate: mutateConversations } = useSWR<ConversationList>(isOpen ? '/api/assistant/conversations' : null, fetchAssistantJson)
  const { data: restoredData, error: restoreError } = useSWR<ConversationDetail>(
    isOpen && restoreConversationId ? `/api/assistant/conversations/${restoreConversationId}` : null,
    fetchAssistantJson,
  )

  const requestState = useRef<RequestState>({ context, module, conversationId: null, modelId: '', fallbackEnabled: false, fallbackModels: [], storageReady: false })
  requestState.current = {
    context,
    module,
    conversationId,
    modelId: selectedModel,
    fallbackEnabled,
    fallbackModels: fallbackModels.filter(Boolean),
    storageReady: historyData?.storageReady === true,
  }

  const transport = useMemo(() => new DefaultChatTransport<AssistantUIMessage>({
    api: '/api/assistant',
    prepareSendMessagesRequest: ({ messages }) => {
      const requestMessages = requestState.current.storageReady
        ? messages.filter((message) => message.role === 'user').slice(-1)
        : messages.slice(-8).map((message) => ({
          id: message.id,
          role: message.role,
          parts: message.parts.flatMap((part) => part.type === 'text' ? [{ type: 'text' as const, text: part.text.slice(0, 2000) }] : []),
        }))
      return {
        body: {
          messages: requestMessages,
          context: requestState.current.context,
          module: requestState.current.module,
          conversationId: requestState.current.conversationId,
          modelId: requestState.current.modelId,
          fallbackEnabled: requestState.current.fallbackEnabled,
          fallbackModels: requestState.current.fallbackModels,
        },
      }
    },
  }), [])
  const { messages, sendMessage, setMessages, status, error, stop, regenerate } = useChat<AssistantUIMessage>({
    transport,
    onFinish: () => { void mutateConversations() },
  })
  const loading = status === 'submitted' || status === 'streaming'
  const models = modelCatalog?.models ?? []
  const defaultModel = modelCatalog?.defaultModel ?? ''
  const activeModel = selectedModel || defaultModel
  const activeModelInfo = models.find((model) => model.id === activeModel)
  const activeConversation = historyData?.conversations.find((conversation) => conversation.id === conversationId)
  const storageReady = historyData?.storageReady
  const clampPanelPosition = useCallback((left: number, top: number) => {
    const panel = panelRef.current
    if (!panel) return { left, top }
    const bounds = panel.getBoundingClientRect()
    return {
      left: Math.min(Math.max(8, left), Math.max(8, window.innerWidth - bounds.width - 8)),
      top: Math.min(Math.max(8, top), Math.max(8, window.innerHeight - bounds.height - 8)),
    }
  }, [])

  useEffect(() => {
    if (!selectedModel && defaultModel) setSelectedModel(defaultModel)
  }, [defaultModel, selectedModel])

  useEffect(() => {
    if (!isOpen) return
    setMinimized(false)
  }, [isOpen])

  useEffect(() => {
    const keepPanelVisible = () => {
      setPanelPosition((current) => {
        if (!current) return current
        const next = clampPanelPosition(current.left, current.top)
        return next.left === current.left && next.top === current.top ? current : next
      })
    }
    keepPanelVisible()
    window.addEventListener('resize', keepPanelVisible)
    return () => window.removeEventListener('resize', keepPanelVisible)
  }, [clampPanelPosition, expanded, minimized])

  useEffect(() => {
    onConversationActiveChange(Boolean(conversationId || messages.length))
  }, [conversationId, messages.length, onConversationActiveChange])

  useEffect(() => {
    if (!restoredData || restoredData.conversation.id !== restoreConversationId || modelsLoading) return
    const restoredMessages: AssistantUIMessage[] = restoredData.messages.map((message) => ({
      id: message.client_message_id,
      role: message.role,
      parts: message.content ? [{ type: 'text', text: message.content }] : [],
      metadata: message.metadata ?? (message.model_id ? { modelId: message.model_id } : undefined),
    }))
    const restoredModelId = restoredData.conversation.selected_model
    const nextModel = models.find((model) => model.id === restoredModelId)?.id ?? defaultModel
    const availableFallbacks = (restoredData.conversation.fallback_models ?? [])
      .filter((modelId) => modelId !== nextModel && models.some((model) => model.id === modelId))
      .slice(0, 2)
    setConversationId(restoredData.conversation.id)
    requestState.current.conversationId = restoredData.conversation.id
    setSelectedModel(nextModel)
    setFallbackEnabled(restoredData.conversation.fallback_enabled)
    setFallbackModels([availableFallbacks[0] ?? '', availableFallbacks[1] ?? ''])
    setMessages(restoredMessages)
    setRestoreConversationId(null)
    setShowHistory(false)
    setActionError('')
  }, [defaultModel, models, modelsLoading, restoreConversationId, restoredData, setMessages])

  const savePreferences = useCallback(async (next: Partial<Pick<RequestState, 'modelId' | 'fallbackEnabled' | 'fallbackModels'>>) => {
    const activeId = requestState.current.conversationId
    if (!activeId) return
    const response = await fetch(`/api/assistant/conversations/${activeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedModel: next.modelId ?? requestState.current.modelId,
        fallbackEnabled: next.fallbackEnabled ?? requestState.current.fallbackEnabled,
        fallbackModels: next.fallbackModels ?? requestState.current.fallbackModels,
      }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string }
      setActionError(payload.error ?? 'Não foi possível salvar as preferências desta conversa.')
    } else {
      setActionError('')
      void mutateConversations()
    }
  }, [mutateConversations])

  async function startNewConversation() {
    if (loading) stop()
    setConversationId(null)
    requestState.current.conversationId = null
    setRestoreConversationId(null)
    setMessages([])
    setSelectedModel(defaultModel || '')
    setFallbackEnabled(false)
    setFallbackModels(['', ''])
    setInput('')
    setActionError('')
    setShowHistory(false)
  }

  async function deleteConversation(conversation: Conversation) {
    if (!window.confirm(`Excluir a conversa “${conversation.title}”?`)) return
    const response = await fetch(`/api/assistant/conversations/${conversation.id}`, { method: 'DELETE' })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string }
      setActionError(payload.error ?? 'Não foi possível excluir a conversa.')
      return
    }
    if (conversationId === conversation.id) {
      if (loading) stop()
      setConversationId(null)
      requestState.current.conversationId = null
      setMessages([])
    }
    setActionError('')
    void mutateConversations()
  }

  async function sendPrompt(value = input) {
    const prompt = value.trim()
    if (!prompt || loading) return
    setActionError('')

    let activeId = requestState.current.conversationId
    if (!activeId) {
      const response = await fetch('/api/assistant/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: prompt.slice(0, 120),
          selectedModel: requestState.current.modelId || defaultModel,
          fallbackEnabled: requestState.current.fallbackEnabled,
          fallbackModels: requestState.current.fallbackModels,
        }),
      })
      const payload = await response.json().catch(() => ({})) as { conversation?: Conversation | null; storageReady?: boolean; error?: string }
      if (!response.ok) {
        setActionError(payload.error ?? 'Não foi possível iniciar a conversa.')
        return
      }
      activeId = payload.conversation?.id ?? null
      requestState.current.conversationId = activeId
      setConversationId(activeId)
      if (payload.storageReady === false) void mutateConversations()
    }

    setInput('')
    await sendMessage({ text: prompt })
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void sendPrompt()
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendPrompt()
    }
  }

  async function copyAnswer(message: AssistantUIMessage) {
    const text = messageText(message)
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setActionError('')
    } catch {
      setActionError('O navegador não permitiu copiar a resposta.')
    }
  }

  function selectModel(modelId: string) {
    setSelectedModel(modelId)
    requestState.current.modelId = modelId
    void savePreferences({ modelId })
  }

  function toggleFallback(enabled: boolean) {
    setFallbackEnabled(enabled)
    requestState.current.fallbackEnabled = enabled
    void savePreferences({ fallbackEnabled: enabled })
  }

  function selectFallback(index: number, modelId: string) {
    const next = [...fallbackModels]
    next[index] = modelId
    if (next[0] && next[0] === next[1]) next[1] = ''
    setFallbackModels(next)
    requestState.current.fallbackModels = next.filter(Boolean)
    void savePreferences({ fallbackModels: next.filter(Boolean) })
  }

  function startPanelDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !panelRef.current) return
    const bounds = panelRef.current.getBoundingClientRect()
    panelDrag.current = { pointerId: event.pointerId, offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top }
    setPanelPosition({ left: bounds.left, top: bounds.top })
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function movePanelDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = panelDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setPanelPosition(clampPanelPosition(event.clientX - drag.offsetX, event.clientY - drag.offsetY))
  }

  function stopPanelDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (panelDrag.current?.pointerId !== event.pointerId) return
    panelDrag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function startPanelResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !panelRef.current) return
    const bounds = panelRef.current.getBoundingClientRect()
    panelResize.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
    }
    setPanelPosition({ left: bounds.left, top: bounds.top })
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function movePanelResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const resize = panelResize.current
    if (!resize || resize.pointerId !== event.pointerId) return

    const maxWidth = Math.max(240, window.innerWidth - resize.left - 8)
    const maxHeight = Math.max(240, window.innerHeight - resize.top - 8)
    const minWidth = Math.min(320, maxWidth)
    const minHeight = Math.min(360, maxHeight)
    setPanelSize({
      width: Math.min(maxWidth, Math.max(minWidth, resize.width + event.clientX - resize.clientX)),
      height: Math.min(maxHeight, Math.max(minHeight, resize.height + event.clientY - resize.clientY)),
    })
  }

  function stopPanelResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (panelResize.current?.pointerId !== event.pointerId) return
    panelResize.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function resizePanelWithKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Home') {
      event.preventDefault()
      setExpanded(false)
      setPanelSize({ width: 440, height: 660 })
      return
    }

    const movementByKey: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }
    const movement = movementByKey[event.key]
    const panel = panelRef.current
    if (!movement || !panel) return

    event.preventDefault()
    const bounds = panel.getBoundingClientRect()
    const maxWidth = Math.max(240, window.innerWidth - bounds.left - 8)
    const maxHeight = Math.max(240, window.innerHeight - bounds.top - 8)
    const minWidth = Math.min(320, maxWidth)
    const minHeight = Math.min(360, maxHeight)
    const step = event.shiftKey ? 32 : 12
    setPanelPosition((current) => current ?? { left: bounds.left, top: bounds.top })
    setPanelSize((current) => ({
      width: Math.min(maxWidth, Math.max(minWidth, current.width + movement[0] * step)),
      height: Math.min(maxHeight, Math.max(minHeight, current.height + movement[1] * step)),
    }))
  }

  function movePanelWithKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Home') {
      event.preventDefault()
      setPanelPosition(null)
      return
    }
    const movementByKey: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }
    const movement = movementByKey[event.key]
    if (!movement || !panelRef.current) return
    event.preventDefault()
    const bounds = panelRef.current.getBoundingClientRect()
    const current = panelPosition ?? { left: bounds.left, top: bounds.top }
    const step = event.shiftKey ? 32 : 12
    setPanelPosition(clampPanelPosition(current.left + movement[0] * step, current.top + movement[1] * step))
  }

  return (
    <section
      ref={panelRef}
      role="dialog"
      aria-label="Code-X"
      aria-hidden={!isOpen}
      style={{
        width: `${panelSize.width}px`,
        height: minimized ? '68px' : `${panelSize.height}px`,
        ...(panelPosition ? { left: panelPosition.left, top: panelPosition.top, right: 'auto' } : {}),
      }}
      className={`${isOpen ? 'flex' : 'hidden'} fixed ${panelPosition ? '' : 'right-3 top-[84px]'} z-[70] max-h-[calc(100dvh-104px)] max-w-[calc(100vw-24px)] min-w-[min(320px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#11161e] shadow-[0_24px_80px_-24px_rgba(0,0,0,.78)] ring-1 ring-black/20`}
    >
      <header className="flex min-h-[66px] items-center gap-2 border-b border-white/[0.08] px-3 py-2.5">
        <CodexaNeonLogo />
        <Button type="button" variant="ghost" size="icon-sm" className="touch-none cursor-grab select-none active:cursor-grabbing" aria-label="Mover janela do Code-X; use as setas para mover e Home para voltar à posição inicial" title="Arrastar janela" onPointerDown={startPanelDrag} onPointerMove={movePanelDrag} onPointerUp={stopPanelDrag} onPointerCancel={stopPanelDrag} onKeyDown={movePanelWithKeyboard}><GripVertical data-icon="inline-start" /></Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-xs font-semibold text-slate-100">Code-X</h2>
            <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />
          </div>
          <p className="mt-1 truncate text-[10px] text-slate-500">{activeConversation?.title ?? 'Contexto do workspace'}</p>
        </div>
        <div className="flex items-center gap-0.5">
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => setShowHistory((current) => !current)} aria-label="Mostrar histórico" aria-expanded={showHistory} title="Histórico"><Clock3 data-icon="inline-start" /></Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => void startNewConversation()} aria-label="Nova conversa" title="Nova conversa"><Plus data-icon="inline-start" /></Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => setMinimized((current) => !current)} aria-label={minimized ? 'Expandir janela' : 'Minimizar janela'} title={minimized ? 'Expandir' : 'Minimizar'}>{minimized ? <ChevronUp data-icon="inline-start" /> : <ChevronDown data-icon="inline-start" />}</Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => { const nextExpanded = !expanded; setExpanded(nextExpanded); setPanelSize(nextExpanded ? { width: 620, height: 780 } : { width: 440, height: 660 }) }} aria-label={expanded ? 'Restaurar tamanho compacto' : 'Ampliar para tamanho predefinido'} title={expanded ? 'Restaurar tamanho' : 'Ampliar'}>{expanded ? <ChevronDown data-icon="inline-start" /> : <ChevronUp data-icon="inline-start" />}</Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fechar Code-X" title="Fechar"><X data-icon="inline-start" /></Button>
        </div>
      </header>

      {!minimized && <>
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.07] px-3 py-2">
          <label className="sr-only" htmlFor="codexa-model">Modelo de IA</label>
          <select
            id="codexa-model"
            value={activeModel}
            onChange={(event) => selectModel(event.target.value)}
            disabled={modelsLoading || !models.length}
            className="h-8 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0c1117] px-2 text-[11px] text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 disabled:opacity-50"
          >
            {models.length ? models.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.provider} · {model.pricing === 'free' ? 'Gratuito' : model.pricing === 'paid' ? 'Pago' : 'Preço desconhecido'}</option>) : <option value={activeModel}>{modelsLoading ? 'Carregando catálogo…' : activeModel || 'Modelo padrão'}</option>}
          </select>
          <span className={`rounded-full px-2 py-1 text-[9px] font-medium ${activeModelInfo?.pricing === 'free' ? 'bg-emerald-400/10 text-emerald-300' : activeModelInfo?.pricing === 'paid' ? 'bg-amber-400/10 text-amber-200' : 'bg-white/[0.06] text-slate-400'}`} aria-label={activeModelInfo ? modelPriceLabel(activeModelInfo) : 'Preço não informado'} title={activeModelInfo ? modelPriceLabel(activeModelInfo) : 'Preço não informado'}>{activeModelInfo?.pricing === 'free' ? 'Gratuito' : activeModelInfo?.pricing === 'paid' ? 'Pago' : 'Preço n/d'}</span>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => setShowFallbackSettings((current) => !current)} aria-label="Configurar modelos de contingência" aria-expanded={showFallbackSettings} title="Contingência"><Settings2 data-icon="inline-start" /></Button>
          <div className="flex basis-full flex-wrap gap-x-3 text-[9px] text-slate-600" aria-label="Capacidades e disponibilidade do modelo"><span>{activeModelInfo?.provider ?? 'OpenRouter'}</span><span>Ferramentas: {activeModelInfo ? activeModelInfo.supportsTools ? 'sim' : 'não' : 'n/d'}</span><span>JSON: {activeModelInfo ? activeModelInfo.supportsStructuredOutput ? 'sim' : 'não' : 'n/d'}</span><span>Streaming: {activeModelInfo?.supportsStreaming === null || !activeModelInfo ? 'não informado' : activeModelInfo.supportsStreaming ? 'sim' : 'não'}</span><span>{activeModelInfo?.contextLength ? `${Math.round(activeModelInfo.contextLength / 1000)}k tokens` : 'Contexto n/d'}</span><span>{activeModelInfo ? modelPriceLabel(activeModelInfo) : 'Preço n/d'}</span><span title="A presença no catálogo não garante disponibilidade em tempo real">Listada no catálogo OpenRouter</span></div>
        </div>

        {showFallbackSettings && <div className="grid gap-2 border-b border-white/[0.07] bg-white/[0.02] px-3 py-3">
          <label className="flex items-center gap-2 text-[11px] text-slate-300"><input type="checkbox" checked={fallbackEnabled} onChange={(event) => toggleFallback(event.target.checked)} className="size-3.5 accent-cyan-400" />Permitir modelos alternativos</label>
          <p className="text-[10px] leading-4 text-slate-500">A troca só ocorre quando ativada e pode ter preço diferente do modelo principal.</p>
          {[0, 1].map((index) => <label key={index} className="sr-only" htmlFor={`codexa-fallback-${index}`}>Modelo alternativo {index + 1}</label>)}
          {[0, 1].map((index) => <select key={index} id={`codexa-fallback-${index}`} value={fallbackModels[index]} onChange={(event) => selectFallback(index, event.target.value)} disabled={!fallbackEnabled} className="h-8 w-full rounded-lg border border-white/10 bg-[#0c1117] px-2 text-[11px] text-slate-300 outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 disabled:opacity-40">
            <option value="">{`Alternativa ${index + 1} (opcional)`}</option>
            {models.filter((model) => model.id !== activeModel && (!activeModelInfo?.supportsTools || model.supportsTools)).map((model) => <option key={model.id} value={model.id}>{model.name} · {model.pricing === 'free' ? 'Gratuito' : model.pricing === 'paid' ? 'Pago' : 'Preço n/d'}</option>)}
          </select>)}
        </div>}

        {modelError && <p role="alert" className="border-b border-rose-400/10 px-3 py-2 text-[10px] text-rose-300">{modelError.message}</p>}
        {historyData?.storageReady === false && <p role="status" className="border-b border-amber-400/10 bg-amber-400/[0.04] px-3 py-2 text-[10px] leading-4 text-amber-200">Histórico e RAG aguardam a aplicação manual de <code>supabase/manual/assistant_knowledge.sql</code>. A conversa atual continua apenas nesta sessão.</p>}
        {historyError && <p role="alert" className="border-b border-rose-400/10 px-3 py-2 text-[10px] text-rose-300">{historyError.message}</p>}
        {restoreError && <p role="alert" className="border-b border-rose-400/10 px-3 py-2 text-[10px] text-rose-300">{restoreError.message}</p>}

        {showHistory && <div className="max-h-36 overflow-y-auto border-b border-white/[0.07] bg-[#0c1117] p-2" aria-label="Histórico de conversas">
          {historyData?.conversations.length ? historyData.conversations.map((conversation) => <div key={conversation.id} className="flex items-center gap-1">
            <button type="button" onClick={() => { stop(); setMessages([]); setRestoreConversationId(conversation.id); setActionError('') }} className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] transition-colors hover:bg-white/[0.06] ${conversation.id === conversationId ? 'bg-cyan-400/[0.08] text-cyan-100' : 'text-slate-300'}`}><span className="truncate">{conversation.title}</span><span className="shrink-0 text-[9px] text-slate-600">{new Date(conversation.last_message_at).toLocaleDateString('pt-BR')}</span></button>
            <Button type="button" variant="ghost" size="icon-xs" onClick={() => void deleteConversation(conversation)} aria-label={`Excluir conversa ${conversation.title}`} title="Excluir conversa"><Trash2 data-icon="inline-start" /></Button>
          </div>) : <p className="px-2 py-3 text-center text-[10px] text-slate-500">Nenhuma conversa salva.</p>}
        </div>}

        <MessageScroller.Provider autoScroll defaultScrollPosition="end">
          <MessageScroller.Root className="min-h-0 flex-1">
            <MessageScroller.Viewport aria-label="Mensagens da conversa" className="h-full overflow-y-auto px-3">
              <MessageScroller.Content className="gap-4 py-4">
                {!messages.length && <div className="flex min-h-[270px] flex-col items-center justify-center px-5 text-center">
                  <div className="mb-3"><CodexaNeonLogo size="large" /></div>
                  <h3 className="text-sm font-semibold text-slate-100">Como posso ajudar?</h3>
                  <p className="mt-1.5 max-w-xs text-[11px] leading-5 text-slate-500">Posso explicar a documentação da Codexa ou ajudar com tecnologia e programação.</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {['Quais módulos existem na Codexa?', 'Explique uma decisão técnica', 'Ajude a revisar um trecho de código'].map((suggestion) => <button key={suggestion} type="button" onClick={() => void sendPrompt(suggestion)} className="rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-1.5 text-[10px] text-slate-400 transition hover:border-cyan-300/20 hover:text-cyan-100">{suggestion}</button>)}
                  </div>
                </div>}
                <MessageGroup>
                  {messages.map((message) => {
                    const isUser = message.role === 'user'
                    const text = messageText(message)
                    const sources = message.metadata?.sources ?? []
                    return <MessageScroller.Item key={message.id} messageId={message.id} scrollAnchor={message.id === messages[messages.length - 1]?.id}>
                      <Message align={isUser ? 'end' : 'start'}>
                        <MessageAvatar className={`size-7 min-w-7 self-start ${isUser ? 'bg-cyan-300/10 text-cyan-200' : 'bg-blue-400/10 text-blue-200'}`}>
                          {isUser ? <User className="size-3.5" aria-hidden="true" /> : <Bot className="size-3.5" aria-hidden="true" />}
                        </MessageAvatar>
                        <MessageContent className={`max-w-[calc(100%-2.5rem)] rounded-xl border px-3 py-2.5 ${isUser ? 'border-cyan-300/10 bg-cyan-300/[0.07]' : 'border-white/[0.06] bg-white/[0.025]'}`}>
                          <MessageHeader className="px-0 text-[10px]">{isUser ? 'Você' : 'Code-X'}</MessageHeader>
                          {text ? isUser ? <p className="whitespace-pre-wrap break-words text-[12px] leading-5 text-cyan-50">{text}</p> : <AssistantMarkdown content={text} /> : null}
                          {message.parts.map((part, index) => {
                            const statusText = toolStatus(part)
                            return statusText ? <div key={`${message.id}-tool-${index}`} role="status" className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-2.5 py-2 text-[10px] text-slate-400"><Sparkles className="size-3 text-cyan-300" />{statusText}</div> : null
                          })}
                          {!isUser && <>
                            {sources.length > 0 && <div className="flex flex-wrap gap-1.5 border-t border-white/[0.06] pt-2">
                              {sources.map((source, index) => <span key={`${source.title}-${index}`} className="max-w-full truncate rounded-md bg-white/[0.05] px-2 py-1 text-[9px] text-slate-400">{source.sourceUrl && /^https?:\/\//i.test(source.sourceUrl) ? <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-cyan-200">Fonte: {source.title}</a> : `Fonte: ${source.title}`}</span>)}
                            </div>}
                            {message.metadata?.fallbackUsed && <p className="text-[9px] text-amber-200">Resposta enviada por modelo alternativo: {message.metadata.modelId}</p>}
                            {text && <MessageFooter className="justify-between px-0 pt-1"><span className="mr-auto text-[9px] text-slate-600">{typeof message.metadata?.inputTokens === 'number' || typeof message.metadata?.outputTokens === 'number' ? `Entrada ${message.metadata?.inputTokens ?? '—'} · Saída ${message.metadata?.outputTokens ?? '—'} tokens` : ''}</span><Button type="button" variant="ghost" size="xs" onClick={() => void copyAnswer(message)} aria-label="Copiar resposta"><Copy data-icon="inline-start" />Copiar</Button></MessageFooter>}
                          </>}
                        </MessageContent>
                      </Message>
                    </MessageScroller.Item>
                  })}
                </MessageGroup>
                {loading && <div className="flex items-center gap-2 px-2 pb-3 text-[10px] text-slate-500" role="status" aria-live="polite"><Loader2 className="size-3 animate-spin text-cyan-300" />{status === 'submitted' ? 'Preparando resposta…' : 'Escrevendo…'}</div>}
              </MessageScroller.Content>
            </MessageScroller.Viewport>
          </MessageScroller.Root>
        </MessageScroller.Provider>

        {(error || actionError) && <div className="flex items-center justify-between gap-3 border-t border-rose-400/10 bg-rose-400/[0.04] px-3 py-2"><p role="alert" className="min-w-0 text-[10px] leading-4 text-rose-200">{actionError || error?.message || 'Não foi possível responder.'}</p>{error && <Button type="button" variant="ghost" size="xs" onClick={() => void regenerate()} className="shrink-0 text-rose-200">Tentar novamente</Button>}</div>}

        <form onSubmit={handleSubmit} className="border-t border-white/[0.08] bg-[#0d1118] p-3">
          <label htmlFor="codexa-assistant-input" className="sr-only">Mensagem para o Code-X</label>
          <div className="flex items-end gap-2 rounded-xl border border-white/[0.1] bg-white/[0.025] p-2 focus-within:border-cyan-300/30">
            <textarea id="codexa-assistant-input" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleInputKeyDown} rows={2} maxLength={8000} placeholder="Pergunte sobre a Codexa, tecnologia ou código…" className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-1 py-1.5 text-xs leading-5 text-slate-100 outline-none placeholder:text-slate-600" />
            {loading ? <Button type="button" variant="secondary" size="icon" onClick={() => stop()} aria-label="Interromper geração" title="Interromper"><Square data-icon="inline-start" /></Button> : <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Enviar mensagem" title="Enviar"><Send data-icon="inline-start" /></Button>}
          </div>
          <div className="mt-1.5 flex items-center justify-between px-1 text-[9px] text-slate-600"><span>Enter envia · Shift+Enter quebra linha</span><span>{activeModelInfo?.supportsTools ? 'Busca de conhecimento ativa' : 'Busca contextual automática'}</span></div>
        </form>
        <div className="flex h-7 shrink-0 items-center justify-end gap-2 border-t border-white/[0.05] px-2">
          <span aria-hidden="true" className="text-[9px] text-slate-600">Arraste para redimensionar</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="touch-none cursor-nwse-resize"
            aria-label="Redimensionar janela do Code-X. Arraste ou use as setas; Home restaura o tamanho padrão."
            title="Arraste para redimensionar; use as setas ou Home"
            onPointerDown={startPanelResize}
            onPointerMove={movePanelResize}
            onPointerUp={stopPanelResize}
            onPointerCancel={stopPanelResize}
            onKeyDown={resizePanelWithKeyboard}
          >
            <GripVertical data-icon="inline-start" className="rotate-[-45deg]" />
          </Button>
        </div>
      </>}
    </section>
  )
}
