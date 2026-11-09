-- Teste de revisão manual para a migration 20261023150000_proposal_status.sql.
-- Executar em uma cópia/ambiente de teste com Supabase autenticado.

do $$
declare
  constraint_definition text;
begin
  select pg_get_constraintdef(oid)
    into constraint_definition
  from pg_constraint
  where conrelid = 'public.proposals'::regclass
    and conname = 'proposals_status_allowed';

  if constraint_definition is null then
    raise exception 'A constraint proposals_status_allowed não foi criada';
  end if;

  if constraint_definition not like '%Rascunho%'
    or constraint_definition not like '%Em negociação%'
    or constraint_definition not like '%Expirada%' then
    raise exception 'A lista de status da constraint está incompleta: %', constraint_definition;
  end if;
end;
$$;

-- Validação funcional esperada após aplicar a migration:
-- 1. Criar uma proposta pela tela com cada status predefinido.
-- 2. Editar a proposta e confirmar que o status selecionado permanece salvo.
-- 3. Tentar INSERT/UPDATE com status 'Status inválido' e confirmar rejeição
--    pela constraint proposals_status_allowed.
-- 4. Confirmar que propostas legadas com status 'Preparação' continuam visíveis.
