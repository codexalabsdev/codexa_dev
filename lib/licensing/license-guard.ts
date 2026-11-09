export type LicenseModule = {
  code: string
  name: string
  contracted: boolean
  enabled: boolean
  available: boolean
  licensed: boolean
}

export type LicenseValidation = {
  valid: boolean
  reason?: string | null
  expiresAt: string | null
  modules: LicenseModule[]
}

export type LicenseGuardOptions = {
  endpoint: string
  licenseKey: string
  cacheTtlMs?: number
  fetcher?: typeof fetch
}

export class LicenseServiceUnavailableError extends Error {
  constructor(message = 'O serviço de licenças está indisponível.') {
    super(message)
    this.name = 'LicenseServiceUnavailableError'
  }
}

export class LicensedModuleRequiredError extends Error {
  readonly moduleCode: string

  constructor(moduleCode: string) {
    super(`A licença não libera o módulo "${moduleCode}".`)
    this.name = 'LicensedModuleRequiredError'
    this.moduleCode = moduleCode
  }
}

function isLicenseModule(value: unknown): value is LicenseModule {
  if (!value || typeof value !== 'object') return false
  const module = value as Record<string, unknown>
  return typeof module.code === 'string'
    && typeof module.name === 'string'
    && typeof module.contracted === 'boolean'
    && typeof module.enabled === 'boolean'
    && typeof module.available === 'boolean'
    && typeof module.licensed === 'boolean'
}

export function createLicenseGuard(options: LicenseGuardOptions) {
  const requestedCacheTtlMs = options.cacheTtlMs ?? 30_000
  const cacheTtlMs = Number.isFinite(requestedCacheTtlMs)
    ? Math.max(0, Math.min(requestedCacheTtlMs, 300_000))
    : 30_000
  const fetcher = options.fetcher ?? fetch
  let cached: { expiresAt: number; result: LicenseValidation } | undefined

  async function check(): Promise<LicenseValidation> {
    if (!options.endpoint || !options.licenseKey) {
      throw new LicenseServiceUnavailableError('Configure o endpoint e a chave da licença no servidor.')
    }
    if (cached && cached.expiresAt > Date.now()) return cached.result

    let endpoint: URL
    try {
      endpoint = new URL(options.endpoint)
    } catch {
      throw new LicenseServiceUnavailableError('O endpoint de validação configurado é inválido.')
    }
    const isLocalEndpoint = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)
    if ((endpoint.protocol !== 'https:' && !(isLocalEndpoint && endpoint.protocol === 'http:'))
      || endpoint.username || endpoint.password || endpoint.hash) {
      throw new LicenseServiceUnavailableError('O endpoint de validação deve usar HTTPS.')
    }

    let response: Response
    try {
      response = await fetcher(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${options.licenseKey}` },
        cache: 'no-store',
        redirect: 'error',
      })
    } catch {
      throw new LicenseServiceUnavailableError()
    }

    let result: unknown
    try {
      result = await response.json()
    } catch {
      throw new LicenseServiceUnavailableError()
    }
    if (response.status >= 500 || !result || typeof result !== 'object') {
      throw new LicenseServiceUnavailableError()
    }
    const validation = result as Record<string, unknown>
    if (typeof validation.valid !== 'boolean'
      || !Array.isArray(validation.modules)
      || !validation.modules.every(isLicenseModule)
      || (validation.expiresAt !== null && typeof validation.expiresAt !== 'string')) {
      throw new LicenseServiceUnavailableError()
    }
    const parsedResult = result as LicenseValidation

    cached = { expiresAt: Date.now() + cacheTtlMs, result: parsedResult }
    return parsedResult
  }

  async function hasModule(moduleCode: string): Promise<boolean> {
    const result = await check()
    return result.valid && result.modules.some((module) => module.code === moduleCode && module.licensed)
  }

  async function requireModule(moduleCode: string): Promise<void> {
    if (!await hasModule(moduleCode)) throw new LicensedModuleRequiredError(moduleCode)
  }

  return { check, hasModule, requireModule }
}
