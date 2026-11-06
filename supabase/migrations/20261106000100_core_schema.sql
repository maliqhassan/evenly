-- =====================================================================
-- Evenly — core schema
--
-- Conventions
--  * Money is stored as BIGINT minor units plus an ISO 4217 code. Never floats.
--  * Users are identified by the Firebase UID (TEXT; never assumed to be a UUID).
--  * Financial rows are never hard-deleted by users: they are voided
--    (deleted_at), and every change is written to audit_logs.
--  * Clients never write to financial tables directly: every mutation goes
--    through SECURITY DEFINER RPCs (see later migrations), which validate
--    input and authorisation inside a single transaction.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;

-- Deploy-time settings (e.g. firebase_project_id). Not exposed through the API.
create table private.app_settings (
  key   text primary key,
  value text not null
);

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.group_type        as enum ('home', 'trip', 'couple', 'work', 'other');
create type public.member_role       as enum ('owner', 'admin', 'member');
create type public.member_status     as enum ('active', 'left', 'removed');
create type public.invitation_kind   as enum ('link', 'direct');
create type public.invitation_status as enum ('pending', 'accepted', 'declined', 'revoked');
create type public.split_method      as enum ('equal', 'exact', 'percent', 'shares', 'adjust');
create type public.payment_method    as enum ('cash', 'bank_transfer', 'card', 'other');
create type public.settlement_status as enum ('pending', 'confirmed', 'rejected');

-- ---------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Profiles & preferences
-- ---------------------------------------------------------------------
create table public.profiles (
  id               uuid primary key default gen_random_uuid(),
  firebase_uid     text not null unique check (char_length(firebase_uid) between 1 and 128),
  full_name        text not null check (char_length(btrim(full_name)) between 1 and 80),
  email            text check (email is null or char_length(email) <= 320),
  avatar_url       text check (avatar_url is null or char_length(avatar_url) <= 2048),
  phone            text check (phone is null or char_length(phone) <= 32),
  default_currency char(3) not null default 'USD' check (default_currency ~ '^[A-Z]{3}$'),
  time_zone        text not null default 'UTC' check (char_length(time_zone) <= 64),
  onboarded_at     timestamptz,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email)) where deleted_at is null;
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

create table public.user_preferences (
  profile_id          uuid primary key references public.profiles (id) on delete cascade,
  region              text not null default 'US' check (region ~ '^[A-Z]{2}$'),
  number_format       text not null default '1,234.56' check (number_format in ('1,234.56', '1.234,56', '1 234,56')),
  date_format         text not null default 'MM/DD/YYYY' check (date_format in ('MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD')),
  appearance          text not null default 'light' check (appearance in ('light', 'dark', 'system')),
  notify_push         boolean not null default true,
  notify_expenses     boolean not null default true,
  notify_settlements  boolean not null default true,
  notify_invites      boolean not null default true,
  notify_reminders    boolean not null default true,
  updated_at          timestamptz not null default now()
);
create trigger user_preferences_touch before update on public.user_preferences
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------
-- Groups, members, invitations
-- ---------------------------------------------------------------------
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  description text check (description is null or char_length(description) <= 280),
  type        public.group_type not null default 'other',
  icon        text not null default 'house' check (icon ~ '^[a-z0-9-]{1,40}$'),
  currency    char(3) not null check (currency ~ '^[A-Z]{3}$'),
  created_by  uuid not null references public.profiles (id),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger groups_touch before update on public.groups
  for each row execute function private.touch_updated_at();

create table public.group_members (
  group_id   uuid not null references public.groups (id) on delete cascade,
  profile_id uuid not null references public.profiles (id),
  role       public.member_role not null default 'member',
  status     public.member_status not null default 'active',
  invited_by uuid references public.profiles (id),
  joined_at  timestamptz not null default now(),
  left_at    timestamptz,
  primary key (group_id, profile_id)
);
create index group_members_profile_idx on public.group_members (profile_id) where status = 'active';

create table public.group_invitations (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references public.groups (id) on delete cascade,
  kind               public.invitation_kind not null,
  -- Link invites: unguessable code, shareable. Direct invites: a known profile.
  code               text unique check (code is null or code ~ '^[a-z0-9]{10,32}$'),
  invitee_profile_id uuid references public.profiles (id),
  invited_by         uuid not null references public.profiles (id),
  status             public.invitation_status not null default 'pending',
  expires_at         timestamptz not null default (now() + interval '30 days'),
  max_uses           integer check (max_uses is null or max_uses > 0),
  use_count          integer not null default 0 check (use_count >= 0),
  created_at         timestamptz not null default now(),
  responded_at       timestamptz,
  check ((kind = 'link' and code is not null and invitee_profile_id is null)
      or (kind = 'direct' and invitee_profile_id is not null and code is null))
);
create unique index group_invitations_one_pending_direct
  on public.group_invitations (group_id, invitee_profile_id)
  where kind = 'direct' and status = 'pending';
create index group_invitations_invitee_idx
  on public.group_invitations (invitee_profile_id) where status = 'pending';

-- ---------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------
create table public.expense_categories (
  id    text primary key check (id ~ '^[a-z_]{1,32}$'),
  name  text not null,
  icon  text not null,
  sort  integer not null default 0
);

