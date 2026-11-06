-- =====================================================================
-- RPCs: expenses, settlements, balances, reports
--
-- Server-side invariants (never trusted to the client):
--   * caller, payer and every participant are active group members
--   * split amounts are non-negative integers that sum EXACTLY to the total
--   * creates are idempotent on (created_by, client_id)
--   * edits use optimistic concurrency (expected version)
--   * every change writes audit_logs + activity_logs atomically
-- =====================================================================

create or replace function public.save_expense(
  p_group_id uuid,
  p_client_id uuid,
  p_description text,
  p_amount_minor bigint,
  p_currency text,
  p_paid_by uuid,
  p_splits jsonb, -- [{ "profile_id": uuid, "amount_minor": int, "input_value": int|null }]
  p_split_method public.split_method default 'equal',
  p_category_id text default 'general',
  p_expense_date date default current_date,
  p_notes text default null,
  p_expense_id uuid default null,
  p_expected_version integer default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_profile();
  v_existing public.expenses;
  v_id uuid;
  v_desc text := btrim(coalesce(p_description, ''));
  v_count int; v_distinct int; v_sum numeric; v_bad int; v_positive int;
  v_before jsonb; v_after jsonb;
  v_group_name text;
  v_is_edit boolean := p_expense_id is not null;
begin
  perform private.require_member(p_group_id, v_me);

  -- Idempotent replay of a create: return the already-saved expense.
  if not v_is_edit then
    select * into v_existing from public.expenses where created_by = v_me and client_id = p_client_id;
    if found then
      if v_existing.group_id <> p_group_id then raise exception 'conflict'; end if;
      return v_existing.id;
    end if;
  end if;

  perform private.require_active_group(p_group_id);

  -- ---- validate scalar input ----
  if char_length(v_desc) not between 1 and 120 then raise exception 'invalid_input' using detail = 'description'; end if;
  if p_amount_minor is null or p_amount_minor <= 0 then raise exception 'invalid_input' using detail = 'amount'; end if;
  if coalesce(p_currency, '') !~ '^[A-Z]{3}$' then raise exception 'invalid_input' using detail = 'currency'; end if;
  if p_notes is not null and char_length(p_notes) > 1000 then raise exception 'invalid_input' using detail = 'notes'; end if;
  if p_expense_date is null or p_expense_date > current_date + 366 or p_expense_date < date '2000-01-01' then
    raise exception 'invalid_input' using detail = 'date';
  end if;
  if not exists (select 1 from public.expense_categories where id = p_category_id) then
    raise exception 'invalid_input' using detail = 'category';
  end if;
  if not private.is_active_member(p_group_id, p_paid_by) then raise exception 'invalid_participant' using detail = 'paid_by'; end if;

  -- ---- validate splits ----
  if p_splits is null or jsonb_typeof(p_splits) <> 'array' or jsonb_array_length(p_splits) = 0
     or jsonb_array_length(p_splits) > 200 then
    raise exception 'invalid_input' using detail = 'splits';
  end if;

  select count(*), count(distinct x.profile_id), sum(x.amount_minor),
         count(*) filter (where x.profile_id is null or x.amount_minor is null or x.amount_minor < 0),
         count(*) filter (where x.amount_minor > 0)
    into v_count, v_distinct, v_sum, v_bad, v_positive
    from jsonb_to_recordset(p_splits) as x(profile_id uuid, amount_minor bigint, input_value bigint);

  if v_bad > 0 or v_count <> v_distinct or v_positive = 0 then raise exception 'invalid_input' using detail = 'splits'; end if;
  if v_sum <> p_amount_minor then raise exception 'split_mismatch' using detail = format('%s <> %s', v_sum, p_amount_minor); end if;
  if exists (
    select 1 from jsonb_to_recordset(p_splits) as x(profile_id uuid)
    where not private.is_active_member(p_group_id, x.profile_id)
  ) then
    raise exception 'invalid_participant';
  end if;

  select name into v_group_name from public.groups where id = p_group_id;

  if v_is_edit then
    select * into v_existing from public.expenses where id = p_expense_id for update;
    if not found or v_existing.group_id <> p_group_id or v_existing.deleted_at is not null then
      raise exception 'not_found';
    end if;
    if not (v_existing.created_by = v_me or v_existing.paid_by = v_me or public.is_group_admin(p_group_id)) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if p_expected_version is not null and p_expected_version <> v_existing.version then
      raise exception 'conflict' using detail = 'expense was changed by someone else';
    end if;

    v_before := private.expense_snapshot(p_expense_id);
    delete from public.expense_splits where expense_id = p_expense_id;
    update public.expenses set
      description = v_desc, amount_minor = p_amount_minor, currency = p_currency, paid_by = p_paid_by,
      category_id = p_category_id, expense_date = p_expense_date, notes = nullif(btrim(coalesce(p_notes, '')), ''),
      split_method = p_split_method, version = version + 1, updated_by = v_me
    where id = p_expense_id;
    v_id := p_expense_id;
  else
    begin
      insert into public.expenses (group_id, client_id, description, amount_minor, currency, paid_by,
                                   category_id, expense_date, notes, split_method, created_by)
      values (p_group_id, p_client_id, v_desc, p_amount_minor, p_currency, p_paid_by,
              p_category_id, p_expense_date, nullif(btrim(coalesce(p_notes, '')), ''), p_split_method, v_me)
      returning id into v_id;
    exception when unique_violation then
      -- A concurrent duplicate submission won the race.
      select id into v_id from public.expenses where created_by = v_me and client_id = p_client_id;
      return v_id;
    end;
  end if;

  insert into public.expense_splits (expense_id, group_id, profile_id, amount_minor, input_value)
  select v_id, p_group_id, x.profile_id, x.amount_minor, x.input_value
    from jsonb_to_recordset(p_splits) as x(profile_id uuid, amount_minor bigint, input_value bigint);

  v_after := private.expense_snapshot(v_id);
  perform private.write_audit(p_group_id, 'expense', v_id, case when v_is_edit then 'update' else 'create' end,
                              v_me, v_before, v_after);
  perform private.log_activity(p_group_id, v_me, case when v_is_edit then 'expense_updated' else 'expense_created' end,
                               'expense', v_id,
                               v_after || jsonb_build_object('group_name', v_group_name, 'actor_name', private.profile_name(v_me),
                                                             'previous_amount_minor', v_before -> 'amount_minor'));

  -- Notify everyone involved (payer + participants), except the actor.
  perform private.notify(r.pid,
    case when v_is_edit then 'expense_updated' else 'expense_added' end,
    case when v_is_edit then
      private.first_name(v_me) || ' edited "' || v_desc || '"' ||
        case when (v_before ->> 'amount_minor')::bigint <> p_amount_minor
             then ' — ' || private.format_minor((v_before ->> 'amount_minor')::bigint, p_currency) || ' → ' || private.format_minor(p_amount_minor, p_currency)
             else '' end
    else
      private.first_name(v_me) || ' added "' || v_desc || '" (' || private.format_minor(p_amount_minor, p_currency) || ') in ' || v_group_name
    end,
    jsonb_build_object('expense_id', v_id, 'group_id', p_group_id),
    p_group_id, v_me)
  from (
    select p_paid_by as pid
    union
    select x.profile_id from jsonb_to_recordset(p_splits) as x(profile_id uuid, amount_minor bigint) where x.amount_minor > 0
  ) r;

  return v_id;
end $$;

-- Void (soft-delete) an expense. It leaves balances; history is kept.
create or replace function public.delete_expense(p_expense_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.require_profile(); v_e public.expenses; v_snap jsonb;
begin
  select * into v_e from public.expenses where id = p_expense_id for update;
  if not found or v_e.deleted_at is not null then raise exception 'not_found'; end if;
  perform private.require_member(v_e.group_id, v_me);
  if not (v_e.created_by = v_me or v_e.paid_by = v_me or public.is_group_admin(v_e.group_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_snap := private.expense_snapshot(p_expense_id);
  update public.expenses set deleted_at = now(), deleted_by = v_me, version = version + 1 where id = p_expense_id;
  perform private.write_audit(v_e.group_id, 'expense', p_expense_id, 'delete', v_me, v_snap, null);
  perform private.log_activity(v_e.group_id, v_me, 'expense_deleted', 'expense', p_expense_id,
    v_snap || jsonb_build_object('group_name', (select name from public.groups where id = v_e.group_id),
                                 'actor_name', private.profile_name(v_me)));

  perform private.notify(r.pid, 'expense_deleted',
    private.first_name(v_me) || ' deleted "' || v_e.description || '"',
    jsonb_build_object('expense_id', p_expense_id, 'group_id', v_e.group_id), v_e.group_id, v_me)
  from (select v_e.paid_by as pid union select profile_id from public.expense_splits where expense_id = p_expense_id and amount_minor > 0) r;
end $$;

create or replace function public.add_receipt(p_expense_id uuid, p_storage_path text, p_mime_type text, p_size_bytes integer)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.require_profile(); v_e public.expenses; v_id uuid;
begin
  select * into v_e from public.expenses where id = p_expense_id and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
  perform private.require_member(v_e.group_id, v_me);
  if p_storage_path is null or p_storage_path not like v_e.group_id::text || '/' || p_expense_id::text || '/%' then
    raise exception 'invalid_input' using detail = 'storage_path';
  end if;
  insert into public.receipts (expense_id, group_id, storage_path, mime_type, size_bytes, created_by)
  values (p_expense_id, v_e.group_id, p_storage_path, p_mime_type, p_size_bytes, v_me)
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Settlements. A settlement RECORDS a payment made outside Evenly.
-- Recorded by the payer → 'pending' until the receiver confirms.
-- Recorded by the receiver → 'confirmed' immediately.
-- Both pending and confirmed settlements count toward balances; rejected
-- and deleted ones do not.
-- ---------------------------------------------------------------------
create or replace function public.record_settlement(
  p_group_id uuid,
  p_client_id uuid,
  p_from_profile uuid,
  p_to_profile uuid,
  p_amount_minor bigint,
  p_currency text,
  p_method public.payment_method default 'cash',
  p_reference text default null,
  p_settled_on date default current_date,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_profile();
  v_id uuid;
  v_status public.settlement_status;
  v_other uuid;
  v_group_name text;
  v_data jsonb;
begin
  perform private.require_member(p_group_id, v_me);

  select id into v_id from public.settlements where created_by = v_me and client_id = p_client_id;
  if found then return v_id; end if; -- idempotent replay

  perform private.require_active_group(p_group_id);
  if v_me not in (p_from_profile, p_to_profile) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_from_profile = p_to_profile then raise exception 'invalid_input' using detail = 'parties'; end if;
  if not private.is_active_member(p_group_id, p_from_profile) or not private.is_active_member(p_group_id, p_to_profile) then
    raise exception 'invalid_participant';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 then raise exception 'invalid_input' using detail = 'amount'; end if;
  if coalesce(p_currency, '') !~ '^[A-Z]{3}$' then raise exception 'invalid_input' using detail = 'currency'; end if;
  if p_reference is not null and char_length(p_reference) > 64 then raise exception 'invalid_input' using detail = 'reference'; end if;
  if p_note is not null and char_length(p_note) > 500 then raise exception 'invalid_input' using detail = 'note'; end if;
  if p_settled_on is null or p_settled_on > current_date + 1 then raise exception 'invalid_input' using detail = 'date'; end if;

  v_status := case when v_me = p_to_profile then 'confirmed' else 'pending' end;
  v_other := case when v_me = p_from_profile then p_to_profile else p_from_profile end;

  begin
    insert into public.settlements (group_id, client_id, from_profile, to_profile, amount_minor, currency, method,
                                    reference, settled_on, note, status, created_by, responded_by, responded_at)
    values (p_group_id, p_client_id, p_from_profile, p_to_profile, p_amount_minor, p_currency, p_method,
            nullif(btrim(coalesce(p_reference, '')), ''), p_settled_on, nullif(btrim(coalesce(p_note, '')), ''),
            v_status, v_me,
            case when v_status = 'confirmed' then v_me end, case when v_status = 'confirmed' then now() end)
    returning id into v_id;
  exception when unique_violation then
    select id into v_id from public.settlements where created_by = v_me and client_id = p_client_id;
    return v_id;
  end;

  select name into v_group_name from public.groups where id = p_group_id;
  v_data := jsonb_build_object(
    'settlement_id', v_id, 'group_id', p_group_id, 'group_name', v_group_name,
    'from', p_from_profile, 'from_name', private.profile_name(p_from_profile),
    'to', p_to_profile, 'to_name', private.profile_name(p_to_profile),
    'amount_minor', p_amount_minor, 'currency', p_currency, 'method', p_method, 'status', v_status,
    'actor_name', private.profile_name(v_me));

  perform private.write_audit(p_group_id, 'settlement', v_id, 'create', v_me, null,
                              (select to_jsonb(s) from public.settlements s where s.id = v_id));
  perform private.log_activity(p_group_id, v_me, 'settlement_recorded', 'settlement', v_id, v_data);
  perform private.notify(v_other,
    case when v_status = 'pending' then 'settlement_pending' else 'settlement_recorded' end,
    case when v_status = 'pending'
      then private.first_name(v_me) || ' recorded paying you ' || private.format_minor(p_amount_minor, p_currency) || '. Please confirm.'
      else private.first_name(v_me) || ' confirmed your payment of ' || private.format_minor(p_amount_minor, p_currency)
    end,
    v_data, p_group_id, v_me);
  return v_id;
end $$;

create or replace function public.respond_settlement(p_settlement_id uuid, p_confirm boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.require_profile(); v_s public.settlements;
begin
  select * into v_s from public.settlements where id = p_settlement_id for update;
  if not found or v_s.deleted_at is not null then raise exception 'not_found'; end if;
  if v_s.to_profile <> v_me then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_s.status <> 'pending' then raise exception 'conflict' using detail = 'already responded'; end if;

  update public.settlements set status = case when p_confirm then 'confirmed'::public.settlement_status
                                              else 'rejected'::public.settlement_status end,
                                responded_by = v_me, responded_at = now()
   where id = p_settlement_id;
  perform private.write_audit(v_s.group_id, 'settlement', p_settlement_id,
                              case when p_confirm then 'confirm' else 'reject' end, v_me,
                              to_jsonb(v_s), (select to_jsonb(s) from public.settlements s where s.id = p_settlement_id));
  perform private.log_activity(v_s.group_id, v_me, case when p_confirm then 'settlement_confirmed' else 'settlement_rejected' end,
    'settlement', p_settlement_id,
    jsonb_build_object('from', v_s.from_profile, 'from_name', private.profile_name(v_s.from_profile),
                       'to', v_s.to_profile, 'to_name', private.profile_name(v_s.to_profile),
                       'amount_minor', v_s.amount_minor, 'currency', v_s.currency,
                       'group_name', (select name from public.groups where id = v_s.group_id)));
  perform private.notify(v_s.from_profile,
    case when p_confirm then 'settlement_confirmed' else 'settlement_rejected' end,
    private.first_name(v_me) || case when p_confirm then ' confirmed' else ' declined' end
      || ' your payment of ' || private.format_minor(v_s.amount_minor, v_s.currency),
    jsonb_build_object('settlement_id', p_settlement_id, 'group_id', v_s.group_id), v_s.group_id, v_me);
end $$;

create or replace function public.delete_settlement(p_settlement_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.require_profile(); v_s public.settlements;
begin
  select * into v_s from public.settlements where id = p_settlement_id for update;
  if not found or v_s.deleted_at is not null then raise exception 'not_found'; end if;
  perform private.require_member(v_s.group_id, v_me);
  if not (v_s.created_by = v_me or v_s.to_profile = v_me) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.settlements set deleted_at = now() where id = p_settlement_id;
  perform private.write_audit(v_s.group_id, 'settlement', p_settlement_id, 'delete', v_me, to_jsonb(v_s), null);
  perform private.log_activity(v_s.group_id, v_me, 'settlement_deleted', 'settlement', p_settlement_id,
    jsonb_build_object('amount_minor', v_s.amount_minor, 'currency', v_s.currency,
                       'from_name', private.profile_name(v_s.from_profile), 'to_name', private.profile_name(v_s.to_profile)));
end $$;

-- ---------------------------------------------------------------------
-- Reads. SECURITY INVOKER: RLS filters to the caller's groups.
-- ---------------------------------------------------------------------

-- Net balance of every member of every group I'm active in, per currency.
-- (positive = is owed, negative = owes). Balances are always reproducible
-- from the ledger; nothing is cached.
create or replace function public.get_my_group_balances()
returns table (group_id uuid, profile_id uuid, currency char(3), net_minor bigint)
language sql stable security invoker set search_path = '' as $$
  with my_groups as (
    select m.group_id from public.group_members m
    where m.profile_id = public.current_profile_id() and m.status = 'active'
  ), ledger as (
    select e.group_id, e.paid_by as pid, e.currency, e.amount_minor as amt
      from public.expenses e where e.group_id in (select group_id from my_groups) and e.deleted_at is null
    union all
    select s.group_id, s.profile_id, e.currency, -s.amount_minor
      from public.expense_splits s join public.expenses e on e.id = s.expense_id
     where s.group_id in (select group_id from my_groups) and e.deleted_at is null
    union all
    select st.group_id, st.from_profile, st.currency, st.amount_minor
      from public.settlements st
     where st.group_id in (select group_id from my_groups) and st.deleted_at is null and st.status <> 'rejected'
    union all
    select st.group_id, st.to_profile, st.currency, -st.amount_minor
      from public.settlements st
     where st.group_id in (select group_id from my_groups) and st.deleted_at is null and st.status <> 'rejected'
  )
  select l.group_id, l.pid, l.currency, sum(l.amt)::bigint
  from ledger l
  group by l.group_id, l.pid, l.currency
  having sum(l.amt) <> 0
$$;

-- Group "Totals" tab: total spent, what I paid, and my share, per currency.
create or replace function public.get_group_totals(p_group_id uuid)
returns table (currency char(3), total_spent bigint, my_paid bigint, my_share bigint, expense_count bigint)
language sql stable security invoker set search_path = '' as $$
  select e.currency,
         sum(e.amount_minor)::bigint,
         coalesce(sum(e.amount_minor) filter (where e.paid_by = public.current_profile_id()), 0)::bigint,
         coalesce(sum((select s.amount_minor from public.expense_splits s
                         where s.expense_id = e.id and s.profile_id = public.current_profile_id())), 0)::bigint,
         count(*)
  from public.expenses e
  where e.group_id = p_group_id and e.deleted_at is null
  group by e.currency
$$;

-- Reports: my share per month (last N months) and by category (selected month).
create or replace function public.get_spending_report(p_currency text, p_months integer default 6, p_month date default current_date)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with mine as (
    select e.expense_date, e.category_id, s.amount_minor
    from public.expense_splits s
    join public.expenses e on e.id = s.expense_id
    where s.profile_id = public.current_profile_id()
      and e.deleted_at is null
      and e.currency = p_currency
  ), months as (
    select generate_series(
      date_trunc('month', p_month) - make_interval(months => greatest(least(p_months, 24), 1) - 1),
      date_trunc('month', p_month), interval '1 month')::date as m
  )
  select jsonb_build_object(
    'currency', p_currency,
    'months', (
      select coalesce(jsonb_agg(jsonb_build_object('month', mo.m,
               'share_minor', coalesce((select sum(x.amount_minor) from mine x
                                         where date_trunc('month', x.expense_date) = mo.m), 0)) order by mo.m), '[]'::jsonb)
      from months mo),
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object('category_id', c.id, 'name', c.name, 'icon', c.icon,
               'share_minor', c.total) order by c.total desc), '[]'::jsonb)
      from (
        select cat.id, cat.name, cat.icon, sum(x.amount_minor)::bigint as total
        from mine x join public.expense_categories cat on cat.id = x.category_id
        where date_trunc('month', x.expense_date) = date_trunc('month', p_month)
        group by cat.id, cat.name, cat.icon
        having sum(x.amount_minor) > 0
      ) c)
  )
$$;

-- Nudge someone who owes me money in a group (max once per 20h per person).
create or replace function public.send_reminder(p_group_id uuid, p_profile_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_profile();
  v_cur char(3);
  v_amt bigint;
  v_parts text := '';
begin
  perform private.require_member(p_group_id, v_me);
  if exists (select 1 from public.notifications
             where recipient_id = p_profile_id and actor_id = v_me and type = 'reminder'
               and group_id = p_group_id and created_at > now() - interval '20 hours') then
    raise exception 'rate_limited';
  end if;

  for v_cur, v_amt in
    select mine.currency, least(mine.net_minor, -theirs.net_minor)
    from private.member_nets(p_group_id, v_me) mine
    join private.member_nets(p_group_id, p_profile_id) theirs on theirs.currency = mine.currency
    where mine.net_minor > 0 and theirs.net_minor < 0
  loop
    v_parts := v_parts || case when v_parts = '' then '' else ' + ' end || private.format_minor(v_amt, v_cur);
  end loop;
  if v_parts = '' then raise exception 'invalid_input' using detail = 'nothing owed'; end if;

  perform private.notify(p_profile_id, 'reminder',
    'Reminder: you owe ' || private.first_name(v_me) || ' ' || v_parts,
    jsonb_build_object('group_id', p_group_id, 'creditor_id', v_me), p_group_id, v_me);
end $$;
