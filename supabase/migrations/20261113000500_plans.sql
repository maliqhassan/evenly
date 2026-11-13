-- =====================================================================
-- Plans: Free and Pro.
--
-- Free users can have a limited number of active groups they created and
-- add a limited number of expenses per calendar month (in their time zone).
-- The limits are enforced by triggers on the tables themselves, so every
-- path (the app, CSV import, recurring expenses) is covered and replays of
-- an idempotent create never count twice (they never insert).
--
-- Never limited: joining groups, editing or deleting expenses, settling up.
-- The numbers live in private.app_settings so they can change without a
-- release. 'plan_self_service' lets users switch plans themselves while
-- payments aren't set up; turn it off before launch.
-- =====================================================================

alter table public.profiles
  add column plan text not null default 'free' check (plan in ('free', 'pro')),
  add column plan_updated_at timestamptz;

insert into private.app_settings (key, value) values
  ('free_group_limit', '3'),
  ('free_monthly_expense_limit', '15'),
  ('plan_self_service', 'true')
on conflict (key) do nothing;

create or replace function private.setting_int(p_key text, p_default integer)
returns integer language sql stable set search_path = '' as $$
  select coalesce((select value::integer from private.app_settings where key = p_key), p_default)
$$;

create or replace function private.is_pro(p_profile_id uuid)
returns boolean language sql stable set search_path = '' as $$
  select coalesce((select plan = 'pro' from public.profiles where id = p_profile_id), false)
$$;

-- Start of the current month in the user's time zone (UTC if it's unknown).
create or replace function private.month_start(p_profile_id uuid)
returns timestamptz language plpgsql stable set search_path = '' as $$
declare
  v_tz text;
begin
  select time_zone into v_tz from public.profiles where id = p_profile_id;
  begin
    return date_trunc('month', now() at time zone coalesce(v_tz, 'UTC')) at time zone coalesce(v_tz, 'UTC');
  exception when others then
    return date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  end;
end $$;

create or replace function private.groups_used(p_profile_id uuid)
returns integer language sql stable set search_path = '' as $$
  select count(*)::integer
    from public.groups g
    join public.group_members m on m.group_id = g.id and m.profile_id = p_profile_id and m.status = 'active'
   where g.created_by = p_profile_id and g.archived_at is null
$$;

create or replace function private.expenses_used(p_profile_id uuid)
returns integer language sql stable set search_path = '' as $$
  select count(*)::integer
    from public.expenses
   where created_by = p_profile_id
     and deleted_at is null
     and created_at >= private.month_start(p_profile_id)
$$;

-- ---------------------------------------------------------------------
-- Enforcement
-- ---------------------------------------------------------------------
create or replace function private.enforce_group_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    -- Only restoring an archived group counts, and only when its creator does it.
    if not (old.archived_at is not null and new.archived_at is null) then return new; end if;
    if public.current_profile_id() is distinct from new.created_by then return new; end if;
  end if;
  if not private.is_pro(new.created_by)
     and private.groups_used(new.created_by) >= private.setting_int('free_group_limit', 3) then
    raise exception 'plan_limit' using detail = 'groups';
  end if;
  return new;
end $$;

create trigger groups_plan_limit before insert or update of archived_at on public.groups
  for each row execute function private.enforce_group_limit();

create or replace function private.enforce_expense_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_pro(new.created_by)
     and private.expenses_used(new.created_by) >= private.setting_int('free_monthly_expense_limit', 15) then
    raise exception 'plan_limit' using detail = 'expenses';
  end if;
  return new;
end $$;

create trigger expenses_plan_limit before insert on public.expenses
  for each row execute function private.enforce_expense_limit();

-- ---------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------
create or replace function public.get_my_plan()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.require_profile();
  v_start timestamptz := private.month_start(v_me);
  v_tz text;
begin
  select coalesce(time_zone, 'UTC') into v_tz from public.profiles where id = v_me;
  return jsonb_build_object(
    'plan', (select plan from public.profiles where id = v_me),
    'group_limit', private.setting_int('free_group_limit', 3),
    'groups_used', private.groups_used(v_me),
    'expense_limit', private.setting_int('free_monthly_expense_limit', 15),
    'expenses_used', private.expenses_used(v_me),
    'resets_on', ((v_start + interval '1 month') at time zone v_tz)::date,
    'self_service', coalesce((select value = 'true' from private.app_settings where key = 'plan_self_service'), false)
  );
end $$;

-- Testing only: switch your own plan. Refused once 'plan_self_service' is off;
-- then only the billing backend (service role) changes plans.
create or replace function public.set_my_plan(p_plan text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_profile();
begin
  if coalesce(p_plan, '') not in ('free', 'pro') then raise exception 'invalid_input' using detail = 'plan'; end if;
  if not coalesce((select value = 'true' from private.app_settings where key = 'plan_self_service'), false) then
    raise exception 'forbidden';
  end if;
  update public.profiles set plan = p_plan, plan_updated_at = now() where id = v_me;
end $$;

revoke all on function public.get_my_plan(), public.set_my_plan(text) from public, anon;
grant execute on function public.get_my_plan(), public.set_my_plan(text) to authenticated;

-- The app can't write plan/plan_updated_at directly: authenticated users only
-- have UPDATE on the profile columns granted in 20261106000200_auth_rls.sql.

-- ---------------------------------------------------------------------
-- Recurring expenses: hitting the monthly limit skips today's run instead
-- of pausing the template; it catches up once there's room (next month or
-- after upgrading). Every other error still pauses it, as before.
-- ---------------------------------------------------------------------
create or replace function private.run_recurring_expenses()
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  t public.recurring_expenses;
  v_project text;
  v_uid text;
  v_made integer := 0;
  v_runs integer;
  v_detail text;
begin
  select value into v_project from private.app_settings where key = 'firebase_project_id';

  for t in
    select * from public.recurring_expenses
     where active and next_run <= current_date
     order by next_run, id
       for update skip locked
  loop
    select firebase_uid into v_uid from public.profiles where id = t.created_by and deleted_at is null;
    if v_uid is null or v_project is null then
      update public.recurring_expenses set active = false, last_error = 'creator_unavailable' where id = t.id;
      continue;
    end if;

    v_runs := 0;
    while t.next_run <= current_date and v_runs < 31 loop
      begin
        -- Act as the template's creator so save_expense applies every rule as usual.
        perform set_config('request.jwt.claims', json_build_object(
          'sub', v_uid,
          'iss', 'https://securetoken.google.com/' || v_project,
          'aud', v_project,
          'role', 'authenticated'
        )::text, true);
        perform public.save_expense(
          t.group_id, md5(t.id::text || t.next_run::text)::uuid, t.description, t.amount_minor, t.currency,
          t.paid_by, t.splits, t.split_method, t.category_id, t.next_run, t.notes
        );
        v_made := v_made + 1;
      exception when others then
        if sqlerrm = 'plan_limit' then exit; end if;
        -- e.g. a member left, or the group was archived: pause and say why.
        get stacked diagnostics v_detail = pg_exception_detail;
        update public.recurring_expenses
           set active = false, last_error = sqlerrm || coalesce(': ' || v_detail, '')
         where id = t.id;
        exit;
      end;
      t.run_count := t.run_count + 1;
      t.next_run := private.recurring_date(t.anchor_date, t.frequency, t.run_count);
      v_runs := v_runs + 1;
    end loop;

    if v_runs > 0 then
      update public.recurring_expenses
         set run_count = t.run_count, next_run = t.next_run
       where id = t.id and active;
    end if;
  end loop;

  perform set_config('request.jwt.claims', '', true);
  return v_made;
end $$;
