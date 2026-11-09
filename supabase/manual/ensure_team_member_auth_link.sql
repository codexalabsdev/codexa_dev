-- Aplicação manual opcional.
-- A API já valida e repara o vínculo antes de responder sucesso.
-- Este CHECK impede novos registros sem user_id sem bloquear os registros antigos.
-- Depois de corrigir os registros antigos, valide e torne a coluna NOT NULL.

begin;

alter table public.team_members
drop constraint if exists team_members_user_id_required;

alter table public.team_members
add constraint team_members_user_id_required
check (user_id is not null) not valid;

commit;

-- Após corrigir os registros existentes:
-- alter table public.team_members validate constraint team_members_user_id_required;
-- alter table public.team_members alter column user_id set not null;
