import { NextResponse } from 'next/server'
import { requireWorkspacePermission, AdminApiError } from '@/lib/supabase/admin-server'
import { buildMiddlewareSource } from '@/lib/licensing/middleware-generator'

function fail(error: unknown) { return error instanceof AdminApiError ? NextResponse.json({ error: error.message }, { status: error.status }) : NextResponse.json({ error: 'Não foi possível processar as rotas.' }, { status: 500 }) }

export async function GET(_request: Request, context: { params: Promise<{ licenseId: string }> }) {
  try {
    const { licenseId } = await context.params
    const { supabase } = await requireWorkspacePermission('licenses', 'view')
    const { data, error } = await supabase.from('license_route_mappings').select('id,license_id,system_module_id,route_pattern,blocked_path,system_modules!inner(name,internal_code,system_id)').eq('license_id', licenseId).order('route_pattern')
    if (error) throw error
    return NextResponse.json({ routes: (data ?? []).map((route) => ({ ...route, system_modules: Array.isArray(route.system_modules) ? route.system_modules[0] : route.system_modules })) })
  } catch (error) { return fail(error) }
}

export async function POST(request: Request, context: { params: Promise<{ licenseId: string }> }) {
  try {
    const { licenseId } = await context.params
    const body = await request.json() as { moduleId?: string; routePattern?: string; blockedPath?: string }
    const { supabase } = await requireWorkspacePermission('licenses', 'manage_licenses')
    const { data: license, error: licenseError } = await supabase.from('licenses').select('id,system_id').eq('id', licenseId).maybeSingle()
    if (licenseError) throw licenseError
    if (!license) return NextResponse.json({ error: 'Licença não encontrada.' }, { status: 404 })
    const { data: module, error: moduleError } = await supabase.from('system_modules').select('id,system_id,internal_code').eq('id', body.moduleId ?? '').maybeSingle()
    if (moduleError) throw moduleError
    if (!module || module.system_id !== license.system_id) return NextResponse.json({ error: 'O módulo não pertence ao sistema da licença.' }, { status: 400 })
    const pattern = String(body.routePattern ?? '').trim()
    const blockedPath = String(body.blockedPath ?? '/acesso-bloqueado').trim()
    buildMiddlewareSource([{ pattern, module: module.internal_code, blockedPath }], 'https://invalid.local')
    const { data, error } = await supabase.from('license_route_mappings').insert({ license_id: licenseId, system_module_id: module.id, route_pattern: pattern, blocked_path: blockedPath }).select('id,license_id,system_module_id,route_pattern,blocked_path').single()
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'Esta rota já está configurada para a licença.' : error.message }, { status: error.code === '23505' ? 409 : 500 })
    return NextResponse.json({ route: data }, { status: 201 })
  } catch (error) { return fail(error) }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Identificador da rota é obrigatório.' }, { status: 400 })
    const { supabase } = await requireWorkspacePermission('licenses', 'manage_licenses')
    const { error } = await supabase.from('license_route_mappings').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) { return fail(error) }
}
