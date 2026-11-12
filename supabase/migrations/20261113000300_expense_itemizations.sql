-- Itemized expenses ("split a bill item by item").
--
-- The money is still authoritative in expense_splits (validated by
-- save_expense): an itemized expense is saved as an 'exact' split. This table
-- keeps the items so everyone can see what the bill was made of, and so the
-- expense can be edited as items later.
--
-- items: [{ name, amount_minor, member_ids: [uuid] }], each item shared equally
-- by its members. extra_minor is tax / tip shared in proportion to each
-- person's items. The server checks the totals and the people add up; it does
-- not recompute the per-person amounts (that's the splits' job).

create table public.expense_itemizations (
  expense_id  uuid primary key references public.expenses (id) on delete cascade,
  group_id    uuid not null references public.groups (id) on delete cascade,
  items       jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 100),
  extra_minor bigint not null default 0 check (extra_minor >= 0),
  updated_at  timestamptz not null default now()
);
create trigger expense_itemizations_touch before update on public.expense_itemizations
  for each row execute function private.touch_updated_at();

alter table public.expense_itemizations enable row level security;
grant select on public.expense_itemizations to authenticated;

create policy expense_itemizations_select_members on public.expense_itemizations for select to authenticated
  using (public.is_group_member(group_id));

-- Set (or, with null items, remove) the items of an expense.
create or replace function public.set_expense_items(
  p_expense_id uuid,
  p_items jsonb,
  p_extra_minor bigint default 0
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_profile();
  e public.expenses;
  v_count int;
  v_bad int;
  v_sum numeric;
  v_unknown int;
  v_uncovered int;
begin
  select * into e from public.expenses where id = p_expense_id and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
  perform private.require_member(e.group_id, v_me);
  if not (e.created_by = v_me or e.paid_by = v_me or public.is_group_admin(e.group_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_items is null then
    delete from public.expense_itemizations where expense_id = p_expense_id;
    return;
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'invalid_input' using detail = 'items';
  end if;
  if p_extra_minor is null or p_extra_minor < 0 then raise exception 'invalid_input' using detail = 'extra'; end if;

  select count(*),
         count(*) filter (
           where x.amount_minor is null or x.amount_minor <= 0
              or char_length(coalesce(x.name, '')) > 80
              or x.member_ids is null or cardinality(x.member_ids) = 0
              or cardinality(x.member_ids) <> (select count(distinct m) from unnest(x.member_ids) as m)
         ),
         sum(x.amount_minor)
    into v_count, v_bad, v_sum
    from jsonb_to_recordset(p_items) as x(name text, amount_minor bigint, member_ids uuid[]);

  if v_bad > 0 then raise exception 'invalid_input' using detail = 'items'; end if;
  if v_sum + p_extra_minor <> e.amount_minor then
    raise exception 'split_mismatch' using detail = format('%s <> %s', v_sum + p_extra_minor, e.amount_minor);
  end if;

  -- Everyone named in an item is in the group (or already part of this expense).
  select count(*) into v_unknown
    from (
      select distinct m as pid
        from jsonb_to_recordset(p_items) as x(member_ids uuid[]), unnest(x.member_ids) as m
    ) named
   where not private.is_active_member(e.group_id, named.pid)
     and not exists (select 1 from public.expense_splits s where s.expense_id = p_expense_id and s.profile_id = named.pid);
  if v_unknown > 0 then raise exception 'invalid_participant'; end if;

  -- Everyone who owes something must be in at least one item.
  select count(*) into v_uncovered
    from public.expense_splits s
   where s.expense_id = p_expense_id and s.amount_minor > 0
     and not exists (
       select 1 from jsonb_to_recordset(p_items) as x(member_ids uuid[]) where s.profile_id = any (x.member_ids)
     );
  if v_uncovered > 0 then raise exception 'invalid_input' using detail = 'items_do_not_cover_split'; end if;

  insert into public.expense_itemizations (expense_id, group_id, items, extra_minor)
  values (p_expense_id, e.group_id, p_items, p_extra_minor)
  on conflict (expense_id) do update set items = excluded.items, extra_minor = excluded.extra_minor;
end $$;

grant execute on function public.set_expense_items(uuid, jsonb, bigint) to authenticated;
