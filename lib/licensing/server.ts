import 'server-only'

export type LicensedModule = {
  code: string
  name: string
  contracted: boolean
  enabled: boolean
  available: boolean
  licensed: boolean
  actions?: string[]
}

export type LicenseDecision = {
  valid: boolean
  reason: string | null
  expiresAt: string | null
  modules: LicensedModule[]
}

export type RequireLicensedModuleOptions = {
  module: string
  action?: string
  request?: Request
  ttlSeconds?: number
}

export class LicenseAuthorizationError extends Error {
  readonly status: 401 | 403 | 503
  readonly reason: string

  constructor(status: 401 | 403 | 503, reason: string) {
    super(reason)
    this.name = 'LicenseAuthorizationError'
    this.status = status
    this.reason = reason
  }
}

type CacheEntry = { expiresAt: number; decision: LicenseDecision }

const cache = new Map<string, CacheEntry>()

function config() {
  const apiUrl = process.env.CODEXA_LICENSE_API_URL?.trim()
  const licenseKey = process.env.CODEXA_LICENSE_KEY?.trim()
  if (!apiUrl || !licenseKey) throw new LicenseAuthorizationError(503, 'license_not_configured')
  return {
    apiUrl,
    licenseKey,
    timeoutMs: Math.max(1000, Number(process.env.CODEXA_LICENSE_TIMEOUT_MS ?? 5000)),
    ttlSeconds: Math.min(300, Math.max(60, Number(process.env.CODEXA_LICENSE_CACHE_TTL_SECONDS ?? 120))),
  }
}

function originHeaders(request?: Request): Record<string, string> {
  const origin = request?.headers.get('origin')
  return origin ? { Origin: origin } : {}
}

async function fetchDecision(request?: Request, ttlSeconds?: number): Promise<LicenseDecision> {
  const settings = config()
  const cacheKey = `${settings.apiUrl}:${settings.licenseKey}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.decision

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), settings.timeoutMs)
  try {
    const response = await fetch(settings.apiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${settings.licenseKey}`, Accept: 'application/json', ...originHeaders(request) },
      cache: 'no-store',
      signal: controller.signal,
    })
    const body = await response.json().catch(() => null) as Partial<LicenseDecision> | null
    if (!response.ok && response.status !== 200) {
      if (response.status === 401) throw new LicenseAuthorizationError(401, 'invalid_license')
      if (response.status === 403) throw new LicenseAuthorizationError(403, String(body?.reason ?? 'license_forbidden'))
      throw new LicenseAuthorizationError(503, 'license_service_unavailable')
    }
    if (!body || typeof body.valid !== 'boolean' || !Array.isArray(body.modules)) {
      throw new LicenseAuthorizationError(503, 'invalid_license_response')
    }
    const decision: LicenseDecision = {
      valid: body.valid,
      reason: typeof body.reason === 'string' ? body.reason : null,
      expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : null,
      modules: body.modules.filter((module): module is LicensedModule => Boolean(module && typeof module.code === 'string' && typeof module.licensed === 'boolean')),
    }
    if (decision.valid) cache.set(cacheKey, { decision, expiresAt: Date.now() + (ttlSeconds ?? settings.ttlSeconds) * 1000 })
    else cache.delete(cacheKey)
    return decision
  } catch (error) {
    if (error instanceof LicenseAuthorizationError) throw error
    throw new LicenseAuthorizationError(503, 'license_service_unavailable')
  } finally {
    clearTimeout(timeout)
  }
}

export async function getLicenseDecision(request?: Request, options?: { ttlSeconds?: number }) {
  return fetchDecision(request, options?.ttlSeconds)
}

export async function requireLicensedModule(options: RequireLicensedModuleOptions) {
  const decision = await fetchDecision(options.request, options.ttlSeconds)
  if (!decision.valid) throw new LicenseAuthorizationError(403, decision.reason ?? 'license_inactive')
  const module = decision.modules.find((item) => item.code === options.module)
  if (!module?.licensed) throw new LicenseAuthorizationError(403, 'module_not_licensed')
  return { decision, module, action: options.action ?? null }
}

export function clearLicenseCache() {
  cache.clear()
}
