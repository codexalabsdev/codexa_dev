import 'server-only'

import { createOpenAI } from '@ai-sdk/openai'

export const DEFAULT_OPENROUTER_MODEL = 'google/gemma-4-31b-it:free'
export const DEFAULT_EMBEDDING_MODEL = 'openai/text-embedding-3-small'
export const EMBEDDING_DIMENSIONS = 1536

const FEATURED_FREE_MODEL_IDS = [
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-3.5-super-vl:free',
  'cohere/north-mini-code:free',
  'dots-studio/dots-3-note-preview:free',
] as const
const featuredModelPriority = new Map<string, number>(FEATURED_FREE_MODEL_IDS.map((id, index) => [id, index]))

type RawModel = {
  id?: unknown
  name?: unknown
  context_length?: unknown
  architecture?: { input_modalities?: unknown; output_modalities?: unknown }
  pricing?: { prompt?: unknown; completion?: unknown }
  supported_parameters?: unknown
  supports_streaming?: unknown
}

export type OpenRouterChatModel = {
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

export class OpenRouterError extends Error {
  constructor(
    message: string,
    public readonly category: 'configuration' | 'authentication' | 'catalog' | 'upstream',
    public readonly statusCode?: number,
  ) {
    super(message)
    this.name = 'OpenRouterError'
  }
}

let catalogCache: { expiresAt: number; models: OpenRouterChatModel[] } | undefined
let catalogRequest: Promise<OpenRouterChatModel[]> | undefined

export function getOpenRouterApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY?.trim()
  if (!key) throw new OpenRouterError('OPENROUTER_API_KEY ausente.', 'configuration')
  return key
}

