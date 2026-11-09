'use client'

import { CatalogWorkspace } from '@/components/catalog-workspace'
import { CommercialWorkspace } from '@/components/commercial-workspace'
import { OperationsWorkspace } from '@/components/operations-workspace'
import { FinanceWorkspace } from '@/components/finance-workspace'
import { AccountWorkspace } from '@/components/account-workspace'
import { GamifiedProfileWorkspace } from '@/components/gamified-profile-workspace'
import { BadgeManagementWorkspace } from '@/components/badge-management-workspace'
import { CrmWorkspace } from '@/components/crm-workspace'
import { AdminWorkspace } from '@/components/admin-workspace'
import { LicenseWorkspace } from '@/components/license-workspace'
import { ReportsWorkspace } from '@/components/reports-workspace'
import { RoleManagementWorkspace } from '@/components/role-management-workspace'
import { ActivityHistoryWorkspace } from '@/components/activity-history-workspace'
import { PlansWorkspace } from '@/components/plans-workspace'
import { DocumentsWorkspace } from '@/components/documents-workspace'
import { XpSettingsWorkspace } from '@/components/xp-settings-workspace'

import { workspaceLabel } from '@/lib/workspace-modules'

function ModuleFallback({ label }: { label: string }) {
  return <section className="mt-6 rounded-xl border border-white/[0.07] bg-[#11161e] p-6"><p className="text-xs font-medium uppercase tracking-[0.16em] text-violet-400">Workspace</p><h1 className="mt-2 text-2xl font-semibold text-white">{label}</h1><p className="mt-2 text-sm text-slate-500">Gerencie registros de {label.toLowerCase()} com segurança e persistência no Supabase.</p><div className="mt-6 rounded-lg border border-dashed border-white/[0.1] p-8 text-center text-xs text-slate-500">Nenhum registro encontrado. A criação desta entidade será habilitada conforme o schema disponível.</div></section>
}

export function WorkspacePageRouter({ module, permissions, profileName }: { module: string; permissions: string[]; profileName: string }) {
  const label = workspaceLabel(module)
  if (module === 'comercial') return <CommercialWorkspace initialTab="overview" permissions={permissions} />
  if (module === 'leads' || module === 'clientes' || module === 'contatos') return <CrmWorkspace initialModule={module === 'clientes' ? 'clients' : module === 'contatos' ? 'messages' : 'leads'} permissions={permissions} />
  if (module === 'propostas' || module === 'contratos') return <CommercialWorkspace initialTab={module === 'contratos' ? 'contracts' : 'proposals'} permissions={permissions} />
  if (module === 'projetos' || module === 'tarefas' || module === 'solicitacoes' || module === 'suporte') return <OperationsWorkspace permissions={permissions} initialModule={module === 'tarefas' ? 'projects' : module === 'solicitacoes' ? 'change_requests' : module === 'suporte' ? 'support_tickets' : 'projects'} />
  if (module === 'sistemas' || module === 'modulos') return <CatalogWorkspace initialTab={module === 'modulos' ? 'modules' : 'systems'} />
  if (module === 'planos') return <PlansWorkspace permissions={permissions} />
  if (module === 'licencas') return <LicenseWorkspace permissions={permissions} />
  if (module === 'relatorios') return <ReportsWorkspace permissions={permissions} />
  if (module === 'papeis-e-permissoes') return <RoleManagementWorkspace />
  if (module === 'usuarios') return <RoleManagementWorkspace initialView="users" />
  if (module === 'contas-a-receber') return <FinanceWorkspace initialTab="receivable" permissions={permissions} />
  if (module === 'contas-a-pagar') return <FinanceWorkspace initialTab="payable" permissions={permissions} />
  if (module === 'fluxo-de-caixa') return <FinanceWorkspace initialTab="cashflow" permissions={permissions} />
  if (module === 'transacoes' || module === 'categorias-financeiras') return <FinanceWorkspace initialTab="overview" permissions={permissions} />
  if (module === 'meu-perfil') return <GamifiedProfileWorkspace initialName={profileName} />
  if (module === 'emblemas') return <BadgeManagementWorkspace />
  if (module === 'documentos') return <DocumentsWorkspace />
  if (module === 'configuracao-xp') return <XpSettingsWorkspace />
  if (module === 'meu-historico') return <ActivityHistoryWorkspace permissions={permissions} mode="personal" />
  if (module === 'auditoria') return <ActivityHistoryWorkspace permissions={permissions} mode="audit" />
  if (module === 'aparencia') return <AccountWorkspace section="Aparência" />
  if (module === 'equipe' || module === 'relatorios' || module === 'configuracoes') return <AdminWorkspace section={label} permissions={permissions} />
  return <ModuleFallback label={label} />
}
