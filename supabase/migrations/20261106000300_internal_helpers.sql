-- =====================================================================
-- Internal helpers used by the RPC layer. Not callable by clients.
-- Errors are raised with stable, machine-readable messages that the app
-- maps to friendly copy (no internals leak to users):
--   not_authenticated | not_member | forbidden | not_found | invalid_input
--   split_mismatch | invalid_participant | conflict | group_archived
--   balances_outstanding | invite_invalid | rate_limited
-- =====================================================================

create or replace function private.require_profile()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v uuid := public.current_profile_id();
begin
  if v is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return v;
end $$;

create or replace function private.require_member(p_group_id uuid, p_profile_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and profile_id = p_profile_id and status = 'active'
  ) then
    raise exception 'not_member' using errcode = '42501';
  end if;
end $$;

create or replace function private.require_active_group(p_group_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from public.groups where id = p_group_id and archived_at is not null) then
    raise exception 'group_archived';
  end if;
end $$;

create or replace function private.is_active_member(p_group_id uuid, p_profile_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and profile_id = p_profile_id and status = 'active'
  )
$$;

create or replace function private.profile_name(p_profile_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select full_name from public.profiles where id = p_profile_id), 'Someone')
$$;

create or replace function private.first_name(p_profile_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select split_part(private.profile_name(p_profile_id), ' ', 1)
$$;

create or replace function private.currency_exponent(p_currency text)
returns integer language sql immutable set search_path = '' as $$
  select case
    when p_currency in ('JPY','KRW','VND','CLP','ISK','UGX','XAF','XOF','PYG','RWF','KMF','GNF','VUV','XPF','DJF','BIF') then 0
    when p_currency in ('KWD','BHD','OMR','JOD','TND','LYD','IQD') then 3
    else 2
  end
$$;

-- 12050, 'USD' → '$120.50'. Only for human-readable notification text.
create or replace function private.format_minor(p_amount bigint, p_currency text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  e int := private.currency_exponent(p_currency);
  a bigint := abs(p_amount);
  whole text := to_char(a / (10 ^ e)::bigint, 'FM999,999,999,999,990');
  frac text := case when e = 0 then '' else '.' || lpad((a % (10 ^ e)::bigint)::text, e, '0') end;
  sym text := case p_currency when 'USD' then '$' when 'EUR' then '€' when 'GBP' then '£'
                when 'JPY' then '¥' when 'INR' then '₹' else p_currency || ' ' end;
begin
  return (case when p_amount < 0 then '-' else '' end) || sym || whole || frac;
end $$;

create or replace function private.log_activity(
  p_group_id uuid, p_actor uuid, p_type text, p_entity_type text, p_entity_id uuid, p_data jsonb
) returns void language sql security definer set search_path = '' as $$
  insert into public.activity_logs (group_id, actor_id, type, entity_type, entity_id, data)
  values (p_group_id, p_actor, p_type, p_entity_type, p_entity_id, coalesce(p_data, '{}'::jsonb))
$$;

create or replace function private.write_audit(
  p_group_id uuid, p_entity_type text, p_entity_id uuid, p_action text, p_actor uuid, p_before jsonb, p_after jsonb
) returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (group_id, entity_type, entity_id, action, actor_id, before, after)
  values (p_group_id, p_entity_type, p_entity_id, p_action, p_actor, p_before, p_after)
$$;

-- In-app notification (push delivery is decided later by the dispatcher,
-- which honours user_preferences). Never notifies the actor themselves.
create or replace function private.notify(
  p_recipient uuid, p_type text, p_body text, p_data jsonb, p_group_id uuid, p_actor uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_recipient is null or p_recipient = p_actor then return; end if;
  insert into public.notifications (recipient_id, type, body, data, group_id, actor_id)
  values (p_recipient, p_type, left(p_body, 500), coalesce(p_data, '{}'::jsonb), p_group_id, p_actor);
end $$;

-- Expense + its splits as one JSON document (for audit and activity snapshots).
create or replace function private.expense_snapshot(p_expense_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', e.id,
    'description', e.description,
    'amount_minor', e.amount_minor,
    'currency', e.currency,
    'paid_by', e.paid_by,
    'paid_by_name', private.profile_name(e.paid_by),
    'category_id', e.category_id,
    'expense_date', e.expense_date,
    'notes', e.notes,
    'split_method', e.split_method,
    'version', e.version,
    'splits', coalesce((
      select jsonb_object_agg(s.profile_id::text, s.amount_minor)
      from public.expense_splits s where s.expense_id = e.id
    ), '{}'::jsonb)
  )
  from public.expenses e where e.id = p_expense_id
$$;

-- Net balance of one member in a group, per currency (server-side checks).
create or replace function private.member_nets(p_group_id uuid, p_profile_id uuid)
returns table (currency char(3), net_minor bigint)
language sql stable security definer set search_path = '' as $$
  with ledger as (
    select e.currency, e.amount_minor as amt
      from public.expenses e
     where e.group_id = p_group_id and e.deleted_at is null and e.paid_by = p_profile_id
    union all
    select e.currency, -s.amount_minor
      from public.expense_splits s join public.expenses e on e.id = s.expense_id
     where s.group_id = p_group_id and e.deleted_at is null and s.profile_id = p_profile_id
    union all
    select st.currency, st.amount_minor
      from public.settlements st
     where st.group_id = p_group_id and st.deleted_at is null and st.status <> 'rejected' and st.from_profile = p_profile_id
    union all
    select st.currency, -st.amount_minor
      from public.settlements st
     where st.group_id = p_group_id and st.deleted_at is null and st.status <> 'rejected' and st.to_profile = p_profile_id
  )
  select l.currency, sum(l.amt)::bigint from ledger l group by l.currency
$$;

create or replace function private.has_outstanding_balance(p_group_id uuid, p_profile_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.member_nets(p_group_id, p_profile_id) n where n.net_minor <> 0)
$$;

-- 12-char lowercase alphanumeric code from a CSPRNG (~62 bits).
create or replace function private.new_invite_code()
returns text language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'abcdefghijkmnpqrstuvwxyz23456789'; -- 32 symbols, no look-alikes
  bytes bytea := extensions.gen_random_bytes(12);
  out text := '';
begin
  for i in 0..11 loop
    out := out || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return out;
end $$;
