export async function uploadContractAttachment(contractId: string, file: File): Promise<void> {
  const formData = new FormData()
  formData.set('file', file)

  const response = await fetch(`/api/workspace/contracts/${contractId}/attachments`, {
    method: 'POST',
    body: formData,
  })
  const result = await response.json() as { error?: string }
  if (!response.ok) {
    throw new Error(result.error ?? 'Não foi possível salvar o anexo do contrato.')
  }
}
