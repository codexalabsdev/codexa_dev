-- Correção manual para o erro "Database error creating new user".
-- Execute este arquivo no SQL Editor do Supabase.
-- Ele remove apenas os nomes comuns de triggers customizados de cadastro.
-- Não altera auth.users, não apaga usuários e não mexe em team_members.

begin;

-- Triggers customizados comuns que podem falhar durante auth.admin.createUser.
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists handle_new_user on auth.users;
drop trigger if exists create_profile_on_signup on auth.users;
drop trigger if exists after_auth_user_created on auth.users;

-- Função de perfil padrão frequentemente criada junto desses triggers.
-- O app atual não depende de public.profiles para liberar o workspace.
drop function if exists public.handle_new_user();

commit;

-- Diagnóstico opcional: depois da correção, esta consulta deve retornar apenas
-- triggers internos do Supabase ou nenhum trigger customizado.
select
  trigger_name,
  event_manipulation,
  action_statement
from information_schema.triggers
where event_object_schema = 'auth'
  and event_object_table = 'users'
order by trigger_name;
