-- =====================================================================
-- Account lifecycle, notifications, push, storage, realtime, grants
-- =====================================================================

-- Delete my account. Financial history other members rely on is preserved
-- but de-identified ("Deleted user"); the Firebase UID is released so the
-- same Google account can start fresh later. Refused while any balance is
-- outstanding so nobody silently loses money they are owed.
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.require_profile(); v_group uuid;
begin
  if exists (
    select 1 from public.group_members m
    where m.profile_id = v_me and m.status = 'active'
      and private.has_outstanding_balance(m.group_id, v_me)
  ) then
    raise exception 'balances_outstanding';
  end if;

  for v_group in select group_id from public.group_members where profile_id = v_me and status = 'active' loop
    -- Hand ownership over before leaving.
    if exists (select 1 from public.group_members where group_id = v_group and profile_id = v_me and role = 'owner') then
      update public.group_members set role = 'owner'
       where group_id = v_group and profile_id = (
         select profile_id from public.group_members
          where group_id = v_group and status = 'active' and profile_id <> v_me
          order by (role = 'admin') desc, joined_at asc limit 1);
    end if;
    update public.group_members set status = 'left', left_at = now(), role = 'member'
     where group_id = v_group and profile_id = v_me;
    if not exists (select 1 from public.group_members where group_id = v_group and status = 'active') then
      update public.groups set archived_at = coalesce(archived_at, now()) where id = v_group;
    end if;
  end loop;

  update public.group_invitations set status = 'revoked', responded_at = now()
   where status = 'pending' and (invitee_profile_id = v_me or invited_by = v_me);
  delete from public.push_tokens where profile_id = v_me;
  delete from public.notifications where recipient_id = v_me;
  delete from public.user_preferences where profile_id = v_me;

  update public.profiles set
    firebase_uid = 'deleted:' || id::text,
    full_name = 'Deleted user',
    email = null, phone = null, avatar_url = null,
    deleted_at = now()
  where id = v_me;
end $$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void
language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
   where recipient_id = private.require_profile()
     and read_at is null
     and (p_ids is null or id = any (p_ids))
$$;

create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.require_profile();
begin
  if p_token is null or char_length(p_token) not between 10 and 512 then raise exception 'invalid_input' using detail = 'token'; end if;
  insert into public.push_tokens (token, profile_id, platform) values (p_token, v_me, p_platform)
  on conflict (token) do update set profile_id = excluded.profile_id, platform = excluded.platform, updated_at = now();
end $$;

create or replace function public.unregister_push_token(p_token text)
returns void
language sql security definer set search_path = '' as $$
  delete from public.push_tokens where token = p_token and profile_id = private.require_profile()
$$;

-- ---------------------------------------------------------------------
-- Push dispatch: each new notification triggers the `push-dispatch` Edge
-- Function through pg_net. URL + shared secret live in Supabase Vault:
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/push-dispatch', 'push_dispatch_url');
--   select vault.create_secret('<random-secret>', 'push_dispatch_secret');
-- If the secrets are absent (local dev), dispatch is skipped silently.
-- ---------------------------------------------------------------------
create extension if not exists pg_net with schema extensions;

create or replace function private.dispatch_push()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  begin
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_dispatch_url';
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_dispatch_secret';
  exception when others then
    return null;
  end;
  if v_url is null or v_secret is null then return null; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', v_secret),
    body := jsonb_build_object('notification_id', new.id)
  );
  return null;
end $$;

create trigger notifications_dispatch_push
  after insert on public.notifications
  for each row execute function private.dispatch_push();

-- ---------------------------------------------------------------------
-- Storage
--   receipts/<group_id>/<expense_id>/<file>  → private, group members only
--   avatars/<profile_id>/<file>              → public read, owner write
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('receipts', 'receipts', false, 10485760, array['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf']),
  ('avatars',  'avatars',  true,  2097152,  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create or replace function public.storage_group_from_path(p_name text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end $$;
grant execute on function public.storage_group_from_path(text) to authenticated;

create policy receipts_read on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.is_group_member(public.storage_group_from_path(name)));
create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.is_group_member(public.storage_group_from_path(name)));

create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = (select public.current_profile_id())::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = (select public.current_profile_id())::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = (select public.current_profile_id())::text);

-- ---------------------------------------------------------------------
-- Realtime: clients subscribe and invalidate their caches. RLS still applies.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications, public.expenses, public.settlements, public.group_members;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Function grants. Start from zero, then allow-list. anon gets nothing.
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.firebase_uid(),
  public.current_profile_id(),
  public.is_group_member(uuid),
  public.is_group_admin(uuid),
  public.can_see_profile(uuid),
  public.storage_group_from_path(text)
to authenticated;

grant execute on function
  public.ensure_profile(text, text),
  public.complete_onboarding(text, text, text, text, text, text, text, text),
  public.find_profiles_by_email(text),
  public.get_friends(),
  public.create_group(text, public.group_type, text, text, text, uuid[]),
  public.update_group(uuid, text, public.group_type, text, text, text),
  public.set_group_archived(uuid, boolean),
  public.leave_group(uuid),
  public.remove_member(uuid, uuid),
  public.set_member_role(uuid, uuid, public.member_role),
  public.invite_profiles(uuid, uuid[]),
  public.get_invite_link(uuid),
  public.reset_invite_link(uuid),
  public.preview_invite(text),
  public.accept_invite(text),
  public.respond_invitation(uuid, boolean),
  public.revoke_invitation(uuid),
  public.save_expense(uuid, uuid, text, bigint, text, uuid, jsonb, public.split_method, text, date, text, uuid, integer),
  public.delete_expense(uuid),
  public.add_receipt(uuid, text, text, integer),
  public.record_settlement(uuid, uuid, uuid, uuid, bigint, text, public.payment_method, text, date, text),
  public.respond_settlement(uuid, boolean),
  public.delete_settlement(uuid),
  public.get_my_group_balances(),
  public.get_group_totals(uuid),
  public.get_spending_report(text, integer, date),
  public.send_reminder(uuid, uuid),
  public.delete_my_account(),
  public.mark_notifications_read(uuid[]),
  public.register_push_token(text, text),
  public.unregister_push_token(text)
to authenticated;
