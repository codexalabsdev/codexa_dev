create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid,
  message_type text default 'internal',
  content text,
  actor_name text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.support_messages
  add column if not exists ticket_id uuid,
  add column if not exists message_type text,
  add column if not exists content text,
  add column if not exists actor_name text,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

update public.support_messages
set ticket_id = ticket_id,
    message_type = coalesce(message_type, 'internal'),
    content = coalesce(content, ''),
    created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, now())
where ticket_id is null or message_type is null or content is null or created_at is null or updated_at is null;

alter table public.support_messages
  alter column ticket_id set not null,
  alter column message_type set default 'internal',
  alter column message_type set not null,
  alter column content set not null,
  alter column created_at set default now(),
  alter column updated_at set default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.support_messages'::regclass
      and conname = 'support_messages_ticket_id_fkey'
  ) then
    alter table public.support_messages
      add constraint support_messages_ticket_id_fkey
      foreign key (ticket_id) references public.support_tickets(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.support_messages'::regclass
      and conname = 'support_messages_message_type_check'
  ) then
    alter table public.support_messages
      add constraint support_messages_message_type_check
      check (message_type in ('internal', 'external', 'system'));
  end if;
end $$;

create index if not exists support_messages_ticket_created_at_idx
  on public.support_messages (ticket_id, created_at desc);

create index if not exists support_messages_type_idx
  on public.support_messages (message_type, created_at desc);

create or replace function public.touch_support_message_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists support_message_touch_updated_at on public.support_messages;
create trigger support_message_touch_updated_at
before update on public.support_messages
for each row execute function public.touch_support_message_updated_at();

alter table public.support_messages enable row level security;

drop policy if exists support_messages_select on public.support_messages;
create policy support_messages_select on public.support_messages
for select
using (
  exists (
    select 1
    from public.support_tickets ticket
    where ticket.id = support_messages.ticket_id
      and public.has_workspace_permission('support', 'view')
  )
);

drop policy if exists support_messages_insert on public.support_messages;
create policy support_messages_insert on public.support_messages
for insert
with check (
  exists (
    select 1
    from public.support_tickets ticket
    where ticket.id = support_messages.ticket_id
      and public.has_workspace_permission('support', 'update')
  )
);

drop policy if exists support_messages_update on public.support_messages;
create policy support_messages_update on public.support_messages
for update
using (
  exists (
    select 1
    from public.support_tickets ticket
    where ticket.id = support_messages.ticket_id
      and public.has_workspace_permission('support', 'update')
  )
)
with check (
  exists (
    select 1
    from public.support_tickets ticket
    where ticket.id = support_messages.ticket_id
      and public.has_workspace_permission('support', 'update')
  )
);

drop policy if exists support_messages_delete on public.support_messages;
create policy support_messages_delete on public.support_messages
for delete
using (
  exists (
    select 1
    from public.support_tickets ticket
    where ticket.id = support_messages.ticket_id
      and public.has_workspace_permission('support', 'delete')
  )
);

comment on table public.support_messages is 'Histórico de interações e respostas do módulo de suporte';
comment on column public.support_messages.message_type is 'Tipo da interação: interna, externa ou do sistema';
comment on column public.support_messages.actor_name is 'Nome do ator que registrou a mensagem';
