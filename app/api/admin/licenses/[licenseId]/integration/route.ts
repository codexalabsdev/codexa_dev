import { createHash, randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { AdminApiError, requireWorkspacePermission } from '@/lib/supabase/admin-server'

function errorResponse(error: unknown) {
  if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error('License integration request failed:', error)
  return NextResponse.json({ error: 'Não foi possível preparar a integração.' }, { status: 500 })
}

export async function GET(_request: Request, context: { params: Promise<{ licenseId: string }> }) {
  try {
    const { licenseId } = await context.params
    const { supabase } = await requireWorkspacePermission('licenses', 'view')
    const { data, error } = await supabase.from('license_integrations').select('id,license_id,installation_id,project_type,sdk_version,status,last_validation_at,last_validation_status,last_error,created_at,updated_at').eq('license_id', licenseId).maybeSingle()
    if (error) return errorResponse(error)
    return NextResponse.json({ integration: data })
  } catch (error) { return errorResponse(error) }
}

export async function POST(_request: Request, context: { params: Promise<{ licenseId: string }> }) {
  try {
    const { licenseId } = await context.params
    const { actorId, supabase } = await requireWorkspacePermission('licenses', 'manage_licenses')
    const { data: license, error: licenseError } = await supabase.from('licenses').select('id').eq('id', licenseId).maybeSingle()
    if (licenseError) return errorResponse(licenseError)
    if (!license) return NextResponse.json({ error: 'Licença não encontrada.' }, { status: 404 })
    const token = `cxi_${randomBytes(32).toString('base64url')}`
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const installationId = `inst_${randomBytes(12).toString('hex')}`
    const { data: integration, error } = await supabase.from('license_integrations').upsert({ license_id: licenseId, installation_id: installationId, token_hash: tokenHash, status: 'awaiting_installation', project_type: 'nextjs-supabase', sdk_version: '0.1.0', last_error: null }, { onConflict: 'license_id' }).select('id,license_id,installation_id,project_type,sdk_version,status,created_at').single()
    if (error) return errorResponse(error)
    await supabase.from('admin_audit_events').insert({ actor_id: actorId, action_name: 'license.integration_prepared', entity_type: 'license', entity_id: licenseId, result: 'success' })
    return NextResponse.json({
      integration,
      integrationToken: token,
      manifest: {
        schemaVersion: '1.0',
        projectType: 'nextjs-supabase',
        sdkVersion: '0.1.0',
        apiUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/licenses/validate`,
        installationId,
        environment: { CODEXA_LICENSE_API_URL: 'https://SEU_PAINEL/api/licenses/validate', CODEXA_LICENSE_KEY: '<configure-no-servidor>' },
        requiredBackendChange: 'Chamar requireLicensedModule antes de cada operação protegida.',
      },
      warning: 'Guarde o token agora. Ele não será exibido novamente.',
    }, { status: 201 })
  } catch (error) { return errorResponse(error) }
}
