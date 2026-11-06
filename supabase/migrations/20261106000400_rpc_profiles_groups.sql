-- =====================================================================
-- RPCs: profiles, groups, membership, invitations
-- All SECURITY DEFINER with an empty search_path; identity always comes
-- from the verified JWT via current_profile_id()/firebase_uid().
-- =====================================================================

-- ---------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------

-- Create the caller's profile on first sign-in, or return the existing one.
-- Idempotent: repeated sign-ins never create duplicates (unique firebase_uid).
create or replace function public.ensure_profile(p_full_name text default null, p_avatar_url text default null)
returns table (profile_id uuid, is_new boolean, onboarded boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid text := public.firebase_uid();
  v_email text := nullif(auth.jwt() ->> 'email', '');
  v_name text := left(coalesce(nullif(btrim(p_full_name), ''), nullif(auth.jwt() ->> 'name', ''), split_part(coalesce(v_email, 'Evenly user'), '@', 1)), 80);
  v_avatar text := left(coalesce(nullif(p_avatar_url, ''), nullif(auth.jwt() ->> 'picture', '')), 2048);
  v_id uuid;
  v_new boolean;
  v_onboarded boolean;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  insert into public.profiles as p (firebase_uid, full_name, email, avatar_url)
  values (v_uid, v_name, v_email, v_avatar)
  on conflict (firebase_uid) do update
    set email = coalesce(excluded.email, p.email)  -- keep email in sync with the verified token
  returning p.id, (xmax = 0), (p.onboarded_at is not null)
  into v_id, v_new, v_onboarded;

  insert into public.user_preferences (profile_id) values (v_id) on conflict do nothing;

  return query select v_id, v_new, v_onboarded;
end $$;

create or replace function public.complete_onboarding(
  p_full_name text,
  p_phone text default null,
  p_avatar_url text default null,
  p_default_currency text default 'USD',
  p_time_zone text default 'UTC',
  p_region text default 'US',
  p_number_format text default '1,234.56',
  p_date_format text default 'MM/DD/YYYY'
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.require_profile();
begin
  if char_length(btrim(coalesce(p_full_name, ''))) not between 1 and 80 then
    raise exception 'invalid_input' using detail = 'full_name';
  end if;
  update public.profiles set
    full_name = btrim(p_full_name),
    phone = nullif(btrim(coalesce(p_phone, '')), ''),
    avatar_url = coalesce(nullif(p_avatar_url, ''), avatar_url),
    default_currency = p_default_currency,
    time_zone = p_time_zone,
    onboarded_at = coalesce(onboarded_at, now())
  where id = v_me;

  update public.user_preferences set
    region = p_region, number_format = p_number_format, date_format = p_date_format
  where profile_id = v_me;
end $$;

-- Exact (case-insensitive) e-mail lookup to invite someone not yet a friend.
create or replace function public.find_profiles_by_email(p_email text)
returns table (id uuid, full_name text, avatar_url text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.avatar_url
  from public.profiles p
  where private.require_profile() is not null
    and lower(p.email) = lower(btrim(p_email))
    and p.deleted_at is null
    and p.id <> public.current_profile_id()
  limit 1
$$;

-- People who share at least one group with me, with the groups we share.
create or replace function public.get_friends()
returns table (profile_id uuid, full_name text, avatar_url text, email text, group_ids uuid[], group_names text[])
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.avatar_url, p.email,
         array_agg(g.id order by g.name), array_agg(g.name order by g.name)
  from public.group_members mine
  join public.group_members theirs on theirs.group_id = mine.group_id and theirs.profile_id <> mine.profile_id
  join public.groups g on g.id = mine.group_id
  join public.profiles p on p.id = theirs.profile_id and p.deleted_at is null
  where mine.profile_id = private.require_profile()
    and mine.status = 'active'
    and theirs.status = 'active'
  group by p.id, p.full_name, p.avatar_url, p.email
  order by p.full_name
$$;

-- ---------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------
create or replace function public.create_group(
  p_name text,
  p_type public.group_type,
  p_currency text,
  p_icon text default null,
  p_description text default null,
  p_invitee_ids uuid[] default '{}'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_profile();
  v_id uuid;
  v_icon text := coalesce(nullif(p_icon, ''), case p_type
    when 'home' then 'house' when 'trip' then 'plane' when 'couple' then 'heart'
    when 'work' then 'briefcase' else 'users' end);
  v_invitee uuid;
begin
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 60 then
    raise exception 'invalid_input' using detail = 'name';
  end if;
  if p_currency !~ '^[A-Z]{3}$' then raise exception 'invalid_input' using detail = 'currency'; end if;

  insert into public.groups (name, description, type, icon, currency, created_by)
  values (btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), p_type, v_icon, p_currency, v_me)
  returning id into v_id;

  insert into public.group_members (group_id, profile_id, role) values (v_id, v_me, 'owner');

  perform private.log_activity(v_id, v_me, 'group_created', 'group', v_id,
    jsonb_build_object('group_name', btrim(p_name), 'actor_name', private.profile_name(v_me)));

  foreach v_invitee in array coalesce(p_invitee_ids, '{}') loop
    perform private.invite_one(v_id, v_me, v_invitee);
  end loop;

  return v_id;
end $$;

create or replace function public.update_group(
  p_group_id uuid,
  p_name text,
  p_type public.group_type,
  p_icon text,
  p_currency text,
  p_description text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.require_profile(); v_before jsonb;
begin
  if not public.is_group_admin(p_group_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 60 then raise exception 'invalid_input' using detail = 'name'; end if;
  if p_currency !~ '^[A-Z]{3}$' then raise exception 'invalid_input' using detail = 'currency'; end if;
  if p_icon !~ '^[a-z0-9-]{1,40}$' then raise exception 'invalid_input' using detail = 'icon'; end if;

  select to_jsonb(g) into v_before from public.groups g where g.id = p_group_id;
  update public.groups set name = btrim(p_name), type = p_type, icon = p_icon, currency = p_currency,
    description = nullif(btrim(coalesce(p_description, '')), '')
  where id = p_group_id;
  perform private.write_audit(p_group_id, 'group', p_group_id, 'update', v_me, v_before,
    (select to_jsonb(g) from public.groups g where g.id = p_group_id));
  perform private.log_activity(p_group_id, v_me, 'group_updated', 'group', p_group_id,
    jsonb_build_object('group_name', btrim(p_name), 'actor_name', private.profile_name(v_me)));
end $$;

create or replace function public.set_group_archived(p_group_id uuid, p_archived boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.require_profile();
begin
  if not public.is_group_admin(p_group_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.groups set archived_at = case when p_archived then coalesce(archived_at, now()) end where id = p_group_id;
  perform private.log_activity(p_group_id, v_me, case when p_archived then 'group_archived' else 'group_restored' end,
    'group', p_group_id, jsonb_build_object('actor_name', private.profile_name(v_me)));
end $$;

-- ---------------------------------------------------------------------
-- Membership
-- ---------------------------------------------------------------------
create or replace function private.add_member(p_group_id uuid, p_profile_id uuid, p_invited_by uuid)
returns boolean -- true if newly (re)joined
language plpgsql security definer set search_path = '' as $$
declare v_joined boolean := false;
begin
  insert into public.group_members as m (group_id, profile_id, role, status, invited_by)
  values (p_group_id, p_profile_id, 'member', 'active', p_invited_by)
  on conflict (group_id, profile_id) do update
    set status = 'active', role = 'member', left_at = null, joined_at = now(), invited_by = excluded.invited_by
    where m.status <> 'active'
  returning true into v_joined;

  if coalesce(v_joined, false) then
    perform private.log_activity(p_group_id, p_profile_id, 'member_joined', 'member', p_profile_id,
      jsonb_build_object('member_name', private.profile_name(p_profile_id),
                         'invited_by', p_invited_by,
                         'invited_by_name', case when p_invited_by is not null then private.profile_name(p_invited_by) end,
                         'group_name', (select name from public.groups where id = p_group_id)));
    -- Tell the other members.
    insert into public.notifications (recipient_id, type, body, data, group_id, actor_id)
    select m.profile_id, 'member_joined',
           private.first_name(p_profile_id) || ' joined ' || g.name,
           jsonb_build_object('group_id', p_group_id),
           p_group_id, p_profile_id
    from public.group_members m join public.groups g on g.id = m.group_id
    where m.group_id = p_group_id and m.status = 'active' and m.profile_id <> p_profile_id;
  end if;
  return coalesce(v_joined, false);
end $$;

create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_profile();
  v_role public.member_role;
  v_successor uuid;
begin
  select role into v_role from public.group_members
   where group_id = p_group_id and profile_id = v_me and status = 'active' for update;
  if not found then raise exception 'not_member' using errcode = '42501'; end if;
  if private.has_outstanding_balance(p_group_id, v_me) then raise exception 'balances_outstanding'; end if;

  update public.group_members set status = 'left', left_at = now()
   where group_id = p_group_id and profile_id = v_me;

  if v_role = 'owner' then
    select profile_id into v_successor from public.group_members
     where group_id = p_group_id and status = 'active'
     order by (role = 'admin') desc, joined_at asc limit 1;
    if v_successor is null then
      update public.groups set archived_at = coalesce(archived_at, now()) where id = p_group_id;
    else
      update public.group_members set role = 'owner' where group_id = p_group_id and profile_id = v_successor;
    end if;
  end if;

  perform private.log_activity(p_group_id, v_me, 'member_left', 'member', v_me,
    jsonb_build_object('member_name', private.profile_name(v_me)));
end $$;

create or replace function public.remove_member(p_group_id uuid, p_profile_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.require_profile(); v_role public.member_role;
begin
  if not public.is_group_admin(p_group_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_profile_id = v_me then raise exception 'invalid_input' using detail = 'use leave_group'; end if;
  select role into v_role from public.group_members
   where group_id = p_group_id and profile_id = p_profile_id and status = 'active' for update;
  if not found then raise exception 'not_found'; end if;
  if v_role = 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  if private.has_outstanding_balance(p_group_id, p_profile_id) then raise exception 'balances_outstanding'; end if;

  update public.group_members set status = 'removed', left_at = now()
   where group_id = p_group_id and profile_id = p_profile_id;
  perform private.log_activity(p_group_id, v_me, 'member_removed', 'member', p_profile_id,
    jsonb_build_object('member_name', private.profile_name(p_profile_id), 'actor_name', private.profile_name(v_me)));
end $$;

create or replace function public.set_member_role(p_group_id uuid, p_profile_id uuid, p_role public.member_role)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.require_profile();
begin
  if not exists (select 1 from public.group_members where group_id = p_group_id and profile_id = v_me
                 and status = 'active' and role = 'owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_profile_id = v_me or p_role = 'owner' then raise exception 'invalid_input' using detail = 'role'; end if;
  update public.group_members set role = p_role
   where group_id = p_group_id and profile_id = p_profile_id and status = 'active';
  if not found then raise exception 'not_found'; end if;
end $$;

-- ---------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------
create or replace function private.invite_one(p_group_id uuid, p_inviter uuid, p_invitee uuid)
returns boolean -- true if a new invitation was created
language plpgsql security definer set search_path = '' as $$
declare v_group text;
begin
  if p_invitee is null or p_invitee = p_inviter then return false; end if;
  if not exists (select 1 from public.profiles where id = p_invitee and deleted_at is null) then return false; end if;
  if private.is_active_member(p_group_id, p_invitee) then return false; end if;

  insert into public.group_invitations (group_id, kind, invitee_profile_id, invited_by)
  values (p_group_id, 'direct', p_invitee, p_inviter)
  on conflict (group_id, invitee_profile_id) where kind = 'direct' and status = 'pending' do nothing;
  if not found then return false; end if;

  select name into v_group from public.groups where id = p_group_id;
  perform private.notify(p_invitee, 'group_invite',
    private.first_name(p_inviter) || ' invited you to ' || v_group,
    jsonb_build_object('group_id', p_group_id,
                       'invitation_id', (select id from public.group_invitations
                                          where group_id = p_group_id and invitee_profile_id = p_invitee and status = 'pending'),
                       'group_name', v_group,
                       'currency', (select currency from public.groups where id = p_group_id),
                       'member_count', (select count(*) from public.group_members where group_id = p_group_id and status = 'active'),
                       'actor_name', private.profile_name(p_inviter)),
    p_group_id, p_inviter);
  return true;
end $$;

create or replace function public.invite_profiles(p_group_id uuid, p_profile_ids uuid[])
returns integer
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.require_profile(); v_n int := 0; v_id uuid;
begin
  perform private.require_member(p_group_id, v_me);
  perform private.require_active_group(p_group_id);
  if coalesce(array_length(p_profile_ids, 1), 0) > 50 then raise exception 'invalid_input' using detail = 'too many'; end if;
  foreach v_id in array coalesce(p_profile_ids, '{}') loop
    if private.invite_one(p_group_id, v_me, v_id) then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;

-- Return the group's active share link, creating one if needed.
create or replace function public.get_invite_link(p_group_id uuid)
returns table (code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.require_profile();
begin
  perform private.require_member(p_group_id, v_me);
  perform private.require_active_group(p_group_id);
  return query
    select i.code, i.expires_at from public.group_invitations i
     where i.group_id = p_group_id and i.kind = 'link' and i.status = 'pending'
       and i.expires_at > now() + interval '1 day'
       and (i.max_uses is null or i.use_count < i.max_uses)
     order by i.created_at desc limit 1;
  if found then return; end if;

  return query
    insert into public.group_invitations as i (group_id, kind, code, invited_by)
    values (p_group_id, 'link', private.new_invite_code(), v_me)
    returning i.code, i.expires_at;
end $$;

-- Invalidate the current link and issue a fresh one.
create or replace function public.reset_invite_link(p_group_id uuid)
returns table (code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.require_profile();
begin
  if not public.is_group_admin(p_group_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.group_invitations set status = 'revoked', responded_at = now()
   where group_id = p_group_id and kind = 'link' and status = 'pending';
  return query select * from public.get_invite_link(p_group_id);
end $$;

create or replace function private.usable_link(p_code text)
returns public.group_invitations
language sql stable security definer set search_path = '' as $$
  select i.* from public.group_invitations i
   join public.groups g on g.id = i.group_id
   where i.code = lower(btrim(p_code)) and i.kind = 'link' and i.status = 'pending'
     and i.expires_at > now() and (i.max_uses is null or i.use_count < i.max_uses)
     and g.archived_at is null
$$;

-- What a not-yet-member sees before joining via link.
create or replace function public.preview_invite(p_code text)
returns table (group_id uuid, group_name text, icon text, currency char(3), member_count bigint,
               inviter_name text, already_member boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := private.require_profile(); v_inv public.group_invitations;
begin
  v_inv := private.usable_link(p_code);
  if v_inv.id is null then raise exception 'invite_invalid'; end if;
  return query
    select g.id, g.name, g.icon, g.currency,
           (select count(*) from public.group_members m where m.group_id = g.id and m.status = 'active'),
           private.profile_name(v_inv.invited_by),
           private.is_active_member(g.id, v_me)
    from public.groups g where g.id = v_inv.group_id;
end $$;

create or replace function public.accept_invite(p_code text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.require_profile(); v_inv public.group_invitations;
begin
  select * into v_inv from public.group_invitations
   where id = (private.usable_link(p_code)).id for update;
  if v_inv.id is null then raise exception 'invite_invalid'; end if;
  if private.add_member(v_inv.group_id, v_me, v_inv.invited_by) then
    update public.group_invitations set use_count = use_count + 1 where id = v_inv.id;
  end if;
  -- Close any direct invite I had for the same group.
  update public.group_invitations set status = 'accepted', responded_at = now()
   where group_id = v_inv.group_id and invitee_profile_id = v_me and status = 'pending';
  return v_inv.group_id;
end $$;

create or replace function public.respond_invitation(p_invitation_id uuid, p_accept boolean)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.require_profile(); v_inv public.group_invitations;
begin
  select * into v_inv from public.group_invitations
   where id = p_invitation_id and kind = 'direct' and invitee_profile_id = v_me for update;
  if not found or v_inv.status <> 'pending' or v_inv.expires_at <= now() then raise exception 'invite_invalid'; end if;
  if p_accept then
    perform private.require_active_group(v_inv.group_id);
    perform private.add_member(v_inv.group_id, v_me, v_inv.invited_by);
  end if;
  update public.group_invitations set status = case when p_accept then 'accepted'::public.invitation_status
                                                    else 'declined'::public.invitation_status end,
                                      responded_at = now()
   where id = p_invitation_id;
  -- The invite notification is no longer actionable.
  update public.notifications set read_at = coalesce(read_at, now())
   where recipient_id = v_me and type = 'group_invite' and data ->> 'invitation_id' = p_invitation_id::text;
  return v_inv.group_id;
end $$;

create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.require_profile(); v_inv public.group_invitations;
begin
  select * into v_inv from public.group_invitations where id = p_invitation_id for update;
  if not found then raise exception 'not_found'; end if;
  if not (v_inv.invited_by = v_me or public.is_group_admin(v_inv.group_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.group_invitations set status = 'revoked', responded_at = now()
   where id = p_invitation_id and status = 'pending';
end $$;
