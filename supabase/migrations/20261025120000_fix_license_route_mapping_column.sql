-- A tabela existente usa system_module_id, não system_id/module_id.
-- A migration histórica de rotas pode ter criado a tabela anteriormente e falhado
-- ao criar o índice baseado em uma coluna inexistente.
drop index if exists public.license_route_mappings_system_idx;

create index if not exists license_route_mappings_system_module_idx
  on public.license_route_mappings(system_module_id);
