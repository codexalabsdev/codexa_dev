export type MiddlewareRoute = { pattern: string; module: string; blockedPath: string }

function normalizePattern(pattern: string) {
  const value = pattern.trim()
  if (!value.startsWith('/') || value.includes('?') || value.includes('#') || value.includes('..')) throw new Error(`Rota inválida: ${pattern}`)
  return value
}

export function buildBlockedPageSource() {
  return `'use client'\n\nexport default function AcessoBloqueadoPage() {\n  return (\n    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', fontFamily: 'system-ui, sans-serif' }}>\n      <section style={{ maxWidth: '520px', textAlign: 'center' }}>\n        <p style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b' }}>Acesso restrito</p>\n        <h1 style={{ marginTop: '12px', fontSize: '32px', lineHeight: 1.15 }}>Módulo não disponível</h1>\n        <p style={{ marginTop: '16px', color: '#64748b', lineHeight: 1.6 }}>Este módulo não está liberado para esta licença. Entre em contato com a Codexa Personalizada para solicitar a liberação.</p>\n      </section>\n    </main>\n  )\n}\n`
}

export function buildMiddlewareSource(routes: MiddlewareRoute[], apiUrl: string) {
  const unique = new Map<string, MiddlewareRoute>()
  for (const route of routes) {
    const pattern = normalizePattern(route.pattern)
    if (!route.module.trim()) throw new Error(`Módulo ausente para ${pattern}`)
    if (unique.has(pattern)) throw new Error(`Rota duplicada: ${pattern}`)
    unique.set(pattern, { pattern, module: route.module.trim(), blockedPath: normalizePattern(route.blockedPath || '/acesso-bloqueado') })
  }
  const normalized = [...unique.values()]
  const routeLiteral = normalized.map((route) => `  { pattern: ${JSON.stringify(route.pattern)}, module: ${JSON.stringify(route.module)}, blockedPath: ${JSON.stringify(route.blockedPath)} },`).join('\n')
  const matcher = normalized.map((route) => JSON.stringify(route.pattern)).join(', ')
  return `import { NextRequest, NextResponse } from 'next/server'\n\nconst CODEXA_LICENSE_API_URL = ${JSON.stringify(apiUrl)}\nconst ROUTES = [\n${routeLiteral}\n] as const\n\nexport async function middleware(request: NextRequest) {\n  const route = ROUTES.find((item) => request.nextUrl.pathname === item.pattern || request.nextUrl.pathname.startsWith(item.pattern.replace('/:path*', '/')))\n  if (!route) return NextResponse.next()\n  const token = process.env.CODEXA_LICENSE_KEY\n  if (!token) return NextResponse.redirect(new URL(route.blockedPath, request.url))\n  try {\n    const response = await fetch(CODEXA_LICENSE_API_URL, { method: 'POST', headers: { Authorization: \`Bearer \${token}\`, Accept: 'application/json' }, cache: 'no-store' })\n    if (!response.ok) return NextResponse.redirect(new URL(route.blockedPath, request.url))\n    const result = await response.json() as { valid?: boolean; modules?: Array<{ code?: string; licensed?: boolean }> }\n    const module = result.modules?.find((item) => item.code === route.module)\n    if (!result.valid || !module?.licensed) return NextResponse.redirect(new URL(route.blockedPath, request.url))\n    return NextResponse.next()\n  } catch {\n    return NextResponse.redirect(new URL(route.blockedPath, request.url))\n  }\n}\n\nexport const config = { matcher: [${matcher}] }\n`
}
