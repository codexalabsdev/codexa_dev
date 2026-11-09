import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { isModuleAvailable } from '@/lib/licensing/module-status'
import { createServiceClient } from '@/lib/supabase/admin-server'

export const runtime = 'nodejs'

function requestOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (origin) return origin
  const referer = request.headers.get('referer')
  try { return referer ? new URL(referer).origin : null } catch { return null }
}

function json(data: unknown, status = 200, origin: string | null = null) {
  const headers = new Headers({
    'Cache-Control': 'no-store, max-age=0',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Accept, Content-Type',
    Vary: 'Origin',
  })
  if (origin) headers.set('Access-Control-Allow-Origin', origin)
  return NextResponse.json(data, { status, headers })
}

export function OPTIONS(request: Request) {
  const origin = requestOrigin(request)
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Accept, Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  })
  if (origin) headers.set('Access-Control-Allow-Origin', origin)
  return new Response(null, { status: 204, headers })
}

function normalizedHostname(value: string | null) {
  if (!value) return null
  try {
    const candidate = value.includes('://') ? value : `https://${value}`
    const url = new URL(candidate)
    if (url.username || url.password || url.pathname !== '/' && url.pathname !== '') return null
    return url.hostname.toLowerCase().replace(/\.$/, '')
  } catch { return null }
}

function domainAllowed(allowedDomain: string | null, origin: string | null) {
  if (!allowedDomain || !origin) return false
  const allowed = normalizedHostname(allowedDomain)
  const actual = normalizedHostname(origin)
  if (!allowed || !actual) return false
  return actual === allowed || actual.endsWith(`.${allowed}`)
}

export async function POST(request: Request) {
  const origin = requestOrigin(request)
  const authorization = request.headers.get('authorization')
  const match = authorization?.match(/^Bearer\s+([\x21-\x7E]{16,256})$/)
  if (!match) return json({ valid: false, reason: 'invalid_key', expiresAt: null, modules: [] }, 401, origin)

  const forwardedIp = request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const ipHash = createHash('sha256').update(forwardedIp).digest('hex')

  let supabase
  try {
    supabase = createServiceClient()
  } catch (error) {
    console.error('License validation is not configured:', error instanceof Error ? error.message : error)
    return json({ error: 'Serviço de validação indisponível.' }, 503, origin)
  }

  const { data: withinLimit, error: rateLimitError } = await supabase.rpc('consume_license_validation_rate_limit', {
    p_key_hash: ipHash,
    p_limit: 60,
  })
  if (rateLimitError) {
    console.error('License validation rate limit failed:', rateLimitError.message)
    return json({ error: 'Serviço de validação indisponível.' }, 503, origin)
  }
  if (!withinLimit) return json({ error: 'Limite de validações excedido.' }, 429, origin)

  const presentedToken = match[1]
  const keyHash = createHash('sha256').update(presentedToken).digest('hex')
  let { data: license, error: licenseError } = await supabase
    .from('licenses')
    .select('id,system_id,status,is_active,expires_at,allowed_domain')
    .eq('license_key_hash', keyHash)
    .maybeSingle()
  if (!license && presentedToken.startsWith('cxi_')) {
    const integration = await supabase.from('license_integrations').select('license_id,status').eq('token_hash', keyHash).maybeSingle()
    if (integration.error) licenseError = integration.error
    if (integration.data?.status === 'revoked') return json({ valid: false, reason: 'integration_revoked', expiresAt: null, modules: [] }, 403, origin)
    if (integration.data?.license_id) {
      const integrationLicense = await supabase.from('licenses').select('id,system_id,status,is_active,expires_at,allowed_domain').eq('id', integration.data.license_id).maybeSingle()
      license = integrationLicense.data
      licenseError = integrationLicense.error
      if (license) await supabase.from('license_integrations').update({ status: 'connected', last_validation_at: new Date().toISOString(), last_validation_status: 'success', last_error: null, updated_at: new Date().toISOString() }).eq('license_id', license.id)
    }
  }
  if (licenseError) {
    console.error('License validation lookup failed:', licenseError.message)
    return json({ error: 'Serviço de validação indisponível.' }, 503, origin)
  }
  if (!license) return json({ valid: false, reason: 'invalid_key', expiresAt: null, modules: [] }, 401, origin)

  if (license.allowed_domain && origin && !domainAllowed(license.allowed_domain, origin)) {
    return json({ valid: false, reason: 'domain_not_allowed', expiresAt: license.expires_at, modules: [] }, 403, origin)
  }

  const normalizedStatus = typeof license.status === 'string' ? license.status.trim().toLowerCase() : ''
  const active = license.is_active === true && (normalizedStatus === 'active' || normalizedStatus === 'ativa')
  const expired = license.expires_at !== null && new Date(license.expires_at).getTime() <= Date.now()
  if (!active || expired) {
    return json({
      valid: false,
      reason: expired ? 'expired' : 'inactive',
      expiresAt: license.expires_at,
      modules: [],
    }, 200, origin)
  }

  const [{ data: modules, error: modulesError }, { data: entitlements, error: entitlementsError }] = await Promise.all([
    supabase.from('system_modules').select('id,name,internal_code,availability_status')
      .or(`system_id.eq.${license.system_id},system_id.is.null`),
    supabase.from('license_module_entitlements').select('system_module_id,is_contracted,is_enabled').eq('license_id', license.id),
  ])
  if (modulesError || entitlementsError) {
    console.error('License module validation failed:', modulesError?.message ?? entitlementsError?.message)
    return json({ error: 'Serviço de validação indisponível.' }, 503, origin)
  }

  const entitlementByModule = new Map((entitlements ?? []).map((item) => [item.system_module_id, item]))
  return json({
    valid: true,
    reason: null,
    expiresAt: license.expires_at,
    modules: (modules ?? []).map((module) => {
      const entitlement = entitlementByModule.get(module.id)
      const available = isModuleAvailable(module.availability_status)
      const contracted = entitlement?.is_contracted ?? false
      const enabled = entitlement?.is_enabled ?? false
      return {
        code: module.internal_code,
        name: module.name,
        contracted,
        enabled,
        available,
        licensed: contracted && enabled && available,
        actions: [],
      }
    }),
  }, 200, origin)
}
