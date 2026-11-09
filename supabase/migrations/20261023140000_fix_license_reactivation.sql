-- Corrige o Kill Switch: reativar uma licença deve restaurar is_active.
-- Aplicar no projeto Supabase central antes de usar PATCH status=active.

create or replace function public.set_license_active_from_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.is_active := lower(trim(coalesce(new.status, ''))) in ('active', 'ativa');
  return new;
end;
$$;

comment on function public.set_license_active_from_status() is
  'Mantém o Kill Switch mestre sincronizado com o status administrativo da licença.';
