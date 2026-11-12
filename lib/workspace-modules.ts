export const workspaceModules: Record<string, string> = {
  dashboard: 'Dashboard', comercial: 'Visão comercial', documentos: 'Documentos', 'configuracao-xp': 'Configuração de XP', leads: 'Leads', clientes: 'Clientes', propostas: 'Propostas', contratos: 'Contratos',
  projetos: 'Projetos', tarefas: 'Tarefas', solicitacoes: 'Solicitações de alteração', suporte: 'Suporte', sistemas: 'Sistemas dos clientes',
  modulos: 'Módulos', planos: 'Planos', licencas: 'Licenças', 'contas-a-receber': 'Contas a receber', 'contas-a-pagar': 'Contas a pagar',
  'fluxo-de-caixa': 'Fluxo de caixa', recorrencias: 'Recorrências', orcamento: 'Orçamento', transacoes: 'Transações', 'categorias-financeiras': 'Categorias financeiras', relatorios: 'Relatórios',
  equipe: 'Equipe', usuarios: 'Usuários', 'papeis-e-permissoes': 'Papéis e permissões', emblemas: 'Emblemas', 'meu-perfil': 'Meu perfil', 'meu-historico': 'Meu histórico', configuracoes: 'Configurações',
  aparencia: 'Aparência', auditoria: 'Auditoria',
}

export function workspaceLabel(module: string) { return workspaceModules[module] }
export function isWorkspaceModule(module: string) { return Boolean(workspaceModules[module]) }
