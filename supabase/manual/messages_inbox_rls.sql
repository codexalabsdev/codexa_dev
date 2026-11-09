-- Permite que cada usuário veja as mensagens recebidas para si no CRM.
-- Administradores e usuários com contacts.view continuam vendo conforme a permissão.
-- Execute este script no Supabase SQL Editor.

alter table public.messages enable row level security;

drop policy if exists "messages_select_assigned_or_permitted" on public.messages;

create policy "messages_select_assigned_or_permitted"
on public.messages
for select
to authenticated
using (
  responsible_id = (select auth.uid())
  or public.has_workspace_permission('contacts', 'view')
);
