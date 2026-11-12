alter table public.change_requests
  add column if not exists due_at timestamptz,
  add column if not exists decision_notes text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.change_requests
  alter column status set default 'Recebida';

create or replace function public.set_change_request_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists change_requests_set_updated_at on public.change_requests;
create trigger change_requests_set_updated_at
before update on public.change_requests
for each row
execute function public.set_change_request_updated_at();
