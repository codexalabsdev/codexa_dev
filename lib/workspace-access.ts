export const workspaceAccess: Record<string, string[]> = {
  comercial: ['dashboard_comercial:view'],
  leads: ['leads:view'],
  clientes: ['clients:view'],
  contatos: ['contacts:view'],
  propostas: ['proposals:view'],
  contratos: ['contracts:view'],
  projetos: ['projects:view'],
  tarefas: ['projects:view'],
  solicitacoes: ['change_requests:view'],
  suporte: ['support:view'],
  sistemas: ['systems:view'],
  modulos: ['modules:view'],
  planos: ['plans:view'],
  licencas: ['licenses:view'],
  'contas-a-receber': ['accounts_receivable:view'],
  'contas-a-pagar': ['accounts_payable:view'],
  'fluxo-de-caixa': ['finance:view'],
  recorrencias: ['finance:view'],
  orcamento: ['finance:view'],
  transacoes: ['finance:view'],
  'categorias-financeiras': ['finance:view'],
  relatorios: ['reports_commercial:view', 'reports_financial:view'],
  equipe: ['team:view'],
  usuarios: ['users:manage_users'],
  'papeis-e-permissoes': ['roles:manage_roles'],
  documentos: ['documents:view'],
  emblemas: ['badges:manage'],
  'configuracao-xp': ['badges:manage'],
  'meu-perfil': ['profile:view'],
  'meu-historico': ['projects:view'],
  configuracoes: ['settings:view'],
  aparencia: ['appearance:view'],
  auditoria: ['audit:view_audit'],
}

export function hasWorkspaceAccess(permissions: string[], slug: string): boolean {
  if (permissions.includes('*')) return true
  if (slug === 'dashboard') return permissions.includes('dashboard:view') || permissions.includes('dashboard_comercial:view')
  const required = workspaceAccess[slug]
  return Boolean(required?.some((permission) => permissions.includes(permission)))
}

export function normalizeWorkspaceRoleName(name: string): string {
  const normalized = name.trim().toLocaleLowerCase('pt-BR')
  return normalized === 'administrador' ? 'admin' : normalized
}

export type WorkspacePermissionOverride = {
  module_name: string
  action_name: string
  effect: 'allow' | 'deny'
}

export function applyWorkspacePermissionOverrides(
  rolePermissions: Iterable<string>,
  overrides: WorkspacePermissionOverride[],
): Set<string> {
  const effective = new Set(rolePermissions)
  for (const override of overrides) {
    const key = `${override.module_name}:${override.action_name}`
    if (override.effect === 'allow') effective.add(key)
    else effective.delete(key)
  }
  return effective
}
