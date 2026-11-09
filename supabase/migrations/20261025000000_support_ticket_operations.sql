create sequence if not exists public.support_ticket_number_seq;

alter table public.support_tickets
  add column if not exists impact text,
  add column if not exists first_response_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists last_status_change_at timestamptz,
  add column if not exists customer_visible_message text,
  add column if not exists internal_notes text;

create or replace function public.support_ticket_automation()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if new.ticket_number is null or btrim(new.ticket_number) = '' then
    new.ticket_number := 'SUP-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.support_ticket_number_seq')::text, 6, '0');
  end if;

  if tg_op = 'INSERT' then
    new.status := coalesce(new.status, 'Novo');
  end if;

  new.status := case lower(trim(new.status))
    when 'new' then 'Novo'
    when 'triagem' then 'Triagem'
    when 'open' then 'Aberto'
    when 'em andamento' then 'Em atendimento'
    when 'in_progress' then 'Em atendimento'
    when 'inprogress' then 'Em atendimento'
    when 'pending_customer' then 'Aguardando cliente'
    when 'awaiting_customer' then 'Aguardando cliente'
    when 'pending_team' then 'Aguardando equipe interna'
    when 'awaiting_internal' then 'Aguardando equipe interna'
    when 'scheduled' then 'Agendado'
    when 'resolved' then 'Resolvido'
    when 'closed' then 'Fechado'
    when 'cancelled' then 'Cancelado'
    when 'canceled' then 'Cancelado'
    else new.status
  end;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.last_status_change_at := now();

    if new.status = 'Em atendimento' and (old.status is null or old.status <> 'Em atendimento') and new.first_response_at is null then
      new.first_response_at := now();
    end if;

    if new.status = 'Fechado' and new.closed_at is null then
      new.closed_at := now();
    end if;

    if new.status in ('Resolvido', 'Fechado', 'Cancelado') and new.resolved_at is null then
      new.resolved_at := now();
    end if;
  elsif tg_op = 'INSERT' then
    new.last_status_change_at := now();

    if new.status = 'Em atendimento' and new.first_response_at is null then
      new.first_response_at := now();
    end if;

    if new.status = 'Fechado' and new.closed_at is null then
      new.closed_at := now();
    end if;

    if new.status in ('Resolvido', 'Fechado', 'Cancelado') and new.resolved_at is null then
      new.resolved_at := now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists support_ticket_automation on public.support_tickets;
create trigger support_ticket_automation
  before insert or update on public.support_tickets
  for each row execute function public.support_ticket_automation();

create index if not exists support_tickets_status_idx
  on public.support_tickets (status);

create index if not exists support_tickets_sector_idx
  on public.support_tickets (sector);

create index if not exists support_tickets_due_at_idx
  on public.support_tickets (due_at);
