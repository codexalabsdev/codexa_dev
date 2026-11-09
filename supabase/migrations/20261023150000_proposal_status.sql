-- Padroniza os novos status de propostas sem alterar registros existentes.
-- Aplicar manualmente; esta migration não é executada pela aplicação.

alter table public.proposals
  add constraint proposals_status_allowed
  check (
    status is null
    or status in (
      'Rascunho',
      'Enviada',
      'Em negociação',
      'Aprovada',
      'Rejeitada',
      'Cancelada',
      'Expirada',
      -- Compatibilidade com propostas criadas antes da padronização.
      'Preparação'
    )
  ) not valid;

-- NOT VALID preserva valores históricos fora da lista, mas valida INSERTs e
-- UPDATEs futuros. A validação completa pode ser feita após a revisão dos
-- registros legados.
