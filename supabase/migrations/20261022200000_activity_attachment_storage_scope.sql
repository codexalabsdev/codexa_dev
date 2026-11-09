set search_path = public, auth, pg_temp;

create or replace function public.workspace_storage_scope(p_name text, p_action text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_first_segment text := split_part(coalesce(p_name, ''), '/', 1);
  v_owner_id text;
  v_entity_type text;
  v_entity_id text;
  v_permission text;
begin
  if v_user_id is null then
    return false;
  end if;

  if v_first_segment ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_owner_id := v_first_segment;
    v_entity_type := split_part(coalesce(p_name, ''), '/', 2);
    v_entity_id := split_part(coalesce(p_name, ''), '/', 3);
  else
    v_entity_type := v_first_segment;
    v_entity_id := split_part(coalesce(p_name, ''), '/', 2);
  end if;

  if v_entity_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;

  v_permission := case p_action
    when 'select' then 'download'
    when 'insert' then 'upload'
    when 'delete' then 'delete'
    else 'update'
  end;

  if p_action = 'insert' and v_owner_id is distinct from v_user_id::text then
    return false;
  end if;
  if p_action = 'update' and v_owner_id is distinct from v_user_id::text then
    return false;
  end if;
  if p_action = 'delete'
    and v_owner_id = v_user_id::text
    and public.has_workspace_permission('attachments', 'upload')
    and not exists (
      select 1 from public.entity_attachments attachment
      where attachment.storage_path = p_name
    ) then
    return true;
  end if;

  return public.has_workspace_permission('attachments', v_permission)
    and public.workspace_attachment_scope(jsonb_build_object(
      'entity_type', v_entity_type,
      'entity_id', v_entity_id
    ));
end;
$function$;

drop policy if exists rbac_insert on public.entity_attachments;
create policy rbac_insert on public.entity_attachments
  as permissive for insert to authenticated
  with check (
    public.has_workspace_permission('attachments', 'upload')
    and public.workspace_attachment_scope(to_jsonb(entity_attachments))
    and uploaded_by = (select auth.uid())
    and storage_path like (select auth.uid()::text) || '/' || entity_type || '/' || entity_id::text || '/%'
    and file_name is not null
    and length(btrim(file_name)) > 0
    and file_size between 1 and 10485760
    and mime_type ~ '^[[:alnum:]!#$&^_.+-]+/[[:alnum:]!#$&^_.+-]+$'
  );
drop policy if exists rbac_insert_restrict on public.entity_attachments;
create policy rbac_insert_restrict on public.entity_attachments
  as restrictive for insert to authenticated
  with check (
    public.has_workspace_permission('attachments', 'upload')
    and public.workspace_attachment_scope(to_jsonb(entity_attachments))
    and uploaded_by = (select auth.uid())
    and storage_path like (select auth.uid()::text) || '/' || entity_type || '/' || entity_id::text || '/%'
    and file_name is not null
    and length(btrim(file_name)) > 0
    and file_size between 1 and 10485760
    and mime_type ~ '^[[:alnum:]!#$&^_.+-]+/[[:alnum:]!#$&^_.+-]+$'
  );
