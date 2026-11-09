import { NextResponse } from 'next/server'
import { AdminApiError, requireWorkspacePermission } from '@/lib/supabase/admin-server'

export async function GET(_request: Request, context: { params: Promise<{ licenseId: string }> }) {
  try {
    const { licenseId } = await context.params
    const { supabase } = await requireWorkspacePermission('licenses', 'view')
    const [{ data: license }, { data: modules, error }] = await Promise.all([
      supabase.from('licenses').select('id,system_id').eq('id', licenseId).maybeSingle(),
      supabase.from('license_module_entitlements').select('system_module_id,system_modules!inner(name,internal_code,system_id)').eq('license_id', licenseId),
    ])
    if (error) throw error
    if (!license) return NextResponse.json({ error: 'Licença não encontrada.' }, { status: 404 })
    const validModules = (modules ?? []).map((item) => ({ ...item, module: Array.isArray(item.system_modules) ? item.system_modules[0] : item.system_modules })).filter((item) => item.module?.system_id === license.system_id).map((item) => ({ name: item.module.name, code: item.module.internal_code }))
    if (!validModules.length) return NextResponse.json({ error: 'Nenhum módulo associado a esta licença.' }, { status: 400 })
    const source = `import 'server-only'\n\nimport { getLicenseDecision, requireLicensedModule } from '@/lib/licensing/server'\n\nexport const CODEXA_MODULES = ${JSON.stringify(validModules, null, 2)} as const\n\nexport async function getCodexaModuleAccess() {\n  const decision = await getLicenseDecision()\n  return Object.fromEntries(CODEXA_MODULES.map((module) => {\n    const remote = decision.modules.find((item) => item.code === module.code)\n    return [module.code, { ...module, allowed: decision.valid && remote?.licensed === true, reason: decision.valid ? (remote?.licensed ? null : 'module_not_licensed') : decision.reason }]\n  })) as Record<string, { name: string; code: string; allowed: boolean; reason: string | null }>\n}\n\nexport { requireLicensedModule }\n`
    return NextResponse.json({ source, moduleCount: validModules.length, fileName: 'codexa-license.ts' })
  } catch (error) {
    if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'Não foi possível gerar a integração de rota única.' }, { status: 500 })
  }
}
