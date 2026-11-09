import { NextResponse } from 'next/server'
import { requireWorkspacePermission, AdminApiError } from '@/lib/supabase/admin-server'
import { buildMiddlewareSource } from '@/lib/licensing/middleware-generator'

export async function GET(_request: Request, context: { params: Promise<{ licenseId: string }> }) {
  try {
    const { licenseId } = await context.params
    const { supabase } = await requireWorkspacePermission('licenses', 'view')
    const [{ data: license, error: licenseError }, { data: routes, error: routesError }] = await Promise.all([
      supabase.from('licenses').select('id,system_id').eq('id', licenseId).maybeSingle(),
      supabase.from('license_route_mappings').select('route_pattern,blocked_path,system_module_id,system_modules!inner(internal_code,system_id)').eq('license_id', licenseId).order('route_pattern'),
    ])
    if (licenseError) throw licenseError
    if (routesError) throw routesError
    if (!license) return NextResponse.json({ error: 'Licença não encontrada.' }, { status: 404 })
    const validRoutes = (routes ?? []).map((route) => ({ ...route, moduleRecord: Array.isArray(route.system_modules) ? route.system_modules[0] : route.system_modules })).filter((route) => route.moduleRecord?.system_id === license.system_id).map((route) => ({ pattern: route.route_pattern, module: route.moduleRecord.internal_code, blockedPath: route.blocked_path }))
    const source = buildMiddlewareSource(validRoutes, `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/licenses/validate`)
    return NextResponse.json({ source, routeCount: validRoutes.length, generatedAt: new Date().toISOString(), warning: validRoutes.length ? null : 'Nenhuma rota protegida foi configurada para esta licença. Cadastre rotas associadas aos módulos do sistema.' })
  } catch (error) {
    if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'Não foi possível gerar o middleware.' }, { status: 500 })
  }
}
