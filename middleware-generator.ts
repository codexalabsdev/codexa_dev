export type MiddlewareRoute = { pattern: string; module: string; blockedPath: string }

function normalizePattern(pattern: string) {
  const value = pattern.trim()
  if (!value.startsWith('/') || value.includes('?') || value.includes('#') || value.includes('..')) throw new Error(`Rota inválida: ${pattern}`)
  return value
}

export function buildBlockedPageSource() {
  return `'use client'\n\nexport default function AcessoBloqueadoPage() {\n  return (\n    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '32px 20px', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', color: '#f8fafc', background: 'radial-gradient(circle at 15% 10%, rgba(99, 102, 241, 0.22), transparent 36%), radial-gradient(circle at 85% 90%, rgba(14, 165, 233, 0.16), transparent 34%), #070b14' }}>\n      <section style={{ width: '100%', maxWidth: '560px', padding: '42px 36px', textAlign: 'center', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: '24px', background: 'linear-gradient(145deg, rgba(20, 28, 48, 0.96), rgba(10, 15, 28, 0.96))', boxShadow: '0 24px 80px rgba(0, 0, 0, 0.36)' }}>\n        <div style={{ width: '56px', height: '56px', margin: '0 auto 24px', display: 'grid', placeItems: 'center', borderRadius: '18px', color: '#c7d2fe', background: 'linear-gradient(135deg, #6366f1, #06b6d4)', boxShadow: '0 12px 32px rgba(79, 70, 229, 0.34)', fontSize: '24px', fontWeight: 800 }}>C</div>\n        <p style={{ margin: 0, fontSize: '11px', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#a5b4fc' }}>Acesso restrito</p>\n        <h1 style={{ margin: '12px 0 0', fontSize: '34px', lineHeight: 1.12, letterSpacing: '-0.03em' }}>Módulo não disponível</h1>\n        <p style={{ maxWidth: '420px', margin: '18px auto 0', color: '#94a3b8', lineHeight: 1.7 }}>Este módulo não está liberado para esta licença. Entre em contato com a Codexa para solicitar a liberação.</p>\n        <div style={{ width: '48px', height: '3px', margin: '28px auto 0', borderRadius: '999px', background: 'linear-gradient(90deg, #6366f1, #06b6d4)' }} />\n      </section>\n    </main>\n  )\n}\n`
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
