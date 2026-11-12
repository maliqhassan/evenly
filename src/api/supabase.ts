import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { CurrencyCode, SplitMethod } from '@/domain/money';
import { authClient } from '@/lib/auth';
import { config } from '@/lib/config';

import { toAppError } from './errors';
import type {
  ActivityItem,
  Api,
  AppNotification,
  AuditEntry,
  BalanceRow,
  Expense,
  Group,
  Invitation,
  Me,
  Member,
  Preferences,
  Profile,
  Receipt,
  Settlement,
} from './types';

let client: SupabaseClient | null = null;

/**
 * Supabase client authenticated with the Firebase ID token (third-party
 * auth). supabase-js calls `accessToken` before every request, so refreshed
 * tokens are picked up automatically. No Supabase session is stored.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const live = config.live!;
  client = createClient(live.supabaseUrl, live.supabaseAnonKey, {
    accessToken: async () => authClient.getIdToken(),
    global: { headers: { 'x-client-info': 'evenly-mobile' } },
  });
  return client;
}

/* ------------------------------ helpers ------------------------------ */

type Row = Record<string, any>;

async function q<T>(promise: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  let res: { data: T | null; error: unknown };
  try {
    res = await promise;
  } catch (e) {
    throw toAppError(e);
  }
  if (res.error) throw toAppError(res.error);
  return res.data as T;
}

const rpc = <T>(fn: string, args: Record<string, unknown> = {}) => q<T>(getSupabase().rpc(fn, args));

// The caller's profile id, cached per signed-in identity (reset on any auth change).
let cachedProfileId: string | null = null;
if (config.live) {
  authClient.onChange(() => {
    cachedProfileId = null;
  });
}
async function myProfileId(): Promise<string> {
  if (cachedProfileId) return cachedProfileId;
  const id = await rpc<string | null>('current_profile_id');
  if (!id) throw toAppError({ message: 'not_authenticated' });
  cachedProfileId = id;
  return id;
}
const num = (v: unknown) => (typeof v === 'string' ? Number(v) : (v as number));

const mapProfile = (r: Row): Profile => ({
  id: r.id,
  fullName: r.full_name,
  email: r.email,
  avatarUrl: r.avatar_url,
  phone: r.phone,
  defaultCurrency: r.default_currency,
  timeZone: r.time_zone,
  onboarded: !!r.onboarded_at,
});

const mapPrefs = (r: Row | null): Preferences => ({
  region: r?.region ?? 'US',
  numberFormat: r?.number_format ?? '1,234.56',
  dateFormat: r?.date_format ?? 'MM/DD/YYYY',
  appearance: r?.appearance ?? 'light',
  notifyPush: r?.notify_push ?? true,
  notifyExpenses: r?.notify_expenses ?? true,
  notifySettlements: r?.notify_settlements ?? true,
  notifyInvites: r?.notify_invites ?? true,
  notifyReminders: r?.notify_reminders ?? true,
});

const mapMember = (r: Row): Member => ({
  profileId: r.profile_id,
  name: r.profile?.full_name ?? 'Deleted user',
  avatarUrl: r.profile?.avatar_url ?? null,
  email: r.profile?.email ?? null,
  role: r.role,
  status: r.status,
  joinedAt: r.joined_at,
});

const mapGroup = (r: Row): Group => ({
  id: r.id,
  name: r.name,
  description: r.description,
  type: r.type,
  icon: r.icon,
  currency: r.currency,
  createdBy: r.created_by,
  createdAt: r.created_at,
  archivedAt: r.archived_at,
  members: (r.group_members ?? []).map(mapMember),
});

const mapExpense = (r: Row): Expense => ({
  id: r.id,
  groupId: r.group_id,
  description: r.description,
  amount: num(r.amount_minor),
  currency: r.currency,
  paidBy: r.paid_by,
  categoryId: r.category_id,
  date: r.expense_date,
  notes: r.notes,
  splitMethod: r.split_method as SplitMethod,
  version: r.version,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  splits: (r.expense_splits ?? []).map((s: Row) => ({
    profileId: s.profile_id,
    amount: num(s.amount_minor),
    inputValue: s.input_value === null ? null : num(s.input_value),
  })),
});

