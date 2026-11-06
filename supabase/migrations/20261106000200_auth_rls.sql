-- =====================================================================
-- Identity helpers + Row Level Security
--
-- Supabase verifies the Firebase ID token's signature (third-party auth).
-- Here we additionally pin the issuer/audience to OUR Firebase project and
-- resolve the caller's profile from the verified `sub` claim. Client-supplied
-- user ids are never trusted for authorisation.
--
-- NOTE: auth.uid() casts `sub` to uuid and would fail for Firebase UIDs, so
-- it is never used. Use public.current_profile_id() instead.
-- =====================================================================

-- True only for a Firebase token issued for the configured project.
create or replace function private.is_trusted_token()
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select (auth.jwt() ->> 'iss') = 'https://securetoken.google.com/' || s.value
       and (auth.jwt() ->> 'aud') = s.value
    from private.app_settings s
    where s.key = 'firebase_project_id'
  ), false)
$$;

-- The verified Firebase UID of the caller (or null).
create or replace function public.firebase_uid()
returns text
language sql stable security definer set search_path = '' as $$
  select case when private.is_trusted_token() then nullif(auth.jwt() ->> 'sub', '') end
$$;

-- The caller's profile id (or null if not signed in / no profile yet / deleted).
create or replace function public.current_profile_id()
returns uuid
language sql stable security definer set search_path = '' as $$
  select p.id
  from public.profiles p
  where p.firebase_uid = public.firebase_uid()
    and p.deleted_at is null
$$;

-- Is the caller an active member of the group?
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = p_group_id
      and m.profile_id = public.current_profile_id()
      and m.status = 'active'
  )
$$;

-- Is the caller an owner/admin of the group?
create or replace function public.is_group_admin(p_group_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = p_group_id
      and m.profile_id = public.current_profile_id()
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  )
$$;

-- Can the caller see this profile? (Self, or anyone who is or was in a group
-- the caller is active in — so old expenses still show who paid.)
create or replace function public.can_see_profile(p_profile_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select p_profile_id = public.current_profile_id()
      or exists (
        select 1
        from public.group_members mine
        join public.group_members theirs on theirs.group_id = mine.group_id
        where mine.profile_id = public.current_profile_id()
          and mine.status = 'active'
          and theirs.profile_id = p_profile_id
      )
      or exists ( -- people who invited me can be seen while the invite is open
        select 1 from public.group_invitations i
        where i.invitee_profile_id = public.current_profile_id()
          and i.invited_by = p_profile_id
          and i.status = 'pending'
      )
$$;

-- ---------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.user_preferences    enable row level security;
alter table public.groups              enable row level security;
alter table public.group_members       enable row level security;
alter table public.group_invitations   enable row level security;
alter table public.expense_categories  enable row level security;
alter table public.expenses            enable row level security;
alter table public.expense_splits      enable row level security;
alter table public.receipts            enable row level security;
alter table public.settlements         enable row level security;
alter table public.activity_logs       enable row level security;
alter table public.audit_logs          enable row level security;
alter table public.notifications       enable row level security;
alter table public.push_tokens         enable row level security;

-- ---------------------------------------------------------------------
-- Privileges: anon gets nothing. authenticated may read (RLS-filtered) and
-- may only update a handful of self-owned columns. Every other write goes
-- through SECURITY DEFINER RPCs.
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
-- Per-schema defaults cannot revoke the GLOBAL "EXECUTE to PUBLIC" default, so revoke it globally too.
alter default privileges revoke execute on functions from public;

grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;

grant update (full_name, phone, avatar_url, default_currency, time_zone) on public.profiles to authenticated;
grant update (region, number_format, date_format, appearance,
              notify_push, notify_expenses, notify_settlements, notify_invites, notify_reminders)
  on public.user_preferences to authenticated;
grant update (read_at) on public.notifications to authenticated;

grant execute on function public.firebase_uid() to authenticated;
grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_admin(uuid) to authenticated;
grant execute on function public.can_see_profile(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Policies. `(select fn())` lets Postgres evaluate the function once per
-- statement instead of once per row.
-- ---------------------------------------------------------------------

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (deleted_at is null and public.can_see_profile(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select public.current_profile_id()))
  with check (id = (select public.current_profile_id()));

-- user_preferences
create policy prefs_select_self on public.user_preferences for select to authenticated
  using (profile_id = (select public.current_profile_id()));
create policy prefs_update_self on public.user_preferences for update to authenticated
  using (profile_id = (select public.current_profile_id()))
  with check (profile_id = (select public.current_profile_id()));

-- groups
create policy groups_select_member on public.groups for select to authenticated
  using (public.is_group_member(id));

-- group_members
create policy members_select on public.group_members for select to authenticated
  using (public.is_group_member(group_id));

-- group_invitations: members see the group's invites; invitees see their own
create policy invitations_select on public.group_invitations for select to authenticated
  using (public.is_group_member(group_id) or invitee_profile_id = (select public.current_profile_id()));

-- expense_categories: reference data
create policy categories_select on public.expense_categories for select to authenticated using (true);

-- expenses / splits / receipts / settlements: group members only
create policy expenses_select on public.expenses for select to authenticated
  using (public.is_group_member(group_id));
create policy splits_select on public.expense_splits for select to authenticated
  using (public.is_group_member(group_id));
create policy receipts_select on public.receipts for select to authenticated
  using (public.is_group_member(group_id));
create policy settlements_select on public.settlements for select to authenticated
  using (public.is_group_member(group_id));

-- activity: group events for members; personal events (no group) for the actor
create policy activity_select on public.activity_logs for select to authenticated
  using (
    (group_id is not null and public.is_group_member(group_id))
    or (group_id is null and actor_id = (select public.current_profile_id()))
  );

create policy audit_select on public.audit_logs for select to authenticated
  using (public.is_group_member(group_id));

-- notifications: own only
create policy notifications_select_own on public.notifications for select to authenticated
  using (recipient_id = (select public.current_profile_id()));
create policy notifications_update_own on public.notifications for update to authenticated
  using (recipient_id = (select public.current_profile_id()))
  with check (recipient_id = (select public.current_profile_id()));

-- push_tokens: own only (writes via RPC)
create policy push_tokens_select_own on public.push_tokens for select to authenticated
  using (profile_id = (select public.current_profile_id()));
