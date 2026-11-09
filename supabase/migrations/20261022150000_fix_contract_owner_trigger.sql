create or replace function public.assign_workspace_record_owner()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_temp
as $function$
begin
  if tg_table_name in ('leads', 'clients') then
    if new.owner_id is null
      and public.has_workspace_permission(tg_table_name, 'create') then
      new.owner_id := public.current_team_member_id();
    end if;
  elsif tg_table_name in ('proposals', 'contracts') then
    if new.responsible_id is null
      and public.has_workspace_permission(tg_table_name, 'create') then
      new.responsible_id := public.current_team_member_id();
    end if;
  end if;
  return new;
end;
$function$;
