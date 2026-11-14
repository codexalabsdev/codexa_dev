'use client'

import { useChat } from '@ai-sdk/react'
import Image from 'next/image'
import { DefaultChatTransport, type FileUIPart, type UIMessage } from 'ai'
import { MessageScroller } from '@shadcn/react/message-scroller'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import useSWR from 'swr'
import { Bot, ChevronDown, ChevronUp, Clock3, Copy, GripVertical, Loader2, Mic, Paperclip, Plus, Send, Settings2, Sparkles, Square, Trash2, User, X } from 'lucide-react'
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
  modelSwitchedForInput?: boolean
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
  supportsImages: boolean
  supportsAudio: boolean
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

const MAX_ATTACHMENT_COUNT = 4
const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024
const MAX_TOTAL_ATTACHMENT_BYTES = 10 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const ALLOWED_AUDIO_TYPES = new Set(['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/x-wav'])

function getAttachmentMediaType(file: File): string | null {
  const declaredType = file.type.toLowerCase()
  const extensionType = file.name.toLowerCase().endsWith('.png') ? 'image/png'
    : file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg') ? 'image/jpeg'
      : file.name.toLowerCase().endsWith('.webp') ? 'image/webp'
        : file.name.toLowerCase().endsWith('.gif') ? 'image/gif'
          : file.name.toLowerCase().endsWith('.wav') ? 'audio/wav'
            : file.name.toLowerCase().endsWith('.mp3') ? 'audio/mpeg' : ''
  const mediaType = declaredType === 'audio/x-wav' ? 'audio/wav'
    : ALLOWED_IMAGE_TYPES.has(declaredType) || ALLOWED_AUDIO_TYPES.has(declaredType) ? declaredType
      : !declaredType || declaredType === 'application/octet-stream' ? extensionType : ''
  return ALLOWED_IMAGE_TYPES.has(mediaType) || ALLOWED_AUDIO_TYPES.has(mediaType) ? mediaType : null
}

function estimateDataUrlBytes(url: string): number {
  const encoded = url.slice(url.indexOf(',') + 1)
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor(encoded.length * 3 / 4) - padding)
}

function fileToUIPart(file: File, mediaType: string): Promise<FileUIPart> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return reject(new Error('Não foi possível ler o anexo.'))
      const url = reader.result.replace(/^data:[^;,]+/, `data:${mediaType}`)
      resolve({ type: 'file', filename: file.name.slice(0, 180), mediaType, url })
    }
    reader.onerror = () => reject(new Error('Não foi possível ler o anexo.'))
    reader.readAsDataURL(file)
  })
}

const MAX_RECORDING_SECONDS = 180
const RECORDING_SAMPLE_RATE = 16_000

function audioBufferToWav(audioBuffer: AudioBuffer): Blob {
  const samples = audioBuffer.getChannelData(0)
  const wavBuffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(wavBuffer)
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index))
  }

  writeText(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, audioBuffer.sampleRate, true)
  view.setUint32(28, audioBuffer.sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]))
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }
  return new Blob([wavBuffer], { type: 'audio/wav' })
}

function formatRecordingTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

