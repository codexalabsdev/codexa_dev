import JSZip from 'jszip'
import { NextResponse } from 'next/server'
import { requireWorkspacePermission, AdminApiError } from '@/lib/supabase/admin-server'
import { analyzeAdminClient, generatePageWrapper, generateRotaUnicaIntegration, type IntegrationModule, type TabMapping } from '@/lib/licensing/rota-unica-generator'

function errorResponse(error: unknown) {
  if (error instanceof AdminApiError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error('Rota única integration failed:', error)
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível gerar a integração.' }, { status: 422 })
}

function licenseSource(apiUrl: string) {
  return `export type CodexaModule = { code: string; name: string; contracted: boolean; enabled: boolean; available: boolean; licensed: boolean }\nexport type CodexaDecision = { valid: boolean; reason: string | null; expiresAt: string | null; modules: CodexaModule[] }\nconst apiUrl = process.env.CODEXA_LICENSE_API_URL ?? ${JSON.stringify(apiUrl)}\nexport async function getCodexaDecision(): Promise<CodexaDecision> {\n  const key = process.env.CODEXA_LICENSE_KEY\n  if (!key) return { valid: false, reason: 'CODEXA_LICENSE_KEY não configurada.', expiresAt: null, modules: [] }\n  try {\n    const response = await fetch(apiUrl, { method: 'POST', headers: { Authorization: \`Bearer \${key}\`, Accept: 'application/json' }, cache: 'no-store' })\n    if (!response.ok) return { valid: false, reason: 'Serviço de licenciamento indisponível.', expiresAt: null, modules: [] }\n    const result = await response.json() as Partial<CodexaDecision>\n    return { valid: result.valid === true, reason: result.reason ?? null, expiresAt: result.expiresAt ?? null, modules: Array.isArray(result.modules) ? result.modules : [] }\n  } catch { return { valid: false, reason: 'Não foi possível consultar o serviço de licenciamento.', expiresAt: null, modules: [] } }\n}\n`
}

export async function POST(request: Request, context: { params: Promise<{ licenseId: string }> }) {
  try {
    const { licenseId } = await context.params
    const { supabase } = await requireWorkspacePermission('licenses', 'manage_licenses')
    const form = await request.formData()
    const originalCode = String(form.get('originalCode') ?? '')
    if (!originalCode.trim()) throw new Error('Envie o código original de AdminClient.tsx.')
    const mappingText = String(form.get('mapping') ?? '').trim()
    let mapping: TabMapping[] | undefined
    if (mappingText) {
      let parsed: unknown
      try { parsed = JSON.parse(mappingText) } catch { throw new Error('O mapeamento precisa ser um JSON válido.') }
      if (!Array.isArray(parsed)) throw new Error('O mapeamento precisa ser uma lista JSON de objetos com tab e code.')
      mapping = parsed as TabMapping[]
    }
    const { data: license, error: licenseError } = await supabase.from('licenses').select('system_id').eq('id', licenseId).single()
    if (licenseError || !license) throw new Error('Licença não encontrada.')
    const { data: modules, error: modulesError } = await supabase.from('system_modules').select('internal_code,name').eq('system_id', license.system_id).order('internal_code')
    if (modulesError) throw modulesError
    const integrationModules: IntegrationModule[] = (modules ?? []).map((module) => ({ code: module.internal_code, name: module.name }))
    const analysis = analyzeAdminClient(originalCode, integrationModules)
    if (form.get('analyze') === 'true') return NextResponse.json({ analysis })
    const generated = generateRotaUnicaIntegration(originalCode, integrationModules, mapping)
    const apiUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/licenses/validate`
    const zip = new JSZip()
    zip.file('codexa-integration/lib/codexa-license.ts', licenseSource(apiUrl))
    zip.file('codexa-integration/app/admin/page.tsx', generatePageWrapper())
    zip.file('codexa-integration/app/admin/AdminClient.tsx', generated.source)
    const manifest = { mode: 'single-route', framework: 'Next.js / TypeScript', files: ['lib/codexa-license.ts', 'app/admin/page.tsx', 'app/admin/AdminClient.tsx', 'INSTALL.md'], detectedTabs: generated.analysis.tabs, confirmedMappings: generated.analysis.mappings, warnings: generated.analysis.warnings }
    zip.file('codexa-integration/manifest.json', JSON.stringify(manifest, null, 2))
    zip.file('codexa-integration/INSTALL.md', `# Integração Codexa — rota única\n\nO pacote foi gerado a partir do código fornecido e validado sintaticamente.\n\n## Instalação\n\n1. Extraia na raiz do projeto e preserve os caminhos do manifest.json.\n2. Revise os arquivos listados antes de substituir qualquer arquivo existente.\n3. Configure no servidor:\n\nCODEXA_LICENSE_API_URL=${apiUrl}\nCODEXA_LICENSE_KEY=\n\nA chave nunca deve usar o prefixo NEXT_PUBLIC_.\n\n## Limites de segurança\n\nO bloqueio de interface e navegação não substitui autorização de APIs, RLS ou validação de operações no backend.\n\nAbas detectadas: ${generated.analysis.tabs.join(', ')}\nMapeamentos confirmados: ${JSON.stringify(generated.analysis.mappings)}\n`)
    const body = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
    return new NextResponse(body as BodyInit, { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="codexa-integration-rota-unica.zip"', 'Cache-Control': 'no-store' } })
  } catch (error) { return errorResponse(error) }
}