export function getDefaultOpenRouterModel(availableModelIds?: string[]): string {
  const configuredModel = process.env.OPENROUTER_MODEL?.trim()
  const preferredModel = configuredModel && featuredModelPriority.has(configuredModel)
    ? configuredModel
    : DEFAULT_OPENROUTER_MODEL

  if (!availableModelIds) return preferredModel
  if (availableModelIds.includes(preferredModel)) return preferredModel
  return availableModelIds.find((modelId) => featuredModelPriority.has(modelId)) ?? DEFAULT_OPENROUTER_MODEL
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function asFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

function mapModel(value: RawModel): OpenRouterChatModel | undefined {
  const id = asString(value.id)
  if (!id) return undefined

  const inputModalities = Array.isArray(value.architecture?.input_modalities)
    ? value.architecture.input_modalities.filter((item): item is string => typeof item === 'string')
    : []
  const outputModalities = Array.isArray(value.architecture?.output_modalities)
    ? value.architecture.output_modalities.filter((item): item is string => typeof item === 'string')
    : []
  if (!inputModalities.includes('text') || !outputModalities.includes('text')) return undefined

  const parameters = Array.isArray(value.supported_parameters)
    ? value.supported_parameters.filter((item): item is string => typeof item === 'string')
    : []
  const promptPrice = asFiniteNumber(value.pricing?.prompt)
  const completionPrice = asFiniteNumber(value.pricing?.completion)
  const pricingKnown = promptPrice !== null || completionPrice !== null
  const isFree = id.endsWith(':free') || (promptPrice === 0 && completionPrice === 0)

  return {
    id,
    name: asString(value.name) ?? id,
    provider: id.includes('/') ? id.split('/')[0] : 'OpenRouter',
    contextLength: asFiniteNumber(value.context_length),
    pricing: isFree ? 'free' : pricingKnown ? 'paid' : 'unknown',
    promptPricePerMillion: promptPrice === null ? null : promptPrice * 1_000_000,
    completionPricePerMillion: completionPrice === null ? null : completionPrice * 1_000_000,
    supportsTools: parameters.includes('tools'),
    supportsStructuredOutput: parameters.includes('response_format') || parameters.includes('structured_outputs'),
    supportsStreaming: typeof value.supports_streaming === 'boolean' ? value.supports_streaming : null,
  }
}

export async function getOpenRouterChatModels(): Promise<OpenRouterChatModel[]> {
  if (catalogCache && catalogCache.expiresAt > Date.now()) return catalogCache.models
  if (catalogRequest) return catalogRequest

  catalogRequest = (async () => {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${getOpenRouterApiKey()}` },
      signal: AbortSignal.timeout(12_000),
      cache: 'no-store',
    })

    if (response.status === 401 || response.status === 403) {
      throw new OpenRouterError('A autenticação da OpenRouter falhou.', 'authentication', response.status)
    }
    if (!response.ok) throw new OpenRouterError('Não foi possível consultar o catálogo de modelos.', 'catalog', response.status)

    const payload = await response.json() as { data?: RawModel[] }
    const models = (Array.isArray(payload.data) ? payload.data : [])
      .map(mapModel)
      .filter((model): model is OpenRouterChatModel => Boolean(model))
      .filter((model) => model.pricing === 'free' && featuredModelPriority.has(model.id))
      .sort((left, right) => (featuredModelPriority.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (featuredModelPriority.get(right.id) ?? Number.MAX_SAFE_INTEGER))

    if (!models.length) throw new OpenRouterError('O catálogo não retornou os modelos gratuitos selecionados.', 'catalog')
    catalogCache = { models, expiresAt: Date.now() + 5 * 60 * 1000 }
    return models
  })()

  try {
    return await catalogRequest
  } finally {
    catalogRequest = undefined
  }
}

function replaceRequestModel(body: BodyInit | null | undefined, modelId: string): BodyInit | null | undefined {
  if (typeof body !== 'string') return body
  try {
    const payload = JSON.parse(body) as Record<string, unknown>
    return JSON.stringify({ ...payload, model: modelId })
  } catch {
    return body
  }
}

function retryAfterMs(response: Response): number | undefined {
  const value = response.headers.get('retry-after')
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? undefined : Math.max(0, timestamp - Date.now())
}

function isRecoverableStatus(status: number): boolean {
  return [408, 429, 500, 502, 503, 504].includes(status)
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export function createOpenRouterFallbackFetch({
  requestedModel,
  fallbackModels,
  fallbackEnabled,
  requestId,
}: {
  requestedModel: string
  fallbackModels: string[]
  fallbackEnabled: boolean
  requestId: string
}) {
  let actualModel = requestedModel
  const chain = [requestedModel, ...(fallbackEnabled ? fallbackModels : [])].slice(0, 3)

  const fetchWithFallback = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let lastResponse: Response | undefined
    let lastError: unknown

    for (let modelIndex = 0; modelIndex < chain.length; modelIndex += 1) {
      const modelId = chain[modelIndex]
      const attempts = modelIndex === 0 ? 2 : 1

      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          const response = await fetch(input, {
            ...init,
            body: replaceRequestModel(init?.body, modelId),
          })
          if (response.ok) {
            actualModel = modelId
            return response
          }

          lastResponse = response
          console.warn('[Code-X] model_attempt_failed', {
            requestId,
            modelId,
            statusCode: response.status,
          })
          if (!isRecoverableStatus(response.status)) return response
          if (attempt === attempts - 1) break

          const retryAfter = retryAfterMs(response)
          if (retryAfter !== undefined && retryAfter > 15_000) break
          const jitter = 250 + Math.floor(Math.random() * 350) * (attempt + 1)
          await delay(retryAfter ?? jitter)
        } catch (error) {
          if (init?.signal?.aborted) throw error
          lastError = error
          console.warn('[Code-X] model_connection_failed', {
            requestId,
            modelId,
            errorName: error instanceof Error ? error.name : 'UnknownError',
          })
          if (attempt < attempts - 1) {
            await delay(250 + Math.floor(Math.random() * 350) * (attempt + 1))
          }
        }
      }
    }

    if (lastResponse) return lastResponse
    throw lastError instanceof Error ? lastError : new Error('Falha de conexão com a OpenRouter.')
  }

  return { fetch: fetchWithFallback, getActualModel: () => actualModel }
}

export function createOpenRouterProvider(fetch: typeof globalThis.fetch) {
  return createOpenAI({
    apiKey: getOpenRouterApiKey(),
    baseURL: 'https://openrouter.ai/api/v1',
    headers: {
      'HTTP-Referer': process.env.SITE_URL ?? 'https://codexa.dev',
      'X-Title': 'Code-X',
    },
    fetch,
  })
}
