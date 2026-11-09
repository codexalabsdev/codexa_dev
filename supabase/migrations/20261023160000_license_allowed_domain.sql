set search_path = public, extensions;

alter table public.licenses
  add column if not exists allowed_domain text;

comment on column public.licenses.allowed_domain is 'Hostname autorizado para validar a licença; permite o domínio exato e seus subdomínios.';

update public.licenses
set allowed_domain = lower(trim(regexp_replace(regexp_replace(allowed_domain, '^https?://', ''), '/$', '')))
where allowed_domain is not null;

create index if not exists licenses_allowed_domain_idx
  on public.licenses (allowed_domain)
  where allowed_domain is not null;

alter table public.licenses
  add constraint licenses_allowed_domain_format
  check (allowed_domain is null or allowed_domain = lower(trim(allowed_domain)) and allowed_domain !~ '[/:?#\\s]');
