-- Recurring expenses.
--
-- A template (who paid, how much, how it's split) that creates a real expense
-- on a schedule: weekly, monthly or yearly. A daily job runs the due ones.
--
-- Design:
--  * The job creates expenses through public.save_expense, acting as the
--    template's creator, so every rule, audit entry and notification that
--    applies to a normal expense applies here too (nothing is duplicated).
--  * Creating a template validates it by dry-running save_expense and rolling
--    back, so mistakes surface when it's set up, not months later.
--  * Dates are computed from the anchor (the first expense's date) plus N
--    periods, so "the 31st" doesn't drift to the 28th after February.
--  * A run that fails (e.g. a member left the group) pauses that template and
--    records why, instead of retrying forever or skipping silently.
--  * Runs are idempotent: the expense's client_id is derived from the
--    template and the run date, so a re-run can never create a duplicate.

create table public.recurring_expenses (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups (id) on delete cascade,
  created_by    uuid not null references public.profiles (id),
  client_id     uuid not null,
  description   text not null check (char_length(description) between 1 and 120),
  amount_minor  bigint not null check (amount_minor > 0),
  currency      text not null check (currency ~ '^[A-Z]{3}$'),
  paid_by       uuid not null references public.profiles (id),
  split_method  public.split_method not null default 'equal',
  category_id   text not null references public.expense_categories (id),
  notes         text check (char_length(notes) <= 1000),
  splits        jsonb not null check (jsonb_typeof(splits) = 'array'),
  frequency     text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  anchor_date   date not null,
  run_count     integer not null default 1 check (run_count >= 1),
  next_run      date not null,
  active        boolean not null default true,
  last_error    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (created_by, client_id)
);
create index recurring_expenses_due_idx on public.recurring_expenses (next_run) where active;
create index recurring_expenses_group_idx on public.recurring_expenses (group_id);
create trigger recurring_expenses_touch before update on public.recurring_expenses
  for each row execute function private.touch_updated_at();

alter table public.recurring_expenses enable row level security;
grant select on public.recurring_expenses to authenticated;

-- Everyone in the group can see what repeats; writes go through the RPCs.
create policy recurring_expenses_select_members on public.recurring_expenses for select to authenticated
  using (public.is_group_member(group_id));

-- The date of occurrence number n (n = 0 is the anchor itself).
create or replace function private.recurring_date(p_anchor date, p_frequency text, p_n integer)
returns date
language sql immutable set search_path = '' as $$
  select case p_frequency
    when 'weekly'  then p_anchor + 7 * p_n
    when 'monthly' then (p_anchor + make_interval(months => p_n))::date
    when 'yearly'  then (p_anchor + make_interval(years => p_n))::date
  end
$$;

create or replace function public.create_recurring_expense(
  p_group_id uuid,
  p_client_id uuid,
  p_description text,
  p_amount_minor bigint,
  p_currency text,
  p_paid_by uuid,
  p_splits jsonb,
  p_split_method public.split_method,
  p_category_id text,
  p_notes text,
  p_frequency text,
  p_start_date date
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_profile();
  v_existing uuid;
  v_n integer := 1;
  v_id uuid;
begin
  perform private.require_member(p_group_id, v_me);

  select id into v_existing from public.recurring_expenses where created_by = v_me and client_id = p_client_id;
  if found then return v_existing; end if;

  perform private.require_active_group(p_group_id);
  if p_frequency is null or p_frequency not in ('weekly', 'monthly', 'yearly') then
    raise exception 'invalid_input' using detail = 'frequency';
  end if;
  if p_start_date is null or p_start_date > current_date + 366 or p_start_date < date '2000-01-01' then
    raise exception 'invalid_input' using detail = 'date';
  end if;

  -- Validate exactly like a real expense: dry-run save_expense, then undo it.
  begin
    perform public.save_expense(
      p_group_id, gen_random_uuid(), p_description, p_amount_minor, p_currency, p_paid_by,
      p_splits, p_split_method, p_category_id, p_start_date, p_notes
    );
    raise exception 'probe_ok';
  exception when others then
    if sqlerrm <> 'probe_ok' then raise; end if;
  end;

  -- The first run is the first occurrence after today (never back-filled).
  while private.recurring_date(p_start_date, p_frequency, v_n) <= current_date and v_n < 20000 loop
    v_n := v_n + 1;
  end loop;

  insert into public.recurring_expenses (
    group_id, created_by, client_id, description, amount_minor, currency, paid_by, split_method,
    category_id, notes, splits, frequency, anchor_date, run_count, next_run
  ) values (
    p_group_id, v_me, p_client_id, btrim(p_description), p_amount_minor, p_currency, p_paid_by, p_split_method,
    p_category_id, nullif(btrim(coalesce(p_notes, '')), ''), p_splits, p_frequency, p_start_date, v_n,
    private.recurring_date(p_start_date, p_frequency, v_n)
  ) returning id into v_id;
  return v_id;
end $$;

-- Pause or resume. Resuming skips any runs missed while paused.
create or replace function public.set_recurring_active(p_id uuid, p_active boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_profile();
  t public.recurring_expenses;
begin
  select * into t from public.recurring_expenses where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  perform private.require_member(t.group_id, v_me);
  if not (t.created_by = v_me or public.is_group_admin(t.group_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_active then
    perform private.require_active_group(t.group_id);
    while private.recurring_date(t.anchor_date, t.frequency, t.run_count) <= current_date and t.run_count < 20000 loop
      t.run_count := t.run_count + 1;
    end loop;
    update public.recurring_expenses
       set active = true, last_error = null, run_count = t.run_count,
           next_run = private.recurring_date(t.anchor_date, t.frequency, t.run_count)
     where id = p_id;
  else
    update public.recurring_expenses set active = false where id = p_id;
  end if;
end $$;

create or replace function public.delete_recurring_expense(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_profile();
  t public.recurring_expenses;
begin
  select * into t from public.recurring_expenses where id = p_id;
  if not found then return; end if;
  perform private.require_member(t.group_id, v_me);
  if not (t.created_by = v_me or public.is_group_admin(t.group_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.recurring_expenses where id = p_id;
end $$;

-- The daily job: create every due expense (catching up on missed days, at most
-- 31 per template per run) and schedule the next one. Returns how many it made.
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

grant execute on function
  public.create_recurring_expense(uuid, uuid, text, bigint, text, uuid, jsonb, public.split_method, text, text, text, date),
  public.set_recurring_active(uuid, boolean),
  public.delete_recurring_expense(uuid)
to authenticated;

-- Schedule the job daily at 00:05 UTC where pg_cron exists (Supabase). Elsewhere
-- (local tests) the extension is absent and the job is simply not scheduled.
do $$
begin
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when others then
    raise notice 'pg_cron not available: %', sqlerrm;
  end;
  if to_regnamespace('cron') is not null then
    perform cron.schedule('recurring-expenses', '5 0 * * *', 'select private.run_recurring_expenses()');
  end if;
end $$;
