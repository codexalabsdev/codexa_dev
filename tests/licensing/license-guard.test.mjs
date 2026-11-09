import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createLicenseGuard,
  LicenseServiceUnavailableError,
  LicensedModuleRequiredError,
} from '../../lib/licensing/license-guard.ts'
import { isModuleAvailable } from '../../lib/licensing/module-status.ts'

const validResult = {
  valid: true,
  expiresAt: null,
  modules: [{
    code: 'billing',
    name: 'Financeiro',
    contracted: true,
    enabled: true,
    available: true,
    licensed: true,
  }],
}

test('allows only modules explicitly contracted, enabled, and available', async () => {
  const guard = createLicenseGuard({
    endpoint: 'https://licenses.example.test/api/licenses/validate',
    licenseKey: 'cx-test-license-secret',
    fetcher: async () => Response.json(validResult),
  })

  assert.equal(await guard.hasModule('billing'), true)
  await guard.requireModule('billing')
  await assert.rejects(guard.requireModule('other'), LicensedModuleRequiredError)
})

test('caches a successful check and sends the key only as a bearer header', async () => {
  let calls = 0
  const guard = createLicenseGuard({
    endpoint: 'https://licenses.example.test/api/licenses/validate',
    licenseKey: 'cx-test-license-secret',
    fetcher: async (input, init) => {
      calls += 1
      assert.equal(String(input), 'https://licenses.example.test/api/licenses/validate')
      assert.equal(init?.method, 'POST')
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer cx-test-license-secret')
      assert.equal(init?.redirect, 'error')
      return Response.json(validResult)
    },
  })

  await guard.check()
  await guard.check()
  assert.equal(calls, 1)
})

test('fails closed when the service is unreachable and requires HTTPS remotely', async () => {
  const unreachable = createLicenseGuard({
    endpoint: 'https://licenses.example.test/api/licenses/validate',
    licenseKey: 'cx-test-license-secret',
    fetcher: async () => { throw new Error('network unavailable') },
  })
  await assert.rejects(unreachable.check(), LicenseServiceUnavailableError)

  const insecure = createLicenseGuard({
    endpoint: 'http://licenses.example.test/api/licenses/validate',
    licenseKey: 'cx-test-license-secret',
    fetcher: async () => Response.json(validResult),
  })
  await assert.rejects(insecure.check(), LicenseServiceUnavailableError)
})

test('recognizes only catalog statuses that make a module available', () => {
  assert.equal(isModuleAvailable('Licença válida'), true)
  assert.equal(isModuleAvailable('Contratado'), true)
  assert.equal(isModuleAvailable('Acesso liberado'), true)
  assert.equal(isModuleAvailable('Indisponível'), false)
  assert.equal(isModuleAvailable(null), false)
})

test('rejects malformed validation responses instead of granting access', async () => {
  const guard = createLicenseGuard({
    endpoint: 'https://licenses.example.test/api/licenses/validate',
    licenseKey: 'cx-test-license-secret',
    fetcher: async () => Response.json({ valid: true, expiresAt: null, modules: [null] }),
  })

  await assert.rejects(guard.hasModule('billing'), LicenseServiceUnavailableError)
})