insert into public.expense_categories (id, name, icon, sort) values
  ('groceries',     'Groceries',        'shopping-cart', 10),
  ('dining',        'Dining out',       'utensils',      20),
  ('rent',          'Rent',             'key',           30),
  ('utilities',     'Utilities',        'zap',           40),
  ('internet',      'Internet',         'wifi',          50),
  ('transport',     'Transport',        'car',           60),
  ('travel',        'Travel',           'plane',         70),
  ('entertainment', 'Entertainment',    'ticket',        80),
  ('shopping',      'Shopping',         'shopping-bag',  90),
  ('health',        'Health',           'heart-pulse',  100),
  ('gifts',         'Gifts',            'gift',         110),
  ('general',       'Other',            'receipt',      999);

create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups (id) on delete cascade,
  -- Client-generated idempotency key: replays of the same create are no-ops.
  client_id     uuid not null,
  description   text not null check (char_length(btrim(description)) between 1 and 120),
  amount_minor  bigint not null check (amount_minor > 0),
  currency      char(3) not null check (currency ~ '^[A-Z]{3}$'),
  paid_by       uuid not null references public.profiles (id),
  category_id   text not null default 'general' references public.expense_categories (id),
  expense_date  date not null default current_date,
  notes         text check (notes is null or char_length(notes) <= 1000),
  split_method  public.split_method not null default 'equal',
  version       integer not null default 1,
  created_by    uuid not null references public.profiles (id),
  updated_by    uuid references public.profiles (id),
  deleted_at    timestamptz,
  deleted_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (created_by, client_id)
);
create index expenses_group_date_idx on public.expenses (group_id, expense_date desc, created_at desc) where deleted_at is null;
create index expenses_paid_by_idx on public.expenses (paid_by) where deleted_at is null;
create trigger expenses_touch before update on public.expenses
  for each row execute function private.touch_updated_at();

create table public.expense_splits (
  expense_id   uuid not null references public.expenses (id) on delete cascade,
  group_id     uuid not null references public.groups (id) on delete cascade, -- denormalised for RLS
  profile_id   uuid not null references public.profiles (id),
  amount_minor bigint not null check (amount_minor >= 0),
  -- The raw input that produced this share (bp / scaled shares / ± minor), for re-editing.
  input_value  bigint,
  primary key (expense_id, profile_id)
);
create index expense_splits_profile_idx on public.expense_splits (profile_id);
create index expense_splits_group_idx on public.expense_splits (group_id);

create table public.receipts (
  id           uuid primary key default gen_random_uuid(),
  expense_id   uuid not null references public.expenses (id) on delete cascade,
  group_id     uuid not null references public.groups (id) on delete cascade,
  storage_path text not null unique,
  mime_type    text not null check (mime_type in ('image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf')),
  size_bytes   integer check (size_bytes is null or size_bytes between 1 and 10485760),
  created_by   uuid not null references public.profiles (id),
  created_at   timestamptz not null default now()
);
create index receipts_expense_idx on public.receipts (expense_id);

-- ---------------------------------------------------------------------
-- Settlements (recorded payments — not processed by Evenly)
-- ---------------------------------------------------------------------
create table public.settlements (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups (id) on delete cascade,
  client_id     uuid not null,
  from_profile  uuid not null references public.profiles (id),
  to_profile    uuid not null references public.profiles (id),
  amount_minor  bigint not null check (amount_minor > 0),
  currency      char(3) not null check (currency ~ '^[A-Z]{3}$'),
  method        public.payment_method not null default 'cash',
  reference     text check (reference is null or char_length(reference) <= 64),
  settled_on    date not null default current_date,
  note          text check (note is null or char_length(note) <= 500),
  status        public.settlement_status not null default 'pending',
  created_by    uuid not null references public.profiles (id),
  responded_by  uuid references public.profiles (id),
  responded_at  timestamptz,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (created_by, client_id),
  check (from_profile <> to_profile)
);
create index settlements_group_idx on public.settlements (group_id, settled_on desc) where deleted_at is null;
create index settlements_to_pending_idx on public.settlements (to_profile) where status = 'pending' and deleted_at is null;
create trigger settlements_touch before update on public.settlements
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------
-- Activity feed, audit log, notifications, push tokens
-- ---------------------------------------------------------------------
create table public.activity_logs (
  id          bigint generated always as identity primary key,
  group_id    uuid references public.groups (id) on delete cascade,
  actor_id    uuid references public.profiles (id),
  type        text not null check (type ~ '^[a-z_]{1,48}$'),
  entity_type text check (entity_type in ('expense', 'settlement', 'group', 'member', 'invitation')),
  entity_id   uuid,
  -- Immutable snapshot used to render the feed without extra joins.
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index activity_logs_group_idx on public.activity_logs (group_id, created_at desc);
create index activity_logs_actor_idx on public.activity_logs (actor_id, created_at desc);

create table public.audit_logs (
  id          bigint generated always as identity primary key,
  group_id    uuid references public.groups (id) on delete cascade,
  entity_type text not null check (entity_type in ('expense', 'settlement', 'group', 'member')),
  entity_id   uuid not null,
  action      text not null check (action in ('create', 'update', 'delete', 'confirm', 'reject')),
  actor_id    uuid references public.profiles (id),
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  type         text not null check (type ~ '^[a-z_]{1,48}$'),
  body         text not null check (char_length(body) <= 500),
  data         jsonb not null default '{}'::jsonb,
  group_id     uuid references public.groups (id) on delete cascade,
  actor_id     uuid references public.profiles (id),
  read_at      timestamptz,
  pushed_at    timestamptz,
  created_at   timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_id) where read_at is null;

create table public.push_tokens (
  token       text primary key check (char_length(token) <= 512),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  platform    text not null check (platform in ('ios', 'android', 'web')),
  updated_at  timestamptz not null default now()
);
create index push_tokens_profile_idx on public.push_tokens (profile_id);
