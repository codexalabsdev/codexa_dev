begin;

alter table public.team_members
  add column if not exists phone_e164 text,
  add column if not exists whatsapp_enabled boolean not null default false;

alter table public.team_members
  drop constraint if exists team_members_phone_e164_format_check,
  add constraint team_members_phone_e164_format_check
    check (phone_e164 is null or phone_e164 ~ '^[+][1-9][0-9]{7,14}$'),
  drop constraint if exists team_members_whatsapp_requires_phone_check,
  add constraint team_members_whatsapp_requires_phone_check
    check (not whatsapp_enabled or phone_e164 is not null);

commit;
