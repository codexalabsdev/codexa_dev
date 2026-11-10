import { parse } from '@babel/parser'
import traverse, { type NodePath } from '@babel/traverse'
import generate from '@babel/generator'
import * as t from '@babel/types'

export type IntegrationModule = { code: string; name: string }
export type TabMapping = { code: string; tab: string }

export type DetectedTab = {
  tab: string
  code: string
  confidence: number
  hasContent: boolean
  hasTrigger: boolean
  navigationElements: string[]
  contentEvidence: string[]
  functionalities: string[]
  dependencies: string[]
}

export type RotaUnicaAnalysis = {
  stateName: string
  tabs: string[]
  detectedTabs: DetectedTab[]
  mappings: TabMapping[]
  sharedComponents: string[]
  warnings: string[]
  uncertain: string[]
  requiresConfirmation: boolean
  compatibility: number
}

function unique(values: string[]) { return [...new Set(values)] }

const NON_MODULE_VALUES = new Set([
  'loading', 'loaded', 'error', 'idle', 'open', 'closed', 'true', 'false', 'all', 'none',
  'login', 'signup', 'authenticated', 'unauthenticated', 'modal', 'dialog', 'filter', 'search',
  'create', 'edit', 'view', 'details', 'form', 'step', 'page', 'tab', 'menu', 'active', 'inactive',
])

