import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyWorkspacePermissionOverrides, hasWorkspaceAccess, normalizeWorkspaceRoleName } from '../../lib/workspace-access.ts'

test('denies routes when no explicit permission is present', () => {
  assert.equal(hasWorkspaceAccess([], 'clientes'), false)
  assert.equal(hasWorkspaceAccess(['clients:update'], 'clientes'), false)
  assert.equal(hasWorkspaceAccess(['support:create'], 'suporte'), false)
  assert.equal(hasWorkspaceAccess(['clients:view'], 'unknown-module'), false)
})

test('allows only the explicit route permission and supports either report grant', () => {
  assert.equal(hasWorkspaceAccess(['clients:view'], 'clientes'), true)
  assert.equal(hasWorkspaceAccess(['reports_financial:view'], 'relatorios'), true)
  assert.equal(hasWorkspaceAccess(['reports_commercial:view'], 'relatorios'), true)
  assert.equal(hasWorkspaceAccess(['reports_financial:export'], 'relatorios'), false)
})

test('personal activity and audit routes require their respective read permissions', () => {
  assert.equal(hasWorkspaceAccess(['projects:view'], 'meu-historico'), true)
  assert.equal(hasWorkspaceAccess(['audit:view_audit'], 'auditoria'), true)
  assert.equal(hasWorkspaceAccess(['projects:view'], 'auditoria'), false)
  assert.equal(hasWorkspaceAccess(['audit:view_audit'], 'meu-historico'), false)
})

test('dashboard and administrator access require their explicit grant or the admin wildcard', () => {
  assert.equal(hasWorkspaceAccess(['dashboard_comercial:view'], 'dashboard'), true)
  assert.equal(hasWorkspaceAccess(['clients:view'], 'dashboard'), false)
  assert.equal(hasWorkspaceAccess(['*'], 'papeis-e-permissoes'), true)
})

test('normalizes role names before resolving stored role assignments', () => {
  assert.equal(normalizeWorkspaceRoleName('  ADMIN  '), 'admin')
  assert.equal(normalizeWorkspaceRoleName('FINANCEIRO'), 'financeiro')
})

test('individual deny overrides a role grant and individual allow adds only the named permission', () => {
  const effective = applyWorkspacePermissionOverrides(
    ['projects:view', 'projects:update'],
    [
      { module_name: 'projects', action_name: 'update', effect: 'deny' },
      { module_name: 'projects', action_name: 'share', effect: 'allow' },
    ],
  )

  assert.deepEqual([...effective].sort(), ['projects:share', 'projects:view'])
})
