(() => {
  'use strict'

  const script = document.currentScript
  if (!script) return

  const source = new URL(script.src, window.location.href)
  const token = source.searchParams.get('token')
  if (!token) return

  const apiUrl = source.searchParams.get('api') || `${source.origin}/api/licenses/validate`
  const suspendedMessage = 'Este sistema está temporariamente suspenso. Entre em contato com o suporte.'
  let lastState = ''
  let validating = false

  function showSuspended() {
    if (document.getElementById('codexa-license-suspended')) return
    const overlay = document.createElement('div')
    overlay.id = 'codexa-license-suspended'
    overlay.setAttribute('role', 'alertdialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:rgba(8,12,20,.96);color:#fff;font:16px/1.5 system-ui,sans-serif;text-align:center'
    overlay.innerHTML = `<div style="max-width:480px"><strong style="display:block;font-size:24px;margin-bottom:12px">Sistema suspenso</strong><span>${suspendedMessage}</span></div>`
    document.body.appendChild(overlay)
  }

  function applyModules(modules) {
    const byCode = new Map(modules.map((module) => [module.code, module]))
    document.querySelectorAll('[data-license-module]').forEach((element) => {
      const module = byCode.get(element.getAttribute('data-license-module'))
      if (module && !module.licensed) element.remove()
    })
    document.querySelectorAll('[data-license-action]').forEach((element) => {
      const module = byCode.get(element.getAttribute('data-license-module'))
      const allowed = module?.licensed
      if (module && !allowed) {
        element.setAttribute('aria-disabled', 'true')
        element.setAttribute('title', 'Este recurso não está disponível na sua licença.')
        element.addEventListener('click', (event) => event.preventDefault(), { capture: true })
      }
    })
  }

  function currentOriginIsAllowed() {
    return window.location.protocol === 'http:' || window.location.protocol === 'https:'
  }

  async function validate() {
    try {
      if (!currentOriginIsAllowed()) return
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        cache: 'no-store',
        credentials: 'omit',
      })
      const result = await response.json()
      if (!result.valid || response.status === 401) showSuspended()
      else if (Array.isArray(result.modules)) applyModules(result.modules)
    } catch {
      // Falhas de rede não derrubam o site do cliente; a próxima validação tenta novamente.
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', validate, { once: true })
  else void validate()
})()
