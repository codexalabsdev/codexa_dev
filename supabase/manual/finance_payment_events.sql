-- Histórico auditável de pagamentos do Financeiro.
-- Aplicação manual: executar no Supabase SQL Editor somente após revisar o schema atual.
-- Não executado pelo v0. Preserva paid_amount histórico; não inventa datas para pagamentos antigos.

create table if not exists public.finance_payment_events (
  id uuid primary key default gen_random_uuid(),
  account_type text not null check (account_type in ('receivable', 'payable')),
  account_id uuid not null,
  amount numeric(14, 2) not null check (amount > 0),
  payment_date date not null,
  payment_method text,
  notes text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists finance_payment_events_account_idx
  on public.finance_payment_events (account_type, account_id, payment_date desc);
create index if not exists finance_payment_events_payment_date_idx
  on public.finance_payment_events (payment_date desc);

alter table public.finance_payment_events enable row level security;
revoke all on public.finance_payment_events from anon, authenticated;
grant select on public.finance_payment_events to authenticated;

drop policy if exists finance_payment_events_select on public.finance_payment_events;
create policy finance_payment_events_select
  on public.finance_payment_events
  for select to authenticated
  using (
    (account_type = 'receivable' and exists (
      select 1 from public.accounts_receivable ar where ar.id = account_id
    ))
    or
    (account_type = 'payable' and exists (
      select 1 from public.accounts_payable ap where ap.id = account_id
    ))
  );

create or replace function public.record_finance_payment(
  p_account_type text,
  p_account_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_payment_method text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_module text;
  v_total numeric(14, 2);
  v_paid numeric(14, 2);
  v_status text;
  v_payment_id uuid;
  v_receivable public.accounts_receivable%rowtype;
  v_payable public.accounts_payable%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida.' using errcode = '28000';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) or p_payment_date is null or p_payment_date > current_date then
    raise exception 'Informe um valor positivo com até duas casas decimais e uma data de pagamento válida.' using errcode = '22023';
  end if;

  if p_account_type = 'receivable' then
    v_module := 'accounts_receivable';
    if not public.has_workspace_permission(v_module, 'update') then
      raise exception 'Sem permissão para registrar recebimentos.' using errcode = '42501';
    end if;
    select * into v_receivable
      from public.accounts_receivable
      where id = p_account_id
      for update;
    if not found or not public.workspace_row_scope(v_module, to_jsonb(v_receivable)) then
      raise exception 'Conta a receber não encontrada.' using errcode = 'P0002';
    end if;
    v_total := coalesce(v_receivable.final_amount, 0);
    v_paid := coalesce(v_receivable.paid_amount, 0);
    if lower(coalesce(v_receivable.status, '')) like 'cancelad%' then
      raise exception 'Não é possível registrar pagamento em uma conta cancelada.' using errcode = '22023';
    end if;
    if v_paid + p_amount > v_total then
      raise exception 'O pagamento excede o saldo em aberto.' using errcode = '22023';
    end if;
    v_paid := v_paid + p_amount;
    v_status := case when v_paid >= v_total then 'Recebido' else 'Parcialmente recebida' end;
    update public.accounts_receivable set paid_amount = v_paid, status = v_status where id = p_account_id;
  elsif p_account_type = 'payable' then
    v_module := 'accounts_payable';
    if not public.has_workspace_permission(v_module, 'update') then
      raise exception 'Sem permissão para registrar pagamentos.' using errcode = '42501';
    end if;
    select * into v_payable
      from public.accounts_payable
      where id = p_account_id
      for update;
    if not found or not public.workspace_row_scope(v_module, to_jsonb(v_payable)) then
      raise exception 'Conta a pagar não encontrada.' using errcode = 'P0002';
    end if;
    v_total := coalesce(v_payable.amount, 0);
    v_paid := coalesce(v_payable.paid_amount, 0);
    if lower(coalesce(v_payable.status, '')) like 'cancelad%' then
      raise exception 'Não é possível registrar pagamento em uma conta cancelada.' using errcode = '22023';
    end if;
    if v_paid + p_amount > v_total then
      raise exception 'O pagamento excede o saldo em aberto.' using errcode = '22023';
    end if;
    v_paid := v_paid + p_amount;
    v_status := case when v_paid >= v_total then 'Pago' else 'Parcialmente paga' end;
    update public.accounts_payable set paid_amount = v_paid, status = v_status where id = p_account_id;
  else
    raise exception 'Tipo de conta inválido.' using errcode = '22023';
  end if;

  insert into public.finance_payment_events (
    account_type, account_id, amount, payment_date, payment_method, notes, created_by
  ) values (
    p_account_type, p_account_id, p_amount, p_payment_date,
    nullif(btrim(p_payment_method), ''), nullif(btrim(p_notes), ''), auth.uid()
  ) returning id into v_payment_id;

  return v_payment_id;
end;
$$;

revoke all on function public.record_finance_payment(text, uuid, numeric, date, text, text) from public, anon;
grant execute on function public.record_finance_payment(text, uuid, numeric, date, text, text) to authenticated;