const mapSettlement = (r: Row): Settlement => ({
  id: r.id,
  groupId: r.group_id,
  from: r.from_profile,
  to: r.to_profile,
  amount: num(r.amount_minor),
  currency: r.currency,
  method: r.method,
  reference: r.reference,
  date: r.settled_on,
  note: r.note,
  status: r.status,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

const mapActivity = (r: Row): ActivityItem => ({
  id: num(r.id),
  groupId: r.group_id,
  groupName: r.groups?.name ?? (r.data?.group_name as string | undefined) ?? null,
  actorId: r.actor_id,
  type: r.type,
  entityType: r.entity_type,
  entityId: r.entity_id,
  data: r.data ?? {},
  createdAt: r.created_at,
});

const mapNotification = (r: Row): AppNotification => ({
  id: r.id,
  type: r.type,
  body: r.body,
  data: r.data ?? {},
  groupId: r.group_id,
  actorId: r.actor_id,
  readAt: r.read_at,
  createdAt: r.created_at,
});

const mapInvitation = (r: Row): Invitation => ({
  id: r.id,
  groupId: r.group_id,
  inviteeProfileId: r.invitee_profile_id,
  invitedBy: r.invited_by,
  status: r.status,
  createdAt: r.created_at,
});

async function uploadToBucket(bucket: string, path: string, file: { uri: string; mimeType: string }) {
  const body = await (await fetch(file.uri)).arrayBuffer();
  await q(getSupabase().storage.from(bucket).upload(path, body, { contentType: file.mimeType, upsert: false }));
}

const extOf = (mime: string) =>
  ({ 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf' })[mime] ?? 'jpg';

const randomId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// group_members references profiles twice (profile_id and invited_by), so the
// embed must name its foreign key or PostgREST rejects it as ambiguous (PGRST201).
const GROUP_SELECT =
  '*, group_members(profile_id, role, status, joined_at, profile:profiles!group_members_profile_id_fkey(full_name, avatar_url, email))';

/* -------------------------------- api -------------------------------- */

export const supabaseApi: Api = {
  async ensureProfile({ fullName, avatarUrl }) {
    const rows = await rpc<{ profile_id: string; is_new: boolean; onboarded: boolean }[]>('ensure_profile', {
      p_full_name: fullName ?? null,
      p_avatar_url: avatarUrl ?? null,
    });
    const me = await supabaseApi.getMe();
    return { me, isNew: rows[0]?.is_new ?? false };
  },

  async getMe(): Promise<Me> {
    const sb = getSupabase();
    const profileId = await myProfileId();
    const [profile, prefs] = await Promise.all([
      q<Row>(sb.from('profiles').select('*').eq('id', profileId).single()),
      q<Row | null>(sb.from('user_preferences').select('*').eq('profile_id', profileId).maybeSingle()),
    ]);
    return { profile: mapProfile(profile), preferences: mapPrefs(prefs) };
  },

  async completeOnboarding(i) {
    await rpc('complete_onboarding', {
      p_full_name: i.fullName,
      p_phone: i.phone,
      p_avatar_url: i.avatarUrl,
      p_default_currency: i.defaultCurrency,
      p_time_zone: i.timeZone,
      p_region: i.region,
      p_number_format: i.numberFormat,
      p_date_format: i.dateFormat,
    });
  },

  async updateProfile(patch) {
    const me = await myProfileId();
    const row: Row = {};
    if (patch.fullName !== undefined) row.full_name = patch.fullName.trim();
    if (patch.phone !== undefined) row.phone = patch.phone?.trim() || null;
    if (patch.avatarUrl !== undefined) row.avatar_url = patch.avatarUrl;
    if (patch.defaultCurrency !== undefined) row.default_currency = patch.defaultCurrency;
    if (patch.timeZone !== undefined) row.time_zone = patch.timeZone;
    await q(getSupabase().from('profiles').update(row).eq('id', me));
  },

  async updatePreferences(patch) {
    const me = await myProfileId();
    const map: Record<keyof Preferences, string> = {
      region: 'region',
      numberFormat: 'number_format',
      dateFormat: 'date_format',
      appearance: 'appearance',
      notifyPush: 'notify_push',
      notifyExpenses: 'notify_expenses',
      notifySettlements: 'notify_settlements',
      notifyInvites: 'notify_invites',
      notifyReminders: 'notify_reminders',
    };
    const row: Row = {};
    for (const [k, v] of Object.entries(patch)) row[map[k as keyof Preferences]] = v;
    await q(getSupabase().from('user_preferences').update(row).eq('profile_id', me));
  },

  async uploadAvatar(file) {
    const me = await myProfileId();
    const path = `${me}/${randomId()}.${extOf(file.mimeType)}`;
    await uploadToBucket('avatars', path, file);
    return getSupabase().storage.from('avatars').getPublicUrl(path).data.publicUrl;
  },

  async deleteAccount() {
    await rpc('delete_my_account');
  },

  async listCategories() {
    const rows = await q<Row[]>(getSupabase().from('expense_categories').select('*').order('sort'));
    return rows.map((r) => ({ id: r.id, name: r.name, icon: r.icon }));
  },

  async listGroups() {
    const rows = await q<Row[]>(
      getSupabase().from('groups').select(GROUP_SELECT).order('created_at', { ascending: false }),
    );
    return rows.map(mapGroup);
  },

  async createGroup(i) {
    return rpc<string>('create_group', {
      p_name: i.name,
      p_type: i.type,
      p_currency: i.currency,
      p_icon: i.icon,
      p_description: i.description ?? null,
      p_invitee_ids: i.inviteeIds,
    });
  },

  async updateGroup(groupId, i) {
    await rpc('update_group', {
      p_group_id: groupId,
      p_name: i.name,
      p_type: i.type,
      p_icon: i.icon,
      p_currency: i.currency,
      p_description: i.description ?? null,
    });
  },

  async setGroupArchived(groupId, archived) {
    await rpc('set_group_archived', { p_group_id: groupId, p_archived: archived });
  },
  async leaveGroup(groupId) {
    await rpc('leave_group', { p_group_id: groupId });
  },
  async listRecurring(groupId) {
    const rows = await q<Row[]>(
      getSupabase()
        .from('recurring_expenses')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false }),
    );
    return rows.map((r) => ({
      id: r.id,
      groupId: r.group_id,
      createdBy: r.created_by,
      description: r.description,
      amount: num(r.amount_minor),
      currency: r.currency,
      paidBy: r.paid_by,
      categoryId: r.category_id,
      frequency: r.frequency,
      nextRun: r.next_run,
      active: !!r.active,
      lastError: r.last_error ?? null,
    }));
  },
  async createRecurring(i) {
    return rpc<string>('create_recurring_expense', {
      p_group_id: i.groupId,
      p_client_id: i.clientId,
      p_description: i.description,
      p_amount_minor: i.amount,
      p_currency: i.currency,
      p_paid_by: i.paidBy,
      p_splits: i.splits.map((s) => ({ profile_id: s.profileId, amount_minor: s.amount, input_value: s.inputValue })),
      p_split_method: i.splitMethod,
      p_category_id: i.categoryId,
      p_notes: i.notes,
      p_frequency: i.frequency,
      p_start_date: i.startDate,
    });
  },
  async setRecurringActive(id, active) {
    await rpc('set_recurring_active', { p_id: id, p_active: active });
  },
  async deleteRecurring(id) {
    await rpc('delete_recurring_expense', { p_id: id });
  },
  async getGroupSplitDefault(groupId) {
    const row = await q<Row | null>(
      getSupabase().from('group_split_defaults').select('method, members').eq('group_id', groupId).maybeSingle(),
    );
    if (!row) return null;
    return {
      method: row.method,
      members: (row.members as Row[]).map((m) => ({
        profileId: m.profile_id,
        included: !!m.included,
        value: num(m.value),
      })),
    };
  },
  async setGroupSplitDefault(groupId, d) {
    await rpc('set_group_split_default', {
      p_group_id: groupId,
      p_method: d.method,
      p_members: d.members.map((m) => ({ profile_id: m.profileId, included: m.included, value: m.value })),
    });
  },
  async clearGroupSplitDefault(groupId) {
    await rpc('clear_group_split_default', { p_group_id: groupId });
  },
  async removeMember(groupId, profileId) {
    await rpc('remove_member', { p_group_id: groupId, p_profile_id: profileId });
  },

  async getInviteLink(groupId) {
    const [r] = await rpc<Row[]>('get_invite_link', { p_group_id: groupId });
    return { code: r!.code, expiresAt: r!.expires_at };
  },
  async resetInviteLink(groupId) {
    const [r] = await rpc<Row[]>('reset_invite_link', { p_group_id: groupId });
    return { code: r!.code, expiresAt: r!.expires_at };
  },

  async listGroupInvitations(groupId) {
    const rows = await q<Row[]>(
      getSupabase()
        .from('group_invitations')
        .select('*')
        .eq('group_id', groupId)
        .eq('kind', 'direct')
        .eq('status', 'pending'),
    );
    return rows.map(mapInvitation);
  },

  async listMyInvitations() {
    const me = await myProfileId();
    const rows = await q<Row[]>(
      getSupabase()
        .from('group_invitations')
        .select('*')
        .eq('invitee_profile_id', me)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false }),
    );
    // Group details aren't visible before joining; the invite notification carries them.
    const notes = await q<Row[]>(getSupabase().from('notifications').select('data').eq('type', 'group_invite'));
    const byId = new Map(notes.map((n) => [n.data?.invitation_id, n.data]));
    return rows.map((r) => {
      const d = byId.get(r.id) ?? {};
      return {
        ...mapInvitation(r),
        groupName: d.group_name ?? 'a group',
        inviterName: d.actor_name ?? 'Someone',
        memberCount: Number(d.member_count ?? 0),
        currency: (d.currency ?? 'USD') as CurrencyCode,
      };
    });
  },

  async inviteProfiles(groupId, profileIds) {
    return rpc<number>('invite_profiles', { p_group_id: groupId, p_profile_ids: profileIds });
  },

  async previewInvite(code) {
    const [r] = await rpc<Row[]>('preview_invite', { p_code: code });
    return {
      groupId: r!.group_id,
      groupName: r!.group_name,
      icon: r!.icon,
      currency: r!.currency,
      memberCount: num(r!.member_count),
      inviterName: r!.inviter_name,
      alreadyMember: r!.already_member,
    };
  },
  async acceptInvite(code) {
    return rpc<string>('accept_invite', { p_code: code });
  },
  async respondInvitation(id, accept) {
    return rpc<string>('respond_invitation', { p_invitation_id: id, p_accept: accept });
  },

  async findProfileByEmail(email) {
    const rows = await rpc<Row[]>('find_profiles_by_email', { p_email: email });
    const r = rows[0];
    return r ? { id: r.id, fullName: r.full_name, avatarUrl: r.avatar_url } : null;
  },

  async getFriends() {
    const rows = await rpc<Row[]>('get_friends');
    return rows.map((r) => ({
      profileId: r.profile_id,
      name: r.full_name,
      avatarUrl: r.avatar_url,
      email: r.email,
      groupIds: r.group_ids ?? [],
      groupNames: r.group_names ?? [],
    }));
  },

  async getMyGroupBalances(): Promise<BalanceRow[]> {
    const rows = await rpc<Row[]>('get_my_group_balances');
    return rows.map((r) => ({
      groupId: r.group_id,
      profileId: r.profile_id,
      currency: r.currency,
      net: num(r.net_minor),
    }));
  },

  async getGroupTotals(groupId) {
    const rows = await rpc<Row[]>('get_group_totals', { p_group_id: groupId });
    return rows.map((r) => ({
      currency: r.currency,
      totalSpent: num(r.total_spent),
      myPaid: num(r.my_paid),
      myShare: num(r.my_share),
      count: num(r.expense_count),
    }));
  },

  async getSpendingReport(currency, months) {
    const r = await rpc<Row>('get_spending_report', { p_currency: currency, p_months: months });
    return {
      currency,
      months: (r.months ?? []).map((m: Row) => ({ month: m.month, share: num(m.share_minor) })),
      categories: (r.categories ?? []).map((c: Row) => ({
        categoryId: c.category_id,
        name: c.name,
        icon: c.icon,
        share: num(c.share_minor),
      })),
    };
  },

  async listGroupExpenses(groupId) {
    const rows = await q<Row[]>(
      getSupabase()
        .from('expenses')
        .select('*, expense_splits(profile_id, amount_minor, input_value)')
        .eq('group_id', groupId)
        .is('deleted_at', null)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(500),
    );
    return rows.map(mapExpense);
  },

  async getExpense(expenseId) {
    const sb = getSupabase();
    const [row, audit, receipts, itemRow] = await Promise.all([
      q<Row>(
        sb
          .from('expenses')
          .select('*, expense_splits(profile_id, amount_minor, input_value)')
          .eq('id', expenseId)
          .single(),
      ),
      q<Row[]>(
        sb
          .from('audit_logs')
          .select('*')
          .eq('entity_type', 'expense')
          .eq('entity_id', expenseId)
          .order('id', { ascending: false }),
      ),
      q<Row[]>(sb.from('receipts').select('*').eq('expense_id', expenseId).order('created_at')),
      q<Row | null>(
        sb.from('expense_itemizations').select('items, extra_minor').eq('expense_id', expenseId).maybeSingle(),
      ),
    ]);
    if (row.deleted_at) throw toAppError({ message: 'not_found' });
    const withUrls: Receipt[] = await Promise.all(
      receipts.map(async (r) => {
        const { data } = await sb.storage.from('receipts').createSignedUrl(r.storage_path, 3600);
        return { id: r.id, storagePath: r.storage_path, mimeType: r.mime_type, url: data?.signedUrl ?? null };
      }),
    );
    return {
      ...mapExpense(row),
      audit: audit.map((a): AuditEntry => ({
        id: num(a.id),
        action: a.action,
        actorId: a.actor_id,
        before: a.before,
        after: a.after,
        createdAt: a.created_at,
      })),
      receipts: withUrls,
      itemization: itemRow
        ? {
            items: (itemRow.items as Row[]).map((it) => ({
              name: it.name ?? '',
              amount: num(it.amount_minor),
              memberIds: it.member_ids as string[],
            })),
            extra: num(itemRow.extra_minor),
          }
        : null,
    };
  },
  async setExpenseItems(expenseId, value) {
    await rpc('set_expense_items', {
      p_expense_id: expenseId,
      p_items: value
        ? value.items.map((it) => ({ name: it.name, amount_minor: it.amount, member_ids: it.memberIds }))
        : null,
      p_extra_minor: value?.extra ?? 0,
    });
  },

  async saveExpense(i) {
    return rpc<string>('save_expense', {
      p_group_id: i.groupId,
      p_client_id: i.clientId,
      p_description: i.description,
      p_amount_minor: i.amount,
      p_currency: i.currency,
      p_paid_by: i.paidBy,
      p_splits: i.splits.map((s) => ({ profile_id: s.profileId, amount_minor: s.amount, input_value: s.inputValue })),
      p_split_method: i.splitMethod,
      p_category_id: i.categoryId,
      p_expense_date: i.date,
      p_notes: i.notes,
      p_expense_id: i.expenseId ?? null,
      p_expected_version: i.expectedVersion ?? null,
    });
  },

  async deleteExpense(expenseId) {
    await rpc('delete_expense', { p_expense_id: expenseId });
  },

  async uploadReceipt(expense, file) {
    const path = `${expense.groupId}/${expense.id}/${randomId()}.${extOf(file.mimeType)}`;
    await uploadToBucket('receipts', path, file);
    await rpc('add_receipt', {
      p_expense_id: expense.id,
      p_storage_path: path,
      p_mime_type: file.mimeType,
      p_size_bytes: file.size ?? null,
    });
  },

  async listGroupSettlements(groupId) {
    const rows = await q<Row[]>(
      getSupabase()
        .from('settlements')
        .select('*')
        .eq('group_id', groupId)
        .is('deleted_at', null)
        .order('settled_on', { ascending: false }),
    );
    return rows.map(mapSettlement);
  },

  async listSettlementsAwaitingMe() {
    const me = await myProfileId();
    const rows = await q<Row[]>(
      getSupabase()
        .from('settlements')
        .select('*')
        .eq('to_profile', me)
        .eq('status', 'pending')
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
    );
    return rows.map(mapSettlement);
  },

  async getSettlement(id) {
    return mapSettlement(await q<Row>(getSupabase().from('settlements').select('*').eq('id', id).single()));
  },

  async recordSettlement(i) {
    return rpc<string>('record_settlement', {
      p_group_id: i.groupId,
      p_client_id: i.clientId,
      p_from_profile: i.from,
      p_to_profile: i.to,
      p_amount_minor: i.amount,
      p_currency: i.currency,
      p_method: i.method,
      p_reference: i.reference,
      p_settled_on: i.date,
      p_note: i.note,
    });
  },

  async respondSettlement(id, confirm) {
    await rpc('respond_settlement', { p_settlement_id: id, p_confirm: confirm });
  },

  async sendReminder(groupId, profileId) {
    await rpc('send_reminder', { p_group_id: groupId, p_profile_id: profileId });
  },

  async listActivity({ groupId, kind = 'all', search, cursor, limit = 30 }) {
    let query = getSupabase()
      .from('activity_logs')
      .select('*, groups(name)')
      .order('id', { ascending: false })
      .limit(limit);
    if (groupId) query = query.eq('group_id', groupId);
    if (kind === 'expenses') query = query.eq('entity_type', 'expense');
    if (kind === 'settlements') query = query.eq('entity_type', 'settlement');
    if (kind === 'groups') query = query.in('entity_type', ['group', 'member', 'invitation']);
    if (cursor) query = query.lt('id', cursor);
    const s = search?.trim().replace(/[%,()]/g, ' ');
    if (s)
      query = query.or(
        `data->>description.ilike.%${s}%,data->>group_name.ilike.%${s}%,data->>actor_name.ilike.%${s}%,data->>member_name.ilike.%${s}%`,
      );
    const rows = await q<Row[]>(query);
    const items = rows.map(mapActivity);
    return { items, nextCursor: items.length === limit ? items[items.length - 1]!.id : null };
  },

  async listNotifications() {
    const rows = await q<Row[]>(
      getSupabase().from('notifications').select('*').order('created_at', { ascending: false }).limit(100),
    );
    return rows.map(mapNotification);
  },

  async markNotificationsRead(ids) {
    await rpc('mark_notifications_read', { p_ids: ids ?? null });
  },

  async registerPushToken(token, platform) {
    await rpc('register_push_token', { p_token: token, p_platform: platform });
  },
  async unregisterPushToken(token) {
    await rpc('unregister_push_token', { p_token: token });
  },

  subscribe(onChange) {
    const sb = getSupabase();
    const channel = sb
      .channel('evenly-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => onChange('notifications'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => onChange('ledger'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements' }, () => onChange('ledger'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, () => onChange('groups'))
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  },
};
