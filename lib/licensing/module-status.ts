export function isModuleAvailable(status: string | null | undefined): boolean {
  const normalized = (status ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
  return ['contratado', 'licenca valida', 'acesso liberado', 'available', 'active', 'ativo', 'publicado'].includes(normalized)
}