function cleanNavigationValue(value: string) {
  const normalized = value.trim().replace(/^['"`]|['"`]$/g, '').replace(/^\/+|\/+$/g, '')
  if (!normalized || NON_MODULE_VALUES.has(normalized.toLowerCase())) return ''
  if (normalized.length > 80 || /\s{2,}/.test(normalized)) return ''
  return normalized
}

function navigationCandidates(source: string) {
  const values = [
    ...[...source.matchAll(/(?:(?:set(?:Active|Selected|Current|Tab|Section|View|Module|Page|Nav)[A-Za-z0-9_]*)|onSelect|onChange|navigate|goTo|selectModule)\s*\(\s*['"`]([^'"`]+)['"`]/g)].map((match) => match[1]),
    ...[...source.matchAll(/(?:data-(?:tab|module|section)|aria-controls|value|href|to)\s*=\s*['"`]([^'"`]+)['"`]/g)].map((match) => match[1]),
    ...[...source.matchAll(/case\s+['"`]([^'"`]+)['"`]/g)].map((match) => match[1]),
    ...[...source.matchAll(/(?:id|key|slug|value)\s*:\s*['"`]([^'"`]+)['"`]/g)].map((match) => match[1]),
  ]
  return unique(values.map(cleanNavigationValue).filter(Boolean))
}

function candidateAliases(value: string) {
  return unique([value, value.replace(/[-_]/g, ' '), value.split('/').filter(Boolean).pop() ?? value])
}

const adminClientParserOptions = {
  sourceType: 'module' as const,
  plugins: ['typescript', 'jsx', 'decorators-legacy', 'classProperties', 'objectRestSpread', 'optionalChaining', 'nullishCoalescingOperator', 'dynamicImport', 'topLevelAwait'],
}

function stringLiteralsFromType(type: t.TSType | null | undefined): string[] {
  if (!type) return []
  if (t.isTSUnionType(type)) return type.types.flatMap((item) => stringLiteralsFromType(item))
  if (t.isTSLiteralType(type) && t.isStringLiteral(type.literal)) return [type.literal.value]
  return []
}

export function analyzeAdminClient(source: string, modules: IntegrationModule[]): RotaUnicaAnalysis {
  let ast: t.File
  try {
    ast = parse(source, adminClientParserOptions as never)
  } catch (error) {
    throw new Error(`AdminClient.tsx inválido: ${error instanceof Error ? error.message : 'não foi possível analisar o TSX.'}`)
  }
  let stateName = ''
  const tabs: string[] = []
  const namedTypes = new Map<string, string[]>()
  traverse(ast, {
    TSTypeAliasDeclaration(path) {
      const values = stringLiteralsFromType(path.node.typeAnnotation)
      if (values.length) namedTypes.set(path.node.id.name, values)
    },
    TSInterfaceDeclaration(path) {
      const values = path.node.body.body.flatMap((member) => t.isTSPropertySignature(member) ? stringLiteralsFromType(member.typeAnnotation?.typeAnnotation) : [])
      if (values.length) namedTypes.set(path.node.id.name, values)
    },
  })
  traverse(ast, {
    CallExpression(path) {
      if (!t.isIdentifier(path.node.callee, { name: 'useState' })) return
      const argument = path.node.arguments[0]
      if (!argument || (!t.isStringLiteral(argument) && !t.isArrayExpression(argument))) return
      const parent = path.parentPath
      if (!parent.isVariableDeclarator() || !t.isArrayPattern(parent.node.id)) return
      const [state] = parent.node.id.elements
      if (!t.isIdentifier(state)) return
      const annotation = t.isPattern(parent.node.id) ? parent.node.id.typeAnnotation : null
      const annotationType = annotation?.typeAnnotation
      const namedValues = t.isTSTypeReference(annotationType) && t.isIdentifier(annotationType.typeName)
        ? namedTypes.get(annotationType.typeName.name) ?? []
        : []
      const values = annotationType && t.isTSType(annotationType) ? stringLiteralsFromType(annotationType) : []
      const initializerValues = t.isArrayExpression(argument)
        ? argument.elements.flatMap((element) => t.isStringLiteral(element) ? [element.value] : [])
        : []
      const detectedValues = unique([...values, ...namedValues, ...initializerValues])
      if (detectedValues.length > 0 && !stateName) { stateName = state.name; tabs.push(...detectedValues) }
    },
  })
  const routeCandidates = navigationCandidates(source)
  const componentCandidates = unique([
    ...[...source.matchAll(/(?:component|element|content|view|panel|page)\s*=\s*\{?([A-Z][A-Za-z0-9_]*)/g)].map((match) => match[1]),
    ...[...source.matchAll(/(?:return|=>)\s*<([A-Z][A-Za-z0-9_]*)/g)].map((match) => match[1]),
  ])
  const normalizedTabs = unique([...tabs, ...routeCandidates].map(cleanNavigationValue).filter(Boolean))
  const sourceText = generate(ast).code
  const sharedComponents = unique([...componentCandidates, ...[...sourceText.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)].map((match) => match[1])].filter((name) => !['AdminClient', 'Fragment'].includes(name)))
  const detectedTabs: DetectedTab[] = normalizedTabs.map((tab) => {
    const escaped = tab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const tabPattern = new RegExp(escaped, 'g')
    const occurrences = source.match(tabPattern)?.length ?? 0
    const hasTrigger = new RegExp(`(?:set[A-Z][A-Za-z0-9_]*|onSelect|onChange|navigate|goTo|selectModule)\\s*\\(\\s*['\"]/?(?:[^'\"]*/)?${escaped}['\"]`).test(source)
    const hasContent = occurrences > 1 || new RegExp(`(?:['\"]${escaped}['\"]\\s*===|===\\s*['\"]${escaped}['\"]|case\\s+['\"]${escaped}['\"]|active[A-Za-z0-9_]*\\s*===\\s*['\"]${escaped}['\"])`).test(source)
    const contextStart = Math.max(0, source.indexOf(tab) - 260)
    const contextEnd = Math.min(source.length, source.indexOf(tab) + tab.length + 520)
    const context = source.slice(contextStart, contextEnd)
    const candidates = modules.map((module) => {
      const codeEvidence = new RegExp(`(?:['\"]${module.code}['\"]|\\b${module.code}\\b)`, 'i').test(context)
      const nameEvidence = module.name.split(/\s+/).filter((word) => word.length > 3).some((word) => new RegExp(word.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&'), 'i').test(context))
      const aliasEvidence = candidateAliases(tab).some((alias) => module.code.toLowerCase() === alias.toLowerCase() || module.name.toLowerCase().includes(alias.toLowerCase()))
      const score = (codeEvidence ? 0.62 : 0) + (nameEvidence ? 0.25 : 0) + (aliasEvidence ? 0.3 : 0) + (hasTrigger ? 0.08 : 0) + (hasContent ? 0.08 : 0)
      return { code: module.code, score }
    }).sort((left, right) => right.score - left.score)
    const candidate = candidates[0]?.score >= 0.62 && candidates[0].score - (candidates[1]?.score ?? 0) >= 0.12 ? candidates[0].code : ''
    const confidence = candidate ? Math.min(0.99, Number((candidates[0].score).toFixed(2))) : 0
    const navigationElements = [...context.matchAll(/(?:button|a|Link|nav|menu|set[A-Z][A-Za-z0-9_]*|navigate|goTo|onSelect|onChange)/g)].map((match) => match[0]).filter((value, index, values) => values.indexOf(value) === index).slice(0, 8)
    const contentEvidence = [...context.matchAll(/(?:return\s+<|case\s+|&&\s*<|switch\s*\()/g)].map((match) => match[0].trim()).filter((value, index, values) => values.indexOf(value) === index).slice(0, 8)
    const functionalityNames = [['create', 'criação'], ['add', 'inclusão'], ['edit', 'edição'], ['update', 'atualização'], ['delete', 'exclusão'], ['remove', 'remoção'], ['upload', 'upload'], ['download', 'download'], ['fetch', 'consulta'], ['search', 'busca']]
    const functionalities = functionalityNames.filter(([token]) => new RegExp(`\\b${token}\\b`, 'i').test(context)).map(([, label]) => label)
    const dependencies = [...context.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)].map((match) => match[1]).filter((name, index, values) => values.indexOf(name) === index).slice(0, 8)
    return { tab, code: candidate, confidence, hasContent, hasTrigger, navigationElements, contentEvidence, functionalities, dependencies }
  })
  // A compatibilidade é uma recomendação, não um bloqueio. Mapeamentos com
  // evidência direta (código do módulo ou alias inequívoco) são preenchidos
  // automaticamente; os demais continuam disponíveis para revisão manual.
  const mappings = detectedTabs.filter((item) => item.code && item.confidence >= 0.62).map(({ tab, code }) => ({ tab, code }))
  const uncertain = detectedTabs.filter((item) => !item.code).map((item) => item.tab)
  const compatibility = normalizedTabs.length
    ? Math.round((mappings.length / normalizedTabs.length) * 100)
    : 0
  const warnings = [`Compatibilidade estimada: ${compatibility}%. O percentual orienta a revisão e não impede a geração do pacote.`]
  if (!normalizedTabs.length) warnings.push('Nenhuma navegação por abas ou rota foi identificada; o pacote será gerado com o mapeamento vazio e poderá ser complementado depois.')
  if (uncertain.length) warnings.push(`${uncertain.length} área(s) não possuem evidência suficiente para associação automática; elas ficarão sem bloqueio específico até serem mapeadas.`)
  return { stateName, tabs: normalizedTabs, detectedTabs, mappings, sharedComponents, warnings, uncertain, requiresConfirmation: false, compatibility }
}

function addAllowedProp(ast: t.File) {
  let changed = false
  const addToParams = (params: t.FunctionDeclaration['params'] | t.ArrowFunctionExpression['params']) => {
    if (!params.length) {
      params.push(t.objectPattern([t.objectProperty(t.identifier('allowedModules'), t.identifier('allowedModules'))]))
      return true
    }
    const first = params[0]
    if (!t.isObjectPattern(first)) return false
    if (first.properties.some((property) => t.isObjectProperty(property) && t.isIdentifier(property.key, { name: 'allowedModules' }))) return true
    first.properties.push(t.objectProperty(t.identifier('allowedModules'), t.identifier('allowedModules')))
    return true
  }
  traverse(ast, {
    FunctionDeclaration(path) {
      if (!path.node.id?.name || !path.node.body || !t.isBlockStatement(path.node.body)) return
      if (!path.node.body.body.some((statement) => t.isReturnStatement(statement))) return
      changed = addToParams(path.node.params)
      if (changed) path.stop()
    },
    VariableDeclarator(path) {
      if (!t.isIdentifier(path.node.id) || !t.isArrowFunctionExpression(path.node.init)) return
      const fn = path.node.init
      if (!t.isBlockStatement(fn.body) && !t.isJSXElement(fn.body)) return
      if (t.isBlockStatement(fn.body) && !fn.body.body.some((statement) => t.isReturnStatement(statement))) return
      changed = addToParams(fn.params)
      if (changed) path.stop()
    },
  })
  return changed
}

function removeExistingGeneratedExports(ast: t.File) {
  traverse(ast, {
    VariableDeclaration(path) {
      const names = path.node.declarations
        .map((declaration) => t.isIdentifier(declaration.id) ? declaration.id.name : '')
      if (names.some((name) => ['CODEXA_TAB_MAPPING', 'CodexaAllowedModules'].includes(name))) path.remove()
    },
    TSTypeAliasDeclaration(path) {
      if (path.node.id.name === 'CodexaAllowedModules') path.remove()
    },
    FunctionDeclaration(path) {
      if (path.node.id?.name === 'codexaCanUseModule') path.remove()
    },
  })
}

function addActiveTabGuards(ast: t.File) {
  let changed = false
  traverse(ast, {
    FunctionDeclaration(path) {
      const params = path.node.params[0]
      if (!t.isObjectPattern(params) || !params.properties.some((property) => t.isObjectProperty(property) && t.isIdentifier(property.key, { name: 'allowedModules' }))) return
      const activeStateNames = new Set<string>()
      path.traverse({
        VariableDeclarator(statePath) {
          const init = statePath.node.init
          if (!t.isCallExpression(init) || !t.isIdentifier(init.callee, { name: 'useState' })) return
          if (!t.isArrayPattern(statePath.node.id) || !t.isIdentifier(statePath.node.id.elements[0])) return
          const stateName = statePath.node.id.elements[0].name
          if (/^(active|selected|current)?tab$/i.test(stateName) || /(?:active|selected|current).*tab/i.test(stateName)) {
            activeStateNames.add(stateName)
          }
        },
      })
      if (!activeStateNames.size) return
      const activeTab = [...activeStateNames][0]
      const access = t.memberExpression(t.identifier('allowedModules'), t.identifier(activeTab), true)
      const guard = t.ifStatement(
        t.binaryExpression('===', access, t.booleanLiteral(false)),
        t.blockStatement([t.returnStatement(t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier('CodexaModuleBlocked'), [], true), null, []))]),
      )
      const lastDeclarationIndex = path.node.body.body.reduce((lastIndex, statement, index) => t.isVariableDeclaration(statement) ? index : lastIndex, -1)
      path.node.body.body.splice(lastDeclarationIndex + 1, 0, guard)
      changed = true
      path.stop()
    },
  })
  return changed
}

export function generateRotaUnicaIntegration(originalCode: string, modules: IntegrationModule[], mapping?: TabMapping[]) {
  const analysis = analyzeAdminClient(originalCode, modules)
  const explicit = mapping?.length ? mapping : []
  const explicitTabs = new Set(explicit.map((item) => item?.tab).filter(Boolean))
  // Preserve mappings manually supplied by the operator and fill only missing
  // tabs from the analyzer. An empty or partial JSON is valid by design.
  const selected = [...explicit, ...analysis.mappings.filter((item) => !explicitTabs.has(item.tab))]
  if (selected.some((item) => !item || typeof item.tab !== 'string' || typeof item.code !== 'string' || !item.tab.trim() || !item.code.trim())) throw new Error('Cada mapeamento precisa conter uma aba e um código de módulo preenchidos.')
  const tabsSeen = new Set<string>()
  if (selected.some((item) => tabsSeen.has(item.tab) || !tabsSeen.add(item.tab))) throw new Error('Cada aba detectada só pode ser mapeada uma vez.')
  const validTabs = new Set(analysis.tabs)
  const validCodes = new Set(modules.map((module) => module.code))
  if (selected.some((item) => (validTabs.size > 0 && !validTabs.has(item.tab)) || !validCodes.has(item.code))) throw new Error('O mapeamento contém uma aba, rota ou código de módulo inexistente.')
  const ast = parse(originalCode, adminClientParserOptions as never)
  removeExistingGeneratedExports(ast)
  if (!addAllowedProp(ast)) throw new Error('A página foi analisada, mas não encontrei um componente AdminClient modificável.')
  addActiveTabGuards(ast)
  const generated = generate(ast, { retainLines: false, jsescOption: { minimal: true } }).code
  const guard = `\n\nexport function CodexaModuleBlocked() {\n  return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-5 py-8 text-slate-50"><div className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-indigo-500/20 blur-3xl" /><div className="pointer-events-none absolute -bottom-32 -right-24 size-80 rounded-full bg-cyan-400/15 blur-3xl" /><section className="relative w-full max-w-xl rounded-3xl border border-white/10 bg-slate-900/90 p-8 text-center shadow-2xl shadow-black/30 backdrop-blur sm:p-11"><div className="mx-auto mb-6 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-xl font-extrabold text-indigo-50 shadow-xl shadow-indigo-950/40">C</div><p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-indigo-300">Acesso restrito</p><h1 className="mt-3 text-3xl font-bold tracking-tight">Módulo não disponível</h1><p className="mx-auto mt-4 max-w-md text-sm leading-7 text-slate-400">Este módulo não está liberado para esta licença. Entre em contato com a Codexa para solicitar a liberação.</p><div className="mx-auto mt-7 h-1 w-12 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400" /></section></main>\n}\n\nexport type CodexaAllowedModules = Record<string, boolean>\n\nexport function codexaCanUseModule(allowedModules: CodexaAllowedModules, code: string) {\n  return allowedModules[code] === true\n}\n\nexport const CODEXA_TAB_MAPPING = ${JSON.stringify(selected, null, 2)} as const\n`
  return { source: `${generated}${guard}`, analysis: { ...analysis, mappings: selected } }
}

export function generatePageWrapper(mapping: TabMapping[] = []) {
  const serializedMapping = JSON.stringify(mapping)
  return `import AdminClient from './AdminClient'\nimport { getCodexaDecision } from '@/lib/codexa-license'\n\nexport const dynamic = 'force-dynamic'\nexport const revalidate = 0\n\nexport default async function AdminPage() {\n  const decision = await getCodexaDecision()\n  if (!decision.valid) return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-5 py-8 text-slate-50"><div className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-indigo-500/20 blur-3xl" /><div className="pointer-events-none absolute -bottom-32 -right-24 size-80 rounded-full bg-cyan-400/15 blur-3xl" /><section className="relative w-full max-w-xl rounded-3xl border border-white/10 bg-slate-900/90 p-8 text-center shadow-2xl shadow-black/30 backdrop-blur sm:p-11"><div className="mx-auto mb-6 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-xl font-extrabold text-indigo-50 shadow-xl shadow-indigo-950/40">C</div><p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-indigo-300">Acesso restrito</p><h1 className="mt-3 text-3xl font-bold tracking-tight">Acesso administrativo indisponível</h1><p className="mx-auto mt-4 max-w-md text-sm leading-7 text-slate-400">{decision.reason ?? 'A licença não está válida ou o serviço não está disponível.'}</p><div className="mx-auto mt-7 h-1 w-12 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400" /></section></main>\n\n  const allowedModules = Object.fromEntries(decision.modules.flatMap((module) => {\n    const enabled = module.contracted && module.enabled && module.available && module.licensed\n    const tabAliases = ${serializedMapping}.filter((mapping) => mapping.code === module.code).map((mapping) => mapping.tab)\n    return [module.code, ...tabAliases].map((code) => [code, enabled])\n  }))\n\n  return <AdminClient allowedModules={allowedModules} />\n}\n`
}
