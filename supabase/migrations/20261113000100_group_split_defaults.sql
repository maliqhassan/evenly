-- Saved default split, per user per group.
--
-- A user can save how they usually split in a group ("equal between Sara and
-- me", "60 / 40", "2 shares to Ali"). New expenses in that group start from
-- it. Only methods that don't depend on the expense total are saved
-- (equal, percent, shares); exact and adjust amounts only make sense for one
-- specific bill.
--
-- `members` is a jsonb array of { profile_id, included, value } where value is
-- basis points (percent) or scaled shares (shares), and 0 for equal.

create table public.group_split_defaults (
  group_id    uuid not null references public.groups (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  method      public.split_method not null check (method in ('equal', 'percent', 'shares')),
  members     jsonb not null check (jsonb_typeof(members) = 'array' and jsonb_array_length(members) between 1 and 100),
  updated_at  timestamptz not null default now(),
  primary key (group_id, profile_id)
);
create trigger group_split_defaults_touch before update on public.group_split_defaults
  for each row execute function private.touch_updated_at();

alter table public.group_split_defaults enable row level security;
grant select on public.group_split_defaults to authenticated;

-- Own rows only; writes go through the RPCs below.
create policy group_split_defaults_select_own on public.group_split_defaults for select to authenticated
  using (profile_id = (select public.current_profile_id()));

create or replace function public.set_group_split_default(
  p_group_id uuid,
  p_method public.split_method,
  p_members jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.require_profile();
  v_included int := 0;
  v_bp bigint := 0;
  v_row jsonb;
  v_pid uuid;
  v_value numeric;
begin
  perform private.require_member(p_group_id, v_me);
  if p_method not in ('equal', 'percent', 'shares') then raise exception 'invalid_input' using detail = 'method'; end if;
  if p_members is null or jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) not between 1 and 100 then
    raise exception 'invalid_input' using detail = 'members';
  end if;

  for v_row in select * from jsonb_array_elements(p_members) loop
    begin
      v_pid := (v_row ->> 'profile_id')::uuid;
      v_value := coalesce((v_row ->> 'value')::numeric, 0);
    exception when others then
      raise exception 'invalid_input' using detail = 'members';
    end;
    if jsonb_typeof(v_row -> 'included') is distinct from 'boolean' or v_value < 0 or v_value <> trunc(v_value) then
      raise exception 'invalid_input' using detail = 'members';
    end if;
    -- Everyone in the default must be an active member of this group.
    if not private.is_active_member(p_group_id, v_pid) then
      raise exception 'invalid_input' using detail = 'member_not_in_group';
    end if;
    if (v_row ->> 'included')::boolean then
      v_included := v_included + 1;
      v_bp := v_bp + v_value;
    end if;
  end loop;

  if v_included = 0 then raise exception 'invalid_input' using detail = 'nobody_included'; end if;
  if p_method = 'percent' and v_bp <> 10000 then raise exception 'invalid_input' using detail = 'percent_total'; end if;
  if p_method = 'shares' and v_bp <= 0 then raise exception 'invalid_input' using detail = 'shares_total'; end if;

  insert into public.group_split_defaults (group_id, profile_id, method, members)
  values (p_group_id, v_me, p_method, p_members)
  on conflict (group_id, profile_id) do update
    set method = excluded.method, members = excluded.members;
end $$;

create or replace function public.clear_group_split_default(p_group_id uuid)
returns void
language sql security definer set search_path = '' as $$
  delete from public.group_split_defaults
   where group_id = p_group_id and profile_id = private.require_profile()
$$;

grant execute on function
  public.set_group_split_default(uuid, public.split_method, jsonb),
  public.clear_group_split_default(uuid)
to authenticated;
