const clientScript = `(() => {
  'use strict'

  const script = document.currentScript
  if (!script) return
  const source = new URL(script.src, window.location.href)
  const token = source.searchParams.get('token')
  if (!token) return

  const apiUrl = source.searchParams.get('api') || source.origin + '/api/licenses/validate'
  const suspendedMessage = 'Este sistema está temporariamente suspenso. Entre em contato com o suporte.'
  let observer
  let lastState = ''
  let validating = false

  function showSuspended() {
    if (document.getElementById('codexa-license-suspended')) return
    const overlay = document.createElement('div')
    overlay.id = 'codexa-license-suspended'
    overlay.setAttribute('role', 'alertdialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:rgba(8,12,20,.96);color:#fff;font:16px/1.5 system-ui,sans-serif;text-align:center'
    const content = document.createElement('div')
    content.style.maxWidth = '480px'
    content.innerHTML = '<strong style="display:block;font-size:24px;margin-bottom:12px">Sistema suspenso</strong><span></span>'
    content.querySelector('span').textContent = suspendedMessage
    overlay.appendChild(content)
    document.body.appendChild(overlay)
  }

  function applyModules(modules) {
    const byCode = new Map(modules.map((module) => [module.code, module]))
    document.querySelectorAll('[data-lic-module], [data-license-module]').forEach((element) => {
      const code = element.getAttribute('data-lic-module') || element.getAttribute('data-license-module')
      const module = byCode.get(code)
      if (module && !module.licensed) element.remove()
    })
    document.querySelectorAll('[data-lic-action], [data-license-action]').forEach((element) => {
      const code = element.getAttribute('data-lic-action') || element.getAttribute('data-license-action')
      const module = byCode.get(code)
      if (module && !module.licensed) {
        element.setAttribute('aria-disabled', 'true')
        element.setAttribute('title', 'Este recurso não está disponível na sua licença.')
        element.addEventListener('click', (event) => event.preventDefault(), { capture: true, once: true })
      }
    })
  }

  async function validate() {
    if (validating) return
    validating = true
    try {
      const response = await fetch(apiUrl, { method: 'POST', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, cache: 'no-store', credentials: 'omit' })
      const result = await response.json()
      const state = JSON.stringify(result)
      if (state === lastState) return
      lastState = state
      if (!result.valid || response.status === 401) showSuspended()
      else if (Array.isArray(result.modules)) applyModules(result.modules)
    } catch {
      // Sem validação, nenhuma funcionalidade licenciada é liberada pelo script.
    } finally {
      validating = false
    }
  }

  function start() {
    void validate()
    observer = new MutationObserver(() => {
      if (lastState) {
        try { applyModules(JSON.parse(lastState).modules || []) } catch {}
      }
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
    window.setInterval(() => void validate(), 30000)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
})()
`

export const runtime = 'nodejs'

export async function GET() {
  return new Response(clientScript, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, immutable',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
