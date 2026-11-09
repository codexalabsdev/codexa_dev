import { AdminApiError } from '@/lib/supabase/server-client'
import type { WorkspaceActor } from '@/lib/supabase/workspace-auth'
import { normalizeWorkspaceRoleName } from '@/lib/workspace-access'

type AttachmentAction = 'upload' | 'download'
type ContractAccessRecord = { id: string; responsible_id: string | null; client_id: string | null; proposal_id: string | null }

export async function requireContractAttachmentAccess(
  actor: WorkspaceActor,
  permissions: Set<string>,
  contractId: string,
  action: AttachmentAction,
): Promise<ContractAccessRecord> {
  if (!permissions.has('*') && !permissions.has(`attachments:${action}`)) {
    throw new AdminApiError(`Seu cargo não tem permissão para ${action === 'upload' ? 'enviar' : 'abrir'} anexos.`, 403)
  }
  if (!permissions.has('*') && !permissions.has('contracts:view')) {
    throw new AdminApiError('Seu cargo não tem permissão para visualizar contratos.', 403)
  }

  const { data: contract, error: contractError } = await actor.supabase
    .from('contracts')
    .select('id,responsible_id,client_id,proposal_id')
    .eq('id', contractId)
    .maybeSingle()
  if (contractError) {
    console.error('Contract attachment access check failed:', contractError.message)
    throw new AdminApiError('Não foi possível verificar o contrato.', 503)
  }
  if (!contract) throw new AdminApiError('Contrato não encontrado.', 404)

  const roleName = normalizeWorkspaceRoleName(actor.roleName)
  if (roleName === 'relacionamento') {
    let clientId = contract.client_id
    if (!clientId && contract.proposal_id) {
      const { data: proposal, error: proposalError } = await actor.supabase
        .from('proposals')
        .select('client_id')
        .eq('id', contract.proposal_id)
        .maybeSingle()
      if (proposalError) {
        console.error('Contract proposal access check failed:', proposalError.message)
        throw new AdminApiError('Não foi possível verificar o acesso ao cliente.', 503)
      }
      clientId = proposal?.client_id ?? null
    }
    if (!clientId) throw new AdminApiError('Você não tem acesso a este contrato.', 403)
    const { data: client, error: clientError } = await actor.supabase
      .from('clients')
      .select('owner_id')
      .eq('id', clientId)
      .maybeSingle()
    if (clientError) {
      console.error('Contract client access check failed:', clientError.message)
      throw new AdminApiError('Não foi possível verificar o acesso ao cliente.', 503)
    }
    if (client?.owner_id !== actor.actorId && client?.owner_id !== actor.memberId) {
      throw new AdminApiError('Você não tem acesso a este contrato.', 403)
    }
  }

  return contract
}
