-- Codexa: terminal de autenticação
-- Aplicação manual opcional no Supabase SQL Editor.
--
-- O terminal usa exclusivamente Supabase Auth existente via
-- signInWithPassword. Não são necessárias tabelas, credenciais paralelas,
-- sessões customizadas ou alterações de RLS para esta funcionalidade.
-- Este arquivo existe para registrar a decisão e permitir uma verificação
-- segura antes de aplicar qualquer SQL no projeto.

select
  to_regclass('auth.users') is not null as auth_users_available,
  to_regprocedure('auth.uid()') is not null as auth_uid_available;