function toolStatus(part: unknown): string | null {
  if (typeof part !== 'object' || part === null) return null
  const value = part as { type?: unknown; state?: unknown; output?: unknown }
  if (typeof value.type !== 'string' || !value.type.startsWith('tool_') && !value.type.startsWith('tool-')) return null

  const name = value.type.replace(/^tool[_-]/, '')
  if (name === 'search_codexa_knowledge') {
    return value.state === 'output-available' ? 'Documentação consultada' : 'Consultando documentação da Codexa…'
  }

  const isWrite = name === 'create_workspace_record' || name === 'update_workspace_record'
  const label = name === 'create_workspace_record' ? 'Criando registro' : name === 'update_workspace_record' ? 'Atualizando registro' : 'Consultando registros'
  if (value.state === 'output-error') return `${label}: operação não concluída`
  if (value.state === 'output-available') {
    const output = typeof value.output === 'object' && value.output !== null ? value.output as { success?: unknown; message?: unknown } : null
    if (typeof output?.message === 'string') return output.message
    return output?.success === false ? `${label}: operação não concluída` : isWrite ? `${label}: concluída` : 'Consulta de registros concluída'
  }
  return `${label}…`
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
  const [pendingFiles, setPendingFiles] = useState<FileUIPart[]>([])
  const [isAddingAttachments, setIsAddingAttachments] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isStartingRecording, setIsStartingRecording] = useState(false)
  const [isConvertingRecording, setIsConvertingRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const recordingStartedAtRef = useRef(0)
  const discardRecordingRef = useRef(false)
  const recordingSessionRef = useRef(0)
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
      const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user')
      const requestMessages = requestState.current.storageReady
        ? latestUserMessage ? [latestUserMessage] : []
        : messages.map((message) => ({
          id: message.id,
          role: message.role,
          parts: message.parts.flatMap((part): AssistantUIMessage['parts'] => {
            if (part.type === 'text') return [{ type: 'text' as const, text: part.text }]
            if (message.id === latestUserMessage?.id && part.type === 'file') return [part]
            return []
          }),
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
  const attachmentNeedsModelSwitch = pendingFiles.some((file) => file.mediaType.startsWith('image/') ? !activeModelInfo?.supportsImages : !activeModelInfo?.supportsAudio)
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
    if (isOpen) return
    recordingSessionRef.current += 1
    discardRecordingRef.current = true
    const recorder = recorderRef.current
    if (recorder?.state === 'recording') recorder.stop()
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop())
    recordingStreamRef.current = null
    recorderRef.current = null
    setIsRecording(false)
    setIsStartingRecording(false)
    setIsConvertingRecording(false)
    setRecordingSeconds(0)
  }, [isOpen])

  useEffect(() => {
    if (!isRecording) return
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordingStartedAtRef.current) / 1000)
      setRecordingSeconds(Math.min(elapsed, MAX_RECORDING_SECONDS))
      if (elapsed >= MAX_RECORDING_SECONDS) {
        const recorder = recorderRef.current
        if (recorder?.state === 'recording') {
          setActionError('A gravação atingiu o limite de três minutos e foi anexada.')
          setIsRecording(false)
          recorder.stop()
        }
      }
    }, 500)
    return () => window.clearInterval(timer)
  }, [isRecording])

  useEffect(() => () => {
    const recorder = recorderRef.current
    if (recorder) {
      recorder.onstop = null
      recorder.ondataavailable = null
      if (recorder.state === 'recording') recorder.stop()
    }
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop())
  }, [])

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
    discardRecording()
    setConversationId(null)
    requestState.current.conversationId = null
    setRestoreConversationId(null)
    setMessages([])
    setSelectedModel(defaultModel || '')
    setFallbackEnabled(false)
    setFallbackModels(['', ''])
    setInput('')
    setPendingFiles([])
    setActionError('')
    setShowHistory(false)
  }

  async function deleteConversation(conversation: Conversation) {
    if (conversationId === conversation.id) {
      setActionError('Encerre a conversa iniciando uma nova antes de excluí-la.')
      return
    }
    if (!window.confirm(`Excluir a conversa “${conversation.title}”?`)) return
    const response = await fetch(`/api/assistant/conversations/${conversation.id}`, { method: 'DELETE' })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string }
      setActionError(payload.error ?? 'Não foi possível excluir a conversa.')
      return
    }
    setActionError('')
    void mutateConversations()
  }

  async function sendPrompt(value = input, attachments = pendingFiles) {
    const trimmedPrompt = value.trim()
    const prompt = trimmedPrompt || (attachments.some((file) => file.mediaType.startsWith('audio/'))
      ? 'Transcreva e responda ao conteúdo do áudio anexado.'
      : attachments.length ? 'Analise a imagem anexada e responda apenas ao que for pertinente.' : '')
    if ((!prompt && !attachments.length) || loading || isAddingAttachments || isStartingRecording || isRecording || isConvertingRecording) return
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
    setPendingFiles([])
    await sendMessage({ text: prompt, ...(attachments.length ? { files: attachments } : {}) })
  }

  async function addAttachments(event: ChangeEvent<HTMLInputElement>) {
    const fileInput = event.currentTarget
    const selectedFiles = Array.from(fileInput.files ?? [])
    fileInput.value = ''
    if (!selectedFiles.length) return
    if (pendingFiles.length + selectedFiles.length > MAX_ATTACHMENT_COUNT) {
      setActionError('Envie até quatro anexos por mensagem.')
      return
    }

    const mediaTypes = selectedFiles.map(getAttachmentMediaType)
    if (mediaTypes.some((mediaType) => !mediaType)) {
      setActionError('Anexe imagens PNG, JPEG, WebP ou GIF, ou áudios WAV/MP3.')
      return
    }
    if (selectedFiles.some((file) => file.size > MAX_ATTACHMENT_BYTES)) {
      setActionError('Cada anexo deve ter no máximo 6 MB.')
      return
    }
    const currentSize = pendingFiles.reduce((total, file) => total + estimateDataUrlBytes(file.url), 0)
    const selectedSize = selectedFiles.reduce((total, file) => total + file.size, 0)
    if (currentSize + selectedSize > MAX_TOTAL_ATTACHMENT_BYTES) {
      setActionError('O tamanho total dos anexos deve ser de até 10 MB.')
      return
    }

    setIsAddingAttachments(true)
    try {
      const attachments = await Promise.all(selectedFiles.map((file, index) => fileToUIPart(file, mediaTypes[index] as string)))
      setPendingFiles((current) => [...current, ...attachments])
      setActionError('')
    } catch {
      setActionError('Não foi possível ler um dos anexos.')
    } finally {
      setIsAddingAttachments(false)
    }
  }

  async function attachRecordedAudio(blob: Blob, sessionId: number) {
    setIsConvertingRecording(true)
    setActionError('')
    let decodeContext: AudioContext | null = null
    try {
      decodeContext = new AudioContext()
      const decodedAudio = await decodeContext.decodeAudioData(await blob.arrayBuffer())
      if (sessionId !== recordingSessionRef.current) return
      if (decodedAudio.duration > MAX_RECORDING_SECONDS + 1) throw new Error('A gravação passou do limite de três minutos.')

      const frameCount = Math.max(1, Math.ceil(decodedAudio.duration * RECORDING_SAMPLE_RATE))
      const offlineContext = new OfflineAudioContext(1, frameCount, RECORDING_SAMPLE_RATE)
      const source = offlineContext.createBufferSource()
      source.buffer = decodedAudio
      source.connect(offlineContext.destination)
      source.start(0)
      const wavBlob = audioBufferToWav(await offlineContext.startRendering())
      if (sessionId !== recordingSessionRef.current) return
      if (wavBlob.size > MAX_ATTACHMENT_BYTES) throw new Error('A gravação excedeu o limite de 6 MB.')
      if (pendingFiles.length >= MAX_ATTACHMENT_COUNT) throw new Error('Remova um anexo para adicionar a gravação.')

      const currentSize = pendingFiles.reduce((total, file) => total + estimateDataUrlBytes(file.url), 0)
      if (currentSize + wavBlob.size > MAX_TOTAL_ATTACHMENT_BYTES) throw new Error('O tamanho total dos anexos deve ser de até 10 MB.')

      const file = new File([wavBlob], `gravacao-${new Date().toISOString().replace(/[:.]/g, '-')}.wav`, { type: 'audio/wav' })
      const attachment = await fileToUIPart(file, 'audio/wav')
      if (sessionId !== recordingSessionRef.current) return
      setPendingFiles((current) => [...current, attachment])
      setActionError('')
    } catch (error) {
      if (sessionId === recordingSessionRef.current) {
        setActionError(error instanceof Error ? error.message : 'Não foi possível preparar a gravação. Tente novamente ou anexe um WAV/MP3.')
      }
    } finally {
      if (decodeContext && decodeContext.state !== 'closed') await decodeContext.close().catch(() => undefined)
      if (sessionId === recordingSessionRef.current) setIsConvertingRecording(false)
    }
  }

  async function startRecording() {
    if (!isOpen || isStartingRecording || isRecording || isConvertingRecording || isAddingAttachments) return
    if (pendingFiles.length >= MAX_ATTACHMENT_COUNT) {
      setActionError('Remova um anexo antes de gravar o áudio.')
      return
    }
    if (!window.isSecureContext) {
      setActionError('A gravação exige uma conexão segura HTTPS.')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setActionError('Este navegador não oferece suporte à gravação de áudio.')
      return
    }

    const sessionId = ++recordingSessionRef.current
    discardRecordingRef.current = false
    setIsStartingRecording(true)
    setActionError('')
    let stream: MediaStream | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      if (sessionId !== recordingSessionRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      const chunks: Blob[] = []
      recordingStreamRef.current = stream
      recorderRef.current = recorder
      recordingStartedAtRef.current = Date.now()
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.onerror = () => {
        if (sessionId !== recordingSessionRef.current) return
        discardRecordingRef.current = true
        setActionError('O navegador encontrou um erro durante a gravação.')
        setIsRecording(false)
        if (recorder.state === 'recording') recorder.stop()
      }
      recorder.onstop = () => {
        stream?.getTracks().forEach((track) => track.stop())
        if (recordingStreamRef.current === stream) recordingStreamRef.current = null
        if (recorderRef.current === recorder) recorderRef.current = null
        if (sessionId !== recordingSessionRef.current) return
        setIsRecording(false)
        setRecordingSeconds(0)
        if (discardRecordingRef.current) return
        const recordedAudio = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || 'audio/webm' })
        if (!recordedAudio.size) {
          setActionError('Nenhum áudio foi capturado. Verifique o microfone e tente novamente.')
          return
        }
        void attachRecordedAudio(recordedAudio, sessionId)
      }
      recorder.start(1000)
      setIsRecording(true)
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop())
      if (sessionId === recordingSessionRef.current) {
        if (recordingStreamRef.current === stream) recordingStreamRef.current = null
        recorderRef.current = null
        setIsRecording(false)
        const permissionDenied = error instanceof DOMException && error.name === 'NotAllowedError'
        setActionError(permissionDenied
          ? 'Permita o acesso ao microfone nas configurações do navegador para gravar.'
          : 'Não foi possível iniciar a gravação. Verifique o microfone e tente novamente.')
      }
    } finally {
      if (sessionId === recordingSessionRef.current) setIsStartingRecording(false)
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current
    if (!recorder || recorder.state !== 'recording') return
    setIsRecording(false)
    recorder.stop()
  }

  function discardRecording() {
    recordingSessionRef.current += 1
    discardRecordingRef.current = true
    const recorder = recorderRef.current
    if (recorder?.state === 'recording') recorder.stop()
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop())
    recordingStreamRef.current = null
    recorderRef.current = null
    setIsRecording(false)
    setIsStartingRecording(false)
    setIsConvertingRecording(false)
    setRecordingSeconds(0)
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
            {models.length ? models.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.provider} · {model.pricing === 'free' ? 'Gratuito' : model.pricing === 'paid' ? 'Pago' : 'Preço desconhecido'}{model.supportsImages ? ' · Imagem' : ''}{model.supportsAudio ? ' · Áudio' : ''}</option>) : <option value={activeModel}>{modelsLoading ? 'Carregando catálogo…' : activeModel || 'Modelo padrão'}</option>}
          </select>
          <span className={`rounded-full px-2 py-1 text-[9px] font-medium ${activeModelInfo?.pricing === 'free' ? 'bg-emerald-400/10 text-emerald-300' : activeModelInfo?.pricing === 'paid' ? 'bg-amber-400/10 text-amber-200' : 'bg-white/[0.06] text-slate-400'}`} aria-label={activeModelInfo ? modelPriceLabel(activeModelInfo) : 'Preço não informado'} title={activeModelInfo ? modelPriceLabel(activeModelInfo) : 'Preço não informado'}>{activeModelInfo?.pricing === 'free' ? 'Gratuito' : activeModelInfo?.pricing === 'paid' ? 'Pago' : 'Preço n/d'}</span>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => setShowFallbackSettings((current) => !current)} aria-label="Configurar modelos de contingência" aria-expanded={showFallbackSettings} title="Contingência"><Settings2 data-icon="inline-start" /></Button>
          <div className="flex basis-full flex-wrap gap-x-3 text-[9px] text-slate-600" aria-label="Capacidades e disponibilidade do modelo"><span>{activeModelInfo?.provider ?? 'OpenRouter'}</span><span>Ferramentas: {activeModelInfo ? activeModelInfo.supportsTools ? 'sim' : 'não' : 'n/d'}</span><span>Imagem: {activeModelInfo ? activeModelInfo.supportsImages ? 'sim' : 'não' : 'n/d'}</span><span>Áudio: {activeModelInfo ? activeModelInfo.supportsAudio ? 'sim' : 'não' : 'n/d'}</span><span>JSON: {activeModelInfo ? activeModelInfo.supportsStructuredOutput ? 'sim' : 'não' : 'n/d'}</span><span>Streaming: {activeModelInfo?.supportsStreaming === null || !activeModelInfo ? 'não informado' : activeModelInfo.supportsStreaming ? 'sim' : 'não'}</span><span>{activeModelInfo?.contextLength ? `${Math.round(activeModelInfo.contextLength / 1000)}k tokens` : 'Contexto n/d'}</span><span>{activeModelInfo ? modelPriceLabel(activeModelInfo) : 'Preço n/d'}</span><span title="A presença no catálogo não garante disponibilidade em tempo real">Listada no catálogo OpenRouter</span></div>
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
            <button type="button" onClick={() => { discardRecording(); stop(); setMessages([]); setPendingFiles([]); setRestoreConversationId(conversation.id); setActionError('') }} className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] transition-colors hover:bg-white/[0.06] ${conversation.id === conversationId ? 'bg-cyan-400/[0.08] text-cyan-100' : 'text-slate-300'}`}><span className="truncate">{conversation.title}</span><span className="shrink-0 text-[9px] text-slate-600">{new Date(conversation.last_message_at).toLocaleDateString('pt-BR')}</span></button>
            <Button type="button" variant="ghost" size="icon-xs" onClick={() => void deleteConversation(conversation)} disabled={conversation.id === conversationId} aria-label={conversation.id === conversationId ? `Conversa ativa ${conversation.title}; inicie uma nova para encerrar antes de excluir` : `Excluir conversa ${conversation.title}`} title={conversation.id === conversationId ? 'Inicie uma nova conversa para encerrar antes de excluir.' : 'Excluir conversa'}><Trash2 data-icon="inline-start" /></Button>
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
                          {isUser && message.parts.map((part, index) => part.type === 'file' ? <div key={`${message.id}-file-${index}`} className="mt-2 max-w-full overflow-hidden rounded-lg border border-white/10 bg-black/20 p-2">
                            {part.mediaType.startsWith('image/') ? <Image src={part.url} alt={part.filename ? `Imagem anexada: ${part.filename}` : 'Imagem anexada'} width={256} height={180} unoptimized className="max-h-44 w-auto max-w-full rounded object-contain" /> : <audio controls preload="metadata" src={part.url} aria-label={part.filename ? `Áudio anexado: ${part.filename}` : 'Áudio anexado'} className="max-w-full" />}
                            {part.filename && <p className="mt-1 truncate text-[9px] text-slate-500">{part.filename}</p>}
                          </div> : null)}
                          {message.parts.map((part, index) => {
                            const statusText = toolStatus(part)
                            return statusText ? <div key={`${message.id}-tool-${index}`} role="status" className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-2.5 py-2 text-[10px] text-slate-400"><Sparkles className="size-3 text-cyan-300" />{statusText}</div> : null
                          })}
                          {!isUser && <>
                            {sources.length > 0 && <div className="flex flex-wrap gap-1.5 border-t border-white/[0.06] pt-2">
                              {sources.map((source, index) => <span key={`${source.title}-${index}`} className="max-w-full truncate rounded-md bg-white/[0.05] px-2 py-1 text-[9px] text-slate-400">{source.sourceUrl && /^https?:\/\//i.test(source.sourceUrl) ? <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-cyan-200">Fonte: {source.title}</a> : `Fonte: ${source.title}`}</span>)}
                            </div>}
                            {message.metadata?.modelSwitchedForInput && <p className="text-[9px] text-cyan-200">Modelo multimodal usado para analisar os anexos: {message.metadata.modelId}</p>}
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
          <input ref={fileInputRef} id="codexa-assistant-attachments" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,audio/wav,audio/x-wav,audio/mp3,audio/mpeg,.wav,.mp3" onChange={(event) => void addAttachments(event)} className="sr-only" aria-label="Selecionar imagens ou áudios" />
          {(isStartingRecording || isRecording || isConvertingRecording) && <div role="status" aria-live="polite" className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-rose-300/15 bg-rose-400/[0.05] px-3 py-2 text-[10px] text-rose-100">
            <span>{isRecording ? `Gravando áudio · ${formatRecordingTime(recordingSeconds)} / 3:00` : isStartingRecording ? 'Aguardando permissão do microfone…' : 'Preparando áudio para anexar…'}</span>
            <Button type="button" variant="ghost" size="xs" onClick={discardRecording} className="shrink-0 text-slate-300">Descartar</Button>
          </div>}
          {pendingFiles.length > 0 && <div className="mb-2 flex flex-wrap gap-2" aria-label="Anexos pendentes">
            {pendingFiles.map((file, index) => <div key={`${file.filename}-${index}`} className="relative max-w-full rounded-lg border border-white/10 bg-white/[0.03] p-2">
              {file.mediaType.startsWith('image/') ? <Image src={file.url} alt={file.filename ? `Prévia de ${file.filename}` : 'Prévia da imagem'} width={96} height={72} unoptimized className="max-h-16 w-auto max-w-24 rounded object-contain" /> : <div className="grid gap-1 pr-5"><p className="max-w-40 truncate text-[10px] text-slate-300">{file.filename || 'Áudio anexado'}</p><audio controls preload="metadata" src={file.url} aria-label={file.filename ? `Prévia de áudio: ${file.filename}` : 'Prévia de áudio'} className="max-w-52" /></div>}
              <Button type="button" variant="ghost" size="icon-xs" onClick={() => setPendingFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} disabled={isStartingRecording || isRecording || isConvertingRecording} aria-label={`Remover anexo ${file.filename || index + 1}`} className="absolute right-1 top-1"><X data-icon="inline-start" /></Button>
            </div>)}
          </div>}
          {attachmentNeedsModelSwitch && <p role="status" className="mb-2 text-[9px] leading-4 text-cyan-200">Este modelo não processa todos os anexos; um modelo multimodal compatível será usado apenas nesta resposta.</p>}
          <label htmlFor="codexa-assistant-input" className="sr-only">Mensagem para o Code-X</label>
          <div className="flex items-end gap-2 rounded-xl border border-white/[0.1] bg-white/[0.025] p-2 focus-within:border-cyan-300/30">
            <textarea id="codexa-assistant-input" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleInputKeyDown} rows={2} maxLength={8000} placeholder="Pergunte sobre a Codexa, tecnologia ou código…" className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-1 py-1.5 text-xs leading-5 text-slate-100 outline-none placeholder:text-slate-600" />
            <Button type="button" variant={isRecording ? 'destructive' : 'ghost'} size="icon" onClick={() => isRecording ? stopRecording() : void startRecording()} disabled={isStartingRecording || isConvertingRecording || isAddingAttachments || (!isRecording && (loading || pendingFiles.length >= MAX_ATTACHMENT_COUNT))} aria-label={isRecording ? 'Parar e anexar gravação' : 'Gravar áudio'} title={isRecording ? 'Parar e anexar gravação' : 'Gravar áudio'}>
              {isStartingRecording || isConvertingRecording ? <Loader2 className="animate-spin" data-icon="inline-start" /> : isRecording ? <Square data-icon="inline-start" /> : <Mic data-icon="inline-start" />}
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={isAddingAttachments || isStartingRecording || isRecording || isConvertingRecording || pendingFiles.length >= MAX_ATTACHMENT_COUNT} aria-label="Adicionar imagem ou áudio" title="Adicionar imagem ou áudio"><Paperclip data-icon="inline-start" /></Button>
            {loading ? <Button type="button" variant="secondary" size="icon" onClick={() => stop()} aria-label="Interromper geração" title="Interromper"><Square data-icon="inline-start" /></Button> : <Button type="submit" size="icon" disabled={(!input.trim() && !pendingFiles.length) || isAddingAttachments || isStartingRecording || isRecording || isConvertingRecording} aria-label="Enviar mensagem" title="Enviar"><Send data-icon="inline-start" /></Button>}
          </div>
          <div className="mt-1.5 flex items-center justify-between px-1 text-[9px] text-slate-600"><span>Enter envia · Shift+Enter quebra linha · grave áudio ou anexe mídia até 6 MB</span><span>{activeModelInfo?.supportsTools ? 'Busca de conhecimento ativa' : 'Busca contextual automática'}</span></div>
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
