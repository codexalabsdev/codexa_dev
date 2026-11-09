import { NextResponse } from 'next/server'
import { AdminApiError, requireWorkspacePermission } from '@/lib/supabase/admin-server'

type EntitlementUpdate = { contracted?: unknown; enabled?: unknown }

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function responseError(error: unknown) {
  if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error('License module entitlement update failed:', error)
  return NextResponse.json({ error: 'Não foi possível atualizar o módulo da licença.' }, { status: 500 })
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ licenseId: string; moduleId: string }> },
) {
  let body: EntitlementUpdate
  try {
    body = await request.json() as EntitlementUpdate
  } catch {
    return NextResponse.json({ error: 'Corpo da solicitação inválido.' }, { status: 400 })
  }
  if (typeof body.contracted !== 'boolean' || typeof body.enabled !== 'boolean'
    || (body.enabled && !body.contracted)) {
    return NextResponse.json({ error: 'Contratação ou liberação de módulo inválida.' }, { status: 400 })
  }

  try {
    const { licenseId, moduleId } = await context.params
    if (!uuidPattern.test(licenseId) || !uuidPattern.test(moduleId)) {
      return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400 })
    }
    const { actorId, supabase } = await requireWorkspacePermission('licenses', 'release_modules')
    const [{ data: license, error: licenseError }, { data: module, error: moduleError }] = await Promise.all([
      supabase.from('licenses').select('id,system_id').eq('id', licenseId).maybeSingle(),
      supabase.from('system_modules').select('id,system_id').eq('id', moduleId).maybeSingle(),
    ])
    if (licenseError || moduleError) return responseError(licenseError ?? moduleError)
    if (!license || !module) return NextResponse.json({ error: 'Licença ou módulo não encontrado.' }, { status: 404 })
    if (module.system_id !== null && module.system_id !== license.system_id) {
      return NextResponse.json({ error: 'O módulo não pertence ao sistema desta licença.' }, { status: 400 })
    }

    const { data: entitlement, error: upsertError } = await supabase
      .from('license_module_entitlements')
      .upsert({
        license_id: license.id,
        system_module_id: module.id,
        is_contracted: body.contracted,
        is_enabled: body.enabled,
        updated_by: actorId,
        updated_at: new Date().toISOString(),
      })
      .select('license_id,system_module_id,is_contracted,is_enabled')
      .single()
    if (upsertError || !entitlement) {
      if (upsertError) return responseError(upsertError)
      return responseError(new Error('Entitlement upsert returned no row'))
    }

    const { error: auditError } = await supabase.from('admin_audit_events').insert({
      actor_id: actorId,
      action_name: 'license.module_updated',
      entity_type: 'license',
      entity_id: license.id,
      result: 'success',
    })
    if (auditError) console.error('License module audit write failed:', auditError.message)

    return NextResponse.json({
      entitlement,
      warning: auditError ? 'Módulo atualizado, mas o evento de auditoria não foi salvo.' : null,
    })
  } catch (error) {
    return responseError(error)
  }
}
