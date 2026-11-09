-- Permite que administradores excluam modelos de recorrência financeira.
-- Execute este script no Supabase SQL Editor.

alter table public.financial_recurring_schedules enable row level security;

drop policy if exists "financial_recurring_schedules_delete_finance" on public.financial_recurring_schedules;

create policy "financial_recurring_schedules_delete_finance"
on public.financial_recurring_schedules
for delete
to authenticated
using (public.has_workspace_permission('finance', 'delete'));
