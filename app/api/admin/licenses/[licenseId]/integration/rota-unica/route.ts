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
  return `export type CodexaModule = { code: string; name: string; contracted: boolean; enabled: boolean; available: boolean; licensed: boolean }\nexport type CodexaDecision = { valid: boolean; reason: string | null; expiresAt: string | null; modules: CodexaModule[] }\n\nexport async function getCodexaDecision(): Promise<CodexaDecision> {\n  const key = process.env.CODEXA_LICENSE_KEY\n  const apiUrl = process.env.CODEXA_LICENSE_API_URL ?? ${JSON.stringify(apiUrl)}\n  if (!key) return { valid: false, reason: 'CODEXA_LICENSE_KEY não configurada no servidor.', expiresAt: null, modules: [] }\n  try {\n    const response = await fetch(apiUrl, { method: 'POST', headers: { Authorization: \`Bearer \${key}\`, Accept: 'application/json' }, cache: 'no-store' })\n    if (!response.ok) {\n      const body = await response.text()\n      console.error('[codexa-license] validation failed', response.status, body)\n      return { valid: false, reason: \`Serviço de licenciamento retornou HTTP \${response.status}.\`, expiresAt: null, modules: [] }\n    }\n    const result = await response.json() as Partial<CodexaDecision>\n    return { valid: result.valid === true, reason: result.reason ?? null, expiresAt: result.expiresAt ?? null, modules: Array.isArray(result.modules) ? result.modules : [] }\n  } catch (error) {\n    console.error('[codexa-license] validation request failed', error)\n    return { valid: false, reason: 'Não foi possível consultar o serviço de licenciamento.', expiresAt: null, modules: [] }\n  }\n}\n`
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
    // Never derive the client license URL from request.url: in local development
    // that produces localhost and makes generated clients call the wrong app.
    const apiUrl = process.env.CODEXA_LICENSE_API_URL ?? 'https://gestao-de-software-house.vercel.app/api/licenses/validate'
    const zip = new JSZip()
    zip.file('codexa-integration/lib/codexa-license.ts', licenseSource(apiUrl))
    zip.file('codexa-integration/app/admin/page.tsx', generatePageWrapper(generated.analysis.mappings))
    zip.file('codexa-integration/app/admin/AdminClient.tsx', generated.source)
    const manifest = { mode: 'single-route', framework: 'Next.js / TypeScript', files: ['lib/codexa-license.ts', 'app/admin/page.tsx', 'app/admin/AdminClient.tsx', 'INSTALL.md'], detectedTabs: generated.analysis.tabs, confirmedMappings: generated.analysis.mappings, warnings: generated.analysis.warnings }
    zip.file('codexa-integration/manifest.json', JSON.stringify(manifest, null, 2))
    zip.file('codexa-integration/INSTALL.md', `# Integração Codexa — rota única\n\nEste pacote protege a área administrativa do sistema cliente com uma única consulta ao serviço de licenciamento Codexa.\n\n## Arquivos e destinos\n\nExtraia o ZIP e copie o conteúdo da pasta codexa-integration/ para a raiz do projeto Next.js cliente, mantendo exatamente estes caminhos:\n\n- \`lib/codexa-license.ts\`: biblioteca obrigatória de validação server-side. Não mova para \`public\` e não importe em componentes client.\n- \`app/admin/page.tsx\`: página server-side obrigatória. Ela consulta a licença antes de renderizar o painel.\n- \`app/admin/AdminClient.tsx\`: painel client-side gerado a partir do código enviado. Substitua o arquivo original somente depois de revisar o diff.\n- \`INSTALL.md\`: este guia; não é necessário para o runtime.\n- \`manifest.json\`: relatório da análise; também não é necessário para o runtime.\n\nSe o projeto já tiver \`app/admin/page.tsx\` ou \`AdminClient.tsx\`, faça merge manualmente e preserve as regras de negócio existentes. Não duplique as rotas.\n\n## O que é obrigatório\n\n- \`lib/codexa-license.ts\`, \`app/admin/page.tsx\` e \`app/admin/AdminClient.tsx\` são obrigatórios para usar o pacote completo.\n- \`CODEXA_LICENSE_KEY\` é obrigatória e deve ser o token de integração completo que começa com \`cxi_\`, exibido como “Token server-to-server” ao preparar a integração. Não use a chave que começa com \`cx-\`: ela é a chave da licença/script visual, não o token deste pacote.\n- O script/arquivo JavaScript gerado com a licença **não deve ser incluído em \`public\` nem carregado por \`<script src>\`**. A validação ocorre no Server Component através de \`codexa-license.ts\`.\n- O JSON de mapeamento é opcional. Se estiver vazio ou parcial, o pacote ainda é gerado; somente abas mapeadas recebem bloqueio automático.\n- O gerador adiciona \`allowedModules\`, \`CODEXA_TAB_MAPPING\` e uma guarda para o estado de aba ativa. Ao desmarcar um módulo, o conteúdo dessa aba deixa de ser renderizado. Para esconder também o botão da navegação, use \`codexaCanUseModule(allowedModules, 'codigo-do-modulo')\` na lista de menus.\n\n## Variáveis de ambiente\n\nConfigure no servidor do cliente (Development, Preview e Production conforme necessário):\n\n\`CODEXA_LICENSE_KEY=${'${CODEXA_LICENSE_KEY}'}\`\n\`CODEXA_LICENSE_API_URL=${apiUrl}\`\n\nEsta variável deve conter **exatamente** a URL acima, incluindo \`https://\` e o caminho \`/api/licenses/validate\`. Não coloque o token nessa variável. Não use uma URL relativa como \`/api/licenses/validate\` e não remova o caminho.\n\n\`CODEXA_LICENSE_API_URL\` só deve ser alterada se a Codexa fornecer outro endpoint oficial. Nunca use \`NEXT_PUBLIC_\` na chave: ela não pode chegar ao navegador.\n\nDepois de configurar as variáveis, reinicie o servidor/build do cliente.\n\n## Fluxo de validação\n\n1. \`app/admin/page.tsx\` chama \`getCodexaDecision()\` no servidor.\n2. \`codexa-license.ts\` envia \`Authorization: Bearer <CODEXA_LICENSE_KEY>\` para \`CODEXA_LICENSE_API_URL\`.\n3. O serviço verifica validade, domínio e módulos contratados.\n4. Somente então \`AdminClient.tsx\` é renderizado com \`allowedModules\`.\n\nSe a página mostrar “Serviço de licenciamento indisponível”, abra Network e confirme que a requisição POST está indo para o domínio Codexa informado em \`CODEXA_LICENSE_API_URL\`, e não para \`/api/licenses/validate\` relativo ao cliente.\n\n## Segurança\n\nO bloqueio de interface e navegação não substitui autorização de APIs, RLS ou validação das operações no backend do cliente.\n\nAbas detectadas: ${generated.analysis.tabs.join(', ') || 'nenhuma'}\nCompatibilidade estimada: ${generated.analysis.compatibility}%\nMapeamentos automáticos incluídos: ${JSON.stringify(generated.analysis.mappings)}\n`)
    const body = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
    return new NextResponse(body as BodyInit, { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="codexa-integration-rota-unica.zip"', 'Cache-Control': 'no-store' } })
  } catch (error) { return errorResponse(error) }
}
