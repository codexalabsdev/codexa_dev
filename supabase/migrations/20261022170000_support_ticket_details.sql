alter table public.support_tickets
  add column if not exists scheduled_at timestamptz,
  add column if not exists resolution text,
  add column if not exists resolved_at timestamptz;
