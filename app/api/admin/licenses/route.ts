import { createHash, randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { AdminApiError, requireWorkspacePermission } from '@/lib/supabase/admin-server'

type LicenseInput = {
  clientId?: unknown
  systemId?: unknown
  expiresAt?: unknown
  allowedDomain?: unknown
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function responseError(error: unknown) {
  if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error('License administration request failed:', error)
  return NextResponse.json({ error: 'Não foi possível concluir a operação de licenças.' }, { status: 500 })
}

function expirationDate(value: unknown): string | null | undefined {
  if (value === null || value === '') return null
  if (typeof value !== 'string') return undefined
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T23:59:59.999Z`) : new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

export async function GET() {
  try {
    const actor = await requireWorkspacePermission('licenses', 'view')
    let clientsQuery = actor.supabase.from('clients').select('id,legal_name,trade_name,owner_id').order('trade_name').limit(1000)
    if (actor.roleName === 'Relacionamento') {
      clientsQuery = clientsQuery.in('owner_id', [actor.actorId, actor.memberId])
    }
    const [clientsResult, systemsResult, modulesResult, licensesResult, entitlementsResult] = await Promise.all([
      clientsQuery,
      actor.supabase.from('systems').select('id,name,client_id').order('name').limit(1000),
      actor.supabase.from('system_modules').select('id,system_id,name,internal_code,availability_status').order('name').limit(1000),
      actor.supabase.from('licenses').select('id,client_id,system_id,status,expires_at,allowed_domain,created_at,plan_id,contract_id').order('created_at', { ascending: false }).limit(1000),
      actor.supabase.from('license_module_entitlements').select('license_id,system_module_id,is_contracted,is_enabled'),
    ])
    const error = clientsResult.error ?? systemsResult.error ?? modulesResult.error ?? licensesResult.error ?? entitlementsResult.error
    if (error) {
      console.error('License administration data load failed:', error.message)
      return NextResponse.json({ error: 'Não foi possível carregar o catálogo de licenças. Verifique se a migração foi aplicada.' }, { status: 503 })
    }

    const ownedClientIds = new Set((clientsResult.data ?? []).map((client) => client.id))
    const visibleSystems = (systemsResult.data ?? []).filter((system) =>
      actor.roleName !== 'Relacionamento' || (system.client_id !== null && ownedClientIds.has(system.client_id)),
    )
    const visibleLicenses = (licensesResult.data ?? []).filter((license) =>
      actor.roleName !== 'Relacionamento' || ownedClientIds.has(license.client_id),
    )
    const visibleLicenseIds = new Set(visibleLicenses.map((license) => license.id))
    const clients = (clientsResult.data ?? []).map((client) => ({
      id: client.id,
      name: client.trade_name || client.legal_name,
    }))
    const systems = visibleSystems
    const allModules = (modulesResult.data ?? []).filter((module) =>
      actor.roleName !== 'Relacionamento' || systems.some((system) => system.id === module.system_id),
    )
    const entitlements = (entitlementsResult.data ?? []).filter((item) => visibleLicenseIds.has(item.license_id))
    const licenses = visibleLicenses.map((license) => {
      const systemModules = allModules.filter((module) => module.system_id === license.system_id || module.system_id === null)
      return {
        ...license,
        modules: systemModules.map((module) => {
          const entitlement = entitlements.find((item) =>
            item.license_id === license.id && item.system_module_id === module.id,
          )
          return {
            ...module,
            is_contracted: entitlement?.is_contracted ?? false,
            is_enabled: entitlement?.is_enabled ?? false,
          }
        }),
      }
    })

    return NextResponse.json({ clients, systems, licenses })
  } catch (error) {
    return responseError(error)
  }
}

export async function POST(request: Request) {
  let body: LicenseInput
  try {
    body = await request.json() as LicenseInput
  } catch {
    return NextResponse.json({ error: 'Corpo da solicitação inválido.' }, { status: 400 })
  }

  if (typeof body.clientId !== 'string' || !uuidPattern.test(body.clientId)
    || typeof body.systemId !== 'string' || !uuidPattern.test(body.systemId)) {
    return NextResponse.json({ error: 'Selecione um cliente e um sistema válidos.' }, { status: 400 })
  }
  const expiresAt = expirationDate(body.expiresAt)
  if (expiresAt === undefined) return NextResponse.json({ error: 'Data de expiração inválida.' }, { status: 400 })
  const allowedDomain = typeof body.allowedDomain === 'string' && body.allowedDomain.trim() ? body.allowedDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '') : null
  if (allowedDomain && (allowedDomain.includes('/') || allowedDomain.includes(':') || /\s/.test(allowedDomain))) return NextResponse.json({ error: 'Domínio autorizado inválido.' }, { status: 400 })

  try {
    const { actorId, supabase } = await requireWorkspacePermission('licenses', 'manage_licenses')
    const { data: system, error: systemError } = await supabase
      .from('systems')
      .select('id,client_id,plan_id,contract_id')
      .eq('id', body.systemId)
      .maybeSingle()
    if (systemError) return responseError(systemError)
    if (!system || (system.client_id && system.client_id !== body.clientId)) {
      return NextResponse.json({ error: 'O sistema não pertence ao cliente selecionado.' }, { status: 400 })
    }

    const licenseKey = `cx-${randomBytes(32).toString('base64url')}`
    const licenseKeyHash = createHash('sha256').update(licenseKey).digest('hex')
    const { data: license, error: insertError } = await supabase
      .from('licenses')
      .insert({
        client_id: body.clientId,
        system_id: body.systemId,
        plan_id: system.plan_id,
        contract_id: system.contract_id,
        status: 'active',
        is_active: true,
        expires_at: expiresAt,
        allowed_domain: allowedDomain,
        license_key: null,
        license_key_hash: licenseKeyHash,
      })
      .select('id,client_id,system_id,status,expires_at,allowed_domain,created_at,plan_id,contract_id')
      .single()
    if (insertError || !license) {
      if (insertError) return responseError(insertError)
      return responseError(new Error('License insert returned no row'))
    }

    const { error: auditError } = await supabase.from('admin_audit_events').insert({
      actor_id: actorId,
      action_name: 'license.created',
      entity_type: 'license',
      entity_id: license.id,
      result: 'success',
    })
    if (auditError) console.error('License creation audit write failed:', auditError.message)

    return NextResponse.json({
      license,
      licenseKey,
      warning: auditError ? 'Licença criada, mas o evento de auditoria não foi salvo.' : null,
    }, { status: 201 })
  } catch (error) {
    return responseError(error)
  }
}
