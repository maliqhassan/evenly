/**
 * In-memory demo backend seeded with the design's sample data. Implements
 * the same contract and business rules as the Supabase RPC layer (exact
 * splits, membership checks, idempotent creates, pending/confirmed
 * settlements) so every screen can be explored without any cloud setup.
 * State resets when the app reloads.
 */
import { computeNetBalances, splitEqual, type CurrencyCode } from '@/domain/money';
import { addDays, todayISO } from '@/lib/dates';

import { AppError } from './errors';
import type {
  ActivityItem,
  Api,
  AppNotification,
  AuditEntry,
  BalanceRow,
  Category,
  Expense,
  ExpenseItemization,
  Group,
  Invitation,
  Member,
  Me,
  RecurringExpense,
  Settlement,
  SplitDefault,
} from './types';

const ME = 'p-v';
const now = () => new Date().toISOString();
const delay = <T>(v: T, ms = 220) => new Promise<T>((r) => setTimeout(() => r(v), ms));
let seq = 1;
const uid = (p: string) => `${p}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const daysAgo = (n: number) => addDays(todayISO(), -n);
const tsDaysAgo = (n: number, hour = 18) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 42, 0, 0);
  return d.toISOString();
};

/* ------------------------------- people ------------------------------ */
const people: Record<string, { name: string; email: string }> = {
  'p-v': { name: 'Vanessa Clarke', email: 'vanessa.clarke@gmail.com' },
  'p-m': { name: 'Malik Hassan', email: 'malik@mail.com' },
  'p-j': { name: 'Jordan Lee', email: 'jordan@mail.com' },
  'p-p': { name: 'Priya Nair', email: 'priya@mail.com' },
  'p-s': { name: 'Sanya Rao', email: 'sanya@mail.com' },
  'p-a': { name: 'Ana Ruiz', email: 'ana.r@mail.com' },
  'p-k': { name: 'Vicky Chen', email: 'vicky@mail.com' },
  'p-t': { name: 'Tom Becker', email: 'tom@mail.com' },
  'p-o': { name: 'Omar Haddad', email: 'omar@mail.com' },
  'p-l': { name: 'Lena Fischer', email: 'lena@mail.com' },
};

const me: Me = {
  profile: {
    id: ME,
    fullName: 'Vanessa Clarke',
    email: 'vanessa.clarke@gmail.com',
    avatarUrl: null,
    phone: null,
    defaultCurrency: 'USD',
    timeZone: 'America/New_York',
    onboarded: false,
  },
  preferences: {
    region: 'US',
    numberFormat: '1,234.56',
    dateFormat: 'MM/DD/YYYY',
    appearance: 'light',
    notifyPush: true,
    notifyExpenses: true,
    notifySettlements: true,
    notifyInvites: true,
    notifyReminders: true,
  },
};

const member = (profileId: string, role: Member['role'] = 'member', joined = tsDaysAgo(300)): Member => ({
  profileId,
  name: people[profileId]!.name,
  avatarUrl: null,
  email: people[profileId]!.email,
  role,
  status: 'active',
  joinedAt: joined,
});

/* ------------------------------- groups ------------------------------ */
const groups: Group[] = [
  {
    id: 'g-flat',
    name: 'Flatmates',
    description: null,
    type: 'home',
    icon: 'house',
    currency: 'USD',
    createdBy: ME,
    createdAt: '2026-01-04T10:00:00Z',
    archivedAt: null,
    members: [member(ME, 'owner'), member('p-m'), member('p-j'), member('p-p')],
  },
  {
    id: 'g-lis',
    name: 'Lisbon Trip',
    description: null,
    type: 'trip',
    icon: 'plane',
    currency: 'EUR',
    createdBy: 'p-s',
    createdAt: tsDaysAgo(5),
    archivedAt: null,
    members: [
      member('p-s', 'owner'),
      member(ME, 'member', tsDaysAgo(3)),
      member('p-t'),
      member('p-m'),
      member('p-a'),
      member('p-k'),
    ],
  },
  {
    id: 'g-off',
    name: 'Office Lunch',
    description: null,
    type: 'work',
    icon: 'sandwich',
    currency: 'USD',
    createdBy: ME,
    createdAt: '2026-03-02T10:00:00Z',
    archivedAt: null,
    members: [
      member(ME, 'owner'),
      member('p-a'),
      member('p-k'),
      member('p-j'),
      member('p-o'),
      member('p-l'),
      member('p-t'),
      member('p-p'),
    ],
  },
  {
    id: 'g-cpl',
    name: 'Vanessa & Malik',
    description: null,
    type: 'couple',
    icon: 'heart',
    currency: 'USD',
    createdBy: ME,
    createdAt: '2026-02-14T10:00:00Z',
    archivedAt: null,
    members: [member(ME, 'owner'), member('p-m')],
  },
  {
    id: 'g-ski',
    name: 'Ski Weekend',
    description: null,
    type: 'trip',
    icon: 'plane',
    currency: 'USD',
    createdBy: ME,
    createdAt: '2025-12-10T10:00:00Z',
    archivedAt: '2026-02-01T10:00:00Z',
    members: [member(ME, 'owner'), member('p-j'), member('p-t')],
  },
  {
    id: 'g-book',
    name: 'Book Club',
    description: null,
    type: 'other',
    icon: 'users',
    currency: 'USD',
    createdBy: ME,
    createdAt: '2025-09-10T10:00:00Z',
    archivedAt: '2026-01-15T10:00:00Z',
    members: [member(ME, 'owner'), member('p-a')],
  },
];
// Groups the user can be invited to (not yet visible).
const hiddenGroups: Group[] = [
  {
    id: 'g-con',
    name: 'Concert night',
    description: null,
    type: 'other',
    icon: 'ticket',
    currency: 'USD',
    createdBy: 'p-s',
    createdAt: tsDaysAgo(1),
    archivedAt: null,
    members: [member('p-s', 'owner'), member('p-m'), member('p-a'), member('p-k'), member('p-t')],
  },
];

/* ------------------------------ expenses ----------------------------- */
const expenses: (Expense & { deletedAt: string | null })[] = [];
const audit = new Map<string, AuditEntry[]>();
let auditSeq = 1;

function seedExpense(e: {
  group: string;
  desc: string;
  amount: number;
  cur?: CurrencyCode;
  paidBy: string;
  cat: string;
  daysAgo: number;
  splits?: [string, number][];
  among?: string[];
  method?: Expense['splitMethod'];
  inputs?: number[];
}) {
  const g = [...groups, ...hiddenGroups].find((x) => x.id === e.group)!;
  const among = e.among ?? g.members.map((m) => m.profileId);
  const splits = e.splits
    ? e.splits.map(([profileId, amount], i) => ({ profileId, amount, inputValue: e.inputs?.[i] ?? null }))
    : splitEqual(e.amount, among).map((a) => ({ profileId: a.id, amount: a.amount, inputValue: null }));
  const created = tsDaysAgo(e.daysAgo);
  const ex = {
    id: uid('e'),
    groupId: e.group,
    description: e.desc,
    amount: e.amount,
    currency: e.cur ?? g.currency,
    paidBy: e.paidBy,
    categoryId: e.cat,
    date: daysAgo(e.daysAgo),
    notes: null,
    splitMethod: e.method ?? 'equal',
    version: 1,
    createdBy: e.paidBy,
    createdAt: created,
    updatedAt: created,
    splits,
    deletedAt: null,
  };
  expenses.push(ex);
  audit.set(ex.id, [
    {
      id: auditSeq++,
      action: 'create',
      actorId: e.paidBy,
      before: null,
      after: { amount_minor: e.amount, description: e.desc },
      createdAt: created,
    },
  ]);
  return ex;
}

// Flatmates → you are owed $260.00
seedExpense({ group: 'g-flat', desc: 'Rent — November', amount: 240000, paidBy: ME, cat: 'rent', daysAgo: 5 });
seedExpense({ group: 'g-flat', desc: 'Internet', amount: 6000, paidBy: ME, cat: 'internet', daysAgo: 9 });
seedExpense({ group: 'g-flat', desc: 'Electricity', amount: 9600, paidBy: 'p-p', cat: 'utilities', daysAgo: 1 });
const groceries = seedExpense({
  group: 'g-flat',
  desc: 'Groceries — Trader Joe’s',
  amount: 12000,
  paidBy: 'p-m',
  cat: 'groceries',
  daysAgo: 0,
  method: 'percent',
  splits: [
    [ME, 3000],
    ['p-m', 3000],
    ['p-j', 3600],
    ['p-p', 2400],
  ],
  inputs: [2500, 2500, 3000, 2000],
});
audit.get(groceries.id)!.unshift({
  id: auditSeq++,
  action: 'update',
  actorId: 'p-m',
  before: { amount_minor: 11000 },
  after: { amount_minor: 12000 },
  createdAt: tsDaysAgo(0, 18),
});
groceries.version = 2;
// Office Lunch → you are owed $42.00
seedExpense({
  group: 'g-off',
  desc: 'Dinner at the Bistro',
  amount: 18000,
  paidBy: ME,
  cat: 'dining',
  daysAgo: 0,
  among: [ME, 'p-a', 'p-k', 'p-j'],
});
seedExpense({
  group: 'g-off',
  desc: 'Weekend brunch',
  amount: 18600,
  paidBy: 'p-k',
  cat: 'dining',
  daysAgo: 7,
  among: [ME, 'p-k'],
});
// Lisbon Trip → you owe €84.20
seedExpense({ group: 'g-lis', desc: 'Flights to Lisbon', amount: 50520, paidBy: 'p-s', cat: 'travel', daysAgo: 3 });
// Couple → settled up
seedExpense({ group: 'g-cpl', desc: 'Weekly shop', amount: 8400, paidBy: 'p-m', cat: 'groceries', daysAgo: 12 });
// Concert night (hidden until invite accepted)
seedExpense({
  group: 'g-con',
  desc: 'Concert tickets',
  amount: 75000,
  paidBy: 'p-s',
  cat: 'entertainment',
  daysAgo: 4,
  among: ['p-s', 'p-m', 'p-a'],
});

/* ----------------------------- settlements ---------------------------- */
const settlements: (Settlement & { deletedAt: string | null })[] = [];
function seedSettlement(
  groupId: string,
  from: string,
  to: string,
  amount: number,
  daysAgoN: number,
  method: Settlement['method'] = 'cash',
  status: Settlement['status'] = 'confirmed',
) {
  const g = groups.find((x) => x.id === groupId)!;
  settlements.push({
    id: uid('s'),
    groupId,
    from,
    to,
    amount,
    currency: g.currency,
    method,
    reference: null,
    date: daysAgo(daysAgoN),
    note: null,
    status,
    createdBy: from,
    createdAt: tsDaysAgo(daysAgoN),
    deletedAt: null,
  });
}
seedSettlement('g-flat', 'p-j', 'p-m', 8000, 13);
seedSettlement('g-flat', 'p-m', ME, 100000, 20, 'bank_transfer');
seedSettlement('g-flat', 'p-j', ME, 48600, 15, 'bank_transfer');
seedSettlement('g-flat', 'p-j', ME, 4500, 1, 'cash');
seedSettlement('g-cpl', ME, 'p-m', 4200, 10, 'card');

/* ------------------------- invitations & notes ------------------------ */
const invitations: Invitation[] = [
  {
    id: 'inv-con',
    groupId: 'g-con',
    inviteeProfileId: ME,
    invitedBy: 'p-s',
    status: 'pending',
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  },
  {
    id: uid('inv'),
    groupId: 'g-flat',
    inviteeProfileId: 'p-o',
    invitedBy: ME,
    status: 'pending',
    createdAt: tsDaysAgo(2),
  },
];

const notifications: AppNotification[] = [
  {
    id: uid('n'),
    type: 'group_invite',
    body: 'Sanya invited you to Concert night',
    data: {
      invitation_id: 'inv-con',
      group_name: 'Concert night',
      member_count: 5,
      currency: 'USD',
      actor_name: 'Sanya Rao',
    },
    groupId: 'g-con',
    actorId: 'p-s',
    readAt: null,
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  },
  {
    id: uid('n'),
    type: 'expense_added',
    body: `Malik added "Groceries — Trader Joe’s" ($120.00) in Flatmates`,
    data: { expense_id: groceries.id, group_id: 'g-flat' },
    groupId: 'g-flat',
    actorId: 'p-m',
    readAt: null,
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
  },
  {
    id: uid('n'),
    type: 'settlement_recorded',
    body: 'Jordan settled $45.00 with you',
    data: { group_id: 'g-flat' },
    groupId: 'g-flat',
    actorId: 'p-j',
    readAt: null,
    createdAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
  },
  {
    id: uid('n'),
    type: 'reminder',
    body: 'Reminder: you owe Sanya €84.20',
    data: { group_id: 'g-lis' },
    groupId: 'g-lis',
    actorId: 'p-s',
    readAt: tsDaysAgo(1),
    createdAt: tsDaysAgo(1, 9),
  },
  {
    id: uid('n'),
    type: 'expense_updated',
    body: 'Malik edited "Groceries" — $110.00 → $120.00',
    data: { expense_id: groceries.id, group_id: 'g-flat' },
    groupId: 'g-flat',
    actorId: 'p-m',
    readAt: tsDaysAgo(1),
    createdAt: tsDaysAgo(1, 8),
  },
  {
    id: uid('n'),
    type: 'member_joined',
    body: 'Ana joined Office Lunch',
    data: { group_id: 'g-off' },
    groupId: 'g-off',
    actorId: 'p-a',
    readAt: tsDaysAgo(3),
    createdAt: tsDaysAgo(3),
  },
];

const categories: Category[] = [
  { id: 'groceries', name: 'Groceries', icon: 'shopping-cart' },
  { id: 'dining', name: 'Dining out', icon: 'utensils' },
  { id: 'rent', name: 'Rent', icon: 'key' },
  { id: 'utilities', name: 'Utilities', icon: 'zap' },
  { id: 'internet', name: 'Internet', icon: 'wifi' },
  { id: 'transport', name: 'Transport', icon: 'car' },
  { id: 'travel', name: 'Travel', icon: 'plane' },
  { id: 'entertainment', name: 'Entertainment', icon: 'ticket' },
  { id: 'shopping', name: 'Shopping', icon: 'shopping-bag' },
  { id: 'health', name: 'Health', icon: 'heart-pulse' },
  { id: 'gifts', name: 'Gifts', icon: 'gift' },
  { id: 'general', name: 'Other', icon: 'receipt' },
];

const extraActivity: ActivityItem[] = [
  {
    id: 1,
    groupId: 'g-lis',
    groupName: 'Lisbon Trip',
    actorId: ME,
    type: 'member_joined',
    entityType: 'member',
    entityId: ME,
    data: { member_name: 'Vanessa Clarke', invited_by: 'p-s', invited_by_name: 'Sanya Rao' },
    createdAt: tsDaysAgo(3, 9),
  },
];

/* ------------------------------- helpers ------------------------------ */
const visibleGroups = () => groups.filter((g) => g.members.some((m) => m.profileId === ME && m.status === 'active'));
const requireMember = (groupId: string) => {
  const g = visibleGroups().find((x) => x.id === groupId);
  if (!g) throw new AppError('not_member');
  return g;
};
const isActive = (g: Group, pid: string) => g.members.some((m) => m.profileId === pid && m.status === 'active');
const nameOf = (pid: string) => people[pid]?.name ?? 'Someone';
const liveExpenses = () => expenses.filter((e) => !e.deletedAt);
const liveSettlements = () => settlements.filter((s) => !s.deletedAt && s.status !== 'rejected');
const createdKeys = new Map<string, string>();

function memberNets(groupId: string) {
  const nets = computeNetBalances(
    liveExpenses()
      .filter((e) => e.groupId === groupId)
      .map((e) => ({
        id: e.id,
        currency: e.currency,
        amount: e.amount,
        paidBy: e.paidBy,
        splits: e.splits.map((s) => ({ userId: s.profileId, amount: s.amount })),
      })),
    liveSettlements()
      .filter((s) => s.groupId === groupId)
      .map((s) => ({ id: s.id, currency: s.currency, amount: s.amount, fromUserId: s.from, toUserId: s.to })),
  );
  return nets;
}

/* --------------------------------- api -------------------------------- */
export const demoApi: Api = {
  async ensureProfile() {
    const isNew = !me.profile.onboarded;
    return delay({ me: structuredClone(me), isNew });
  },
  async getMe() {
    return delay(structuredClone(me), 80);
  },
  async completeOnboarding(i) {
    Object.assign(me.profile, {
      fullName: i.fullName,
      phone: i.phone,
      avatarUrl: i.avatarUrl,
      defaultCurrency: i.defaultCurrency,
      timeZone: i.timeZone,
      onboarded: true,
    });
    Object.assign(me.preferences, { region: i.region, numberFormat: i.numberFormat, dateFormat: i.dateFormat });
    people[ME]!.name = i.fullName;
    groups.forEach((g) =>
      g.members.forEach((m) => m.profileId === ME && ((m.name = i.fullName), (m.avatarUrl = i.avatarUrl))),
    );
    return delay(undefined);
  },
  async updateProfile(patch) {
    Object.assign(me.profile, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
    if (patch.fullName) people[ME]!.name = patch.fullName;
    groups.forEach((g) =>
      g.members.forEach((m) => {
        if (m.profileId !== ME) return;
        if (patch.fullName) m.name = patch.fullName;
        if (patch.avatarUrl !== undefined) m.avatarUrl = patch.avatarUrl;
      }),
    );
    return delay(undefined);
  },
  async updatePreferences(patch) {
    Object.assign(me.preferences, patch);
    return delay(undefined, 60);
  },
  async uploadAvatar(file) {
    return delay(file.uri, 300);
  },
  async deleteAccount() {
    for (const g of visibleGroups()) {
      const nets = memberNets(g.id);
      for (const [, m] of nets) if ((m.get(ME) ?? 0) !== 0) throw new AppError('balances_outstanding');
    }
    return delay(undefined);
  },

  async listCategories() {
    return delay(categories, 50);
  },

  async listGroups() {
    return delay(structuredClone(visibleGroups()));
  },
  async createGroup(i) {
    const id = uid('g');
    groups.unshift({
      id,
      name: i.name.trim(),
      description: i.description ?? null,
      type: i.type,
      icon: i.icon,
      currency: i.currency,
      createdBy: ME,
      createdAt: now(),
      archivedAt: null,
      members: [{ ...member(ME, 'owner', now()), name: me.profile.fullName }],
    });
    for (const pid of i.inviteeIds)
      invitations.push({
        id: uid('inv'),
        groupId: id,
        inviteeProfileId: pid,
        invitedBy: ME,
        status: 'pending',
        createdAt: now(),
      });
    return delay(id, 350);
  },
  async updateGroup(groupId, i) {
    const g = requireMember(groupId);
    Object.assign(g, {
      name: i.name.trim(),
      type: i.type,
      icon: i.icon,
      currency: i.currency,
      description: i.description ?? null,
    });
    return delay(undefined);
  },
  async setGroupArchived(groupId, archived) {
    requireMember(groupId).archivedAt = archived ? now() : null;
    return delay(undefined);
  },
  async listRecurring(groupId) {
    requireMember(groupId);
    return delay(
      recurring.filter((r) => r.groupId === groupId).map((r) => ({ ...r })),
      60,
    );
  },
  async createRecurring(i) {
    requireMember(i.groupId);
    const days = { weekly: 7, monthly: 30, yearly: 365 }[i.frequency];
    const id = uid('rec');
    recurring.unshift({
      id,
      groupId: i.groupId,
      createdBy: ME,
      description: i.description,
      amount: i.amount,
      currency: i.currency,
      paidBy: i.paidBy,
      categoryId: i.categoryId,
      frequency: i.frequency,
      nextRun: addDays(i.startDate, days),
      active: true,
      lastError: null,
    });
    return delay(id, 60);
  },
  async setRecurringActive(id, active) {
    const r = recurring.find((x) => x.id === id);
    if (r) Object.assign(r, { active, lastError: active ? null : r.lastError });
    return delay(undefined, 40);
  },
  async deleteRecurring(id) {
    const i = recurring.findIndex((x) => x.id === id);
    if (i >= 0) recurring.splice(i, 1);
    return delay(undefined, 40);
  },
  async getGroupSplitDefault(groupId) {
    return delay(splitDefaults.get(groupId) ?? null, 40);
  },
  async setGroupSplitDefault(groupId, d) {
    requireMember(groupId);
    splitDefaults.set(groupId, structuredClone(d));
    return delay(undefined, 40);
  },
  async clearGroupSplitDefault(groupId) {
    splitDefaults.delete(groupId);
    return delay(undefined, 40);
  },
  async leaveGroup(groupId) {
    const g = requireMember(groupId);
    for (const [, m] of memberNets(groupId)) if ((m.get(ME) ?? 0) !== 0) throw new AppError('balances_outstanding');
    g.members.find((m) => m.profileId === ME)!.status = 'left';
    return delay(undefined);
  },
  async removeMember(groupId, profileId) {
    const g = requireMember(groupId);
    for (const [, m] of memberNets(groupId))
      if ((m.get(profileId) ?? 0) !== 0) throw new AppError('balances_outstanding');
    const m = g.members.find((x) => x.profileId === profileId);
    if (m) m.status = 'removed';
    return delay(undefined);
  },

  async getInviteLink(groupId) {
    requireMember(groupId);
    const code = `${groupId.replace(/[^a-z0-9]/g, '').slice(0, 6)}k92xq7m3`.slice(0, 12);
    return delay({ code, expiresAt: addDays(todayISO(), 30) }, 120);
  },
  async resetInviteLink(groupId) {
    return demoApi.getInviteLink(groupId);
  },
  async listGroupInvitations(groupId) {
    return delay(
      invitations.filter((i) => i.groupId === groupId && i.status === 'pending'),
      80,
    );
  },
  async listMyInvitations() {
    return delay(
      invitations
        .filter((i) => i.inviteeProfileId === ME && i.status === 'pending')
        .map((i) => {
          const g = [...groups, ...hiddenGroups].find((x) => x.id === i.groupId)!;
          return {
            ...i,
            groupName: g.name,
            inviterName: nameOf(i.invitedBy),
            memberCount: g.members.filter((m) => m.status === 'active').length,
            currency: g.currency,
          };
        }),
      80,
    );
  },
  async inviteProfiles(groupId, ids) {
    const g = requireMember(groupId);
    let n = 0;
    for (const pid of ids) {
      if (
        isActive(g, pid) ||
        invitations.some((i) => i.groupId === groupId && i.inviteeProfileId === pid && i.status === 'pending')
      )
        continue;
      invitations.push({
        id: uid('inv'),
        groupId,
        inviteeProfileId: pid,
        invitedBy: ME,
        status: 'pending',
        createdAt: now(),
      });
      n++;
    }
    return delay(n);
  },
  async previewInvite(code) {
    const g = groups.find((x) => code.startsWith(x.id.replace(/[^a-z0-9]/g, '').slice(0, 6)));
    if (!g) throw new AppError('invite_invalid');
    return delay({
      groupId: g.id,
      groupName: g.name,
      icon: g.icon,
      currency: g.currency,
      memberCount: g.members.filter((m) => m.status === 'active').length,
      inviterName: nameOf(g.createdBy),
      alreadyMember: isActive(g, ME),
    });
  },
  async acceptInvite(code) {
    const p = await demoApi.previewInvite(code);
    return delay(p.groupId);
  },
  async respondInvitation(id, accept) {
    const inv = invitations.find((i) => i.id === id && i.inviteeProfileId === ME && i.status === 'pending');
    if (!inv) throw new AppError('invite_invalid');
    inv.status = accept ? 'accepted' : 'declined';
    notifications.filter((n) => n.data.invitation_id === id).forEach((n) => (n.readAt = now()));
    if (accept) {
      const idx = hiddenGroups.findIndex((g) => g.id === inv.groupId);
      if (idx >= 0) {
        const [g] = hiddenGroups.splice(idx, 1);
        g!.members.push({ ...member(ME, 'member', now()), name: me.profile.fullName });
        groups.unshift(g!);
      }
    }
    return delay(inv.groupId);
  },
  async findProfileByEmail(email) {
    const e = email.trim().toLowerCase();
    const hit = Object.entries(people).find(([id, p]) => id !== ME && p.email === e);
    return delay(hit ? { id: hit[0], fullName: hit[1].name, avatarUrl: null } : null, 300);
  },
  async getFriends() {
    const map = new Map<string, { groupIds: string[]; groupNames: string[] }>();
    for (const g of visibleGroups()) {
      for (const m of g.members) {
        if (m.profileId === ME || m.status !== 'active') continue;
        const f = map.get(m.profileId) ?? { groupIds: [], groupNames: [] };
        f.groupIds.push(g.id);
        f.groupNames.push(g.name);
        map.set(m.profileId, f);
      }
    }
    return delay(
      [...map.entries()]
        .map(([profileId, f]) => ({
          profileId,
          name: nameOf(profileId),
          avatarUrl: null,
          email: people[profileId]!.email,
          ...f,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  },

  async getMyGroupBalances() {
    const rows: BalanceRow[] = [];
    for (const g of visibleGroups()) {
      for (const [currency, m] of memberNets(g.id)) {
        for (const [profileId, net] of m) if (net !== 0) rows.push({ groupId: g.id, profileId, currency, net });
      }
    }
    return delay(rows);
  },
  async getGroupTotals(groupId) {
    requireMember(groupId);
    const by = new Map<string, { totalSpent: number; myPaid: number; myShare: number; count: number }>();
    for (const e of liveExpenses().filter((x) => x.groupId === groupId)) {
      const t = by.get(e.currency) ?? { totalSpent: 0, myPaid: 0, myShare: 0, count: 0 };
      t.totalSpent += e.amount;
      t.count++;
      if (e.paidBy === ME) t.myPaid += e.amount;
      t.myShare += e.splits.find((s) => s.profileId === ME)?.amount ?? 0;
      by.set(e.currency, t);
    }
    return delay([...by.entries()].map(([currency, t]) => ({ currency, ...t })));
  },
  async getSpendingReport(currency, monthsN) {
    const mine = liveExpenses()
      .filter((e) => e.currency === currency && visibleGroups().some((g) => g.id === e.groupId))
      .map((e) => ({ date: e.date, cat: e.categoryId, share: e.splits.find((s) => s.profileId === ME)?.amount ?? 0 }))
      .filter((x) => x.share > 0);
    const base = new Date();
    // Synthetic history for earlier months so the chart looks lived-in.
    const synthetic = [96210, 121340, 112010, 152480, 112000];
    const months = Array.from({ length: monthsN }, (_, i) => {
      const d = new Date(base.getFullYear(), base.getMonth() - (monthsN - 1 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const real = mine.filter((x) => x.date.startsWith(key)).reduce((s, x) => s + x.share, 0);
      const extra = i < monthsN - 1 && currency === 'USD' ? (synthetic[i % synthetic.length] ?? 0) : 0;
      return { month: `${key}-01`, share: real + extra };
    });
    const thisMonth = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`;
    const cats = new Map<string, number>();
    for (const x of mine.filter((m) => m.date.startsWith(thisMonth))) cats.set(x.cat, (cats.get(x.cat) ?? 0) + x.share);
    return delay({
      currency,
      months,
      categories: [...cats.entries()]
        .map(([id, share]) => {
          const c = categories.find((k) => k.id === id)!;
          return { categoryId: id, name: c.name, icon: c.icon, share };
        })
        .sort((a, b) => b.share - a.share),
    });
  },

  async listGroupExpenses(groupId) {
    requireMember(groupId);
    return delay(
      structuredClone(
        liveExpenses()
          .filter((e) => e.groupId === groupId)
          .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
      ),
    );
  },
  async getExpense(id) {
    const e = expenses.find((x) => x.id === id);
    if (!e || e.deletedAt) throw new AppError('not_found');
    requireMember(e.groupId);
    const receipts = receiptStore.get(id) ?? [];
    return delay({
      ...structuredClone(e),
      audit: structuredClone(audit.get(id) ?? []),
      receipts,
      itemization: structuredClone(itemizations.get(id) ?? null),
    });
  },
  async setExpenseItems(expenseId, value) {
    const e = expenses.find((x) => x.id === expenseId);
    if (!e || e.deletedAt) throw new AppError('not_found');
    requireMember(e.groupId);
    if (value) itemizations.set(expenseId, structuredClone(value));
    else itemizations.delete(expenseId);
    return delay(undefined, 40);
  },
  async saveExpense(i) {
    const g = requireMember(i.groupId);
    if (!i.expenseId) {
      const prior = createdKeys.get(i.clientId);
      if (prior) return delay(prior);
    }
    if (g.archivedAt) throw new AppError('group_archived');
    if (!(i.amount > 0) || !i.description.trim()) throw new AppError('invalid_input');
    if (i.splits.reduce((s, x) => s + x.amount, 0) !== i.amount) throw new AppError('split_mismatch');
    if (!isActive(g, i.paidBy) || i.splits.some((s) => !isActive(g, s.profileId) || s.amount < 0))
      throw new AppError('invalid_participant');

    if (i.expenseId) {
      const e = expenses.find((x) => x.id === i.expenseId && !x.deletedAt);
      if (!e) throw new AppError('not_found');
      if (i.expectedVersion !== undefined && i.expectedVersion !== e.version) throw new AppError('conflict');
      const before = {
        amount_minor: e.amount,
        description: e.description,
        splits: Object.fromEntries(e.splits.map((s) => [s.profileId, s.amount])),
      };
      Object.assign(e, {
        description: i.description.trim(),
        amount: i.amount,
        currency: i.currency,
        paidBy: i.paidBy,
        categoryId: i.categoryId,
        date: i.date,
        notes: i.notes,
        splitMethod: i.splitMethod,
        splits: i.splits,
        version: e.version + 1,
        updatedAt: now(),
      });
      audit.get(e.id)!.unshift({
        id: auditSeq++,
        action: 'update',
        actorId: ME,
        before,
        after: {
          amount_minor: e.amount,
          description: e.description,
          splits: Object.fromEntries(e.splits.map((s) => [s.profileId, s.amount])),
        },
        createdAt: now(),
      });
      return delay(e.id, 350);
    }
    const id = uid('e');
    expenses.push({
      id,
      groupId: i.groupId,
      description: i.description.trim(),
      amount: i.amount,
      currency: i.currency,
      paidBy: i.paidBy,
      categoryId: i.categoryId,
      date: i.date,
      notes: i.notes,
      splitMethod: i.splitMethod,
      version: 1,
      createdBy: ME,
      createdAt: now(),
      updatedAt: now(),
      splits: i.splits,
      deletedAt: null,
    });
    audit.set(id, [
      {
        id: auditSeq++,
        action: 'create',
        actorId: ME,
        before: null,
        after: { amount_minor: i.amount, description: i.description },
        createdAt: now(),
      },
    ]);
    createdKeys.set(i.clientId, id);
    return delay(id, 350);
  },
  async deleteExpense(id) {
    const e = expenses.find((x) => x.id === id && !x.deletedAt);
    if (!e) throw new AppError('not_found');
    requireMember(e.groupId);
    e.deletedAt = now();
    audit.get(id)!.unshift({
      id: auditSeq++,
      action: 'delete',
      actorId: ME,
      before: { amount_minor: e.amount },
      after: null,
      createdAt: now(),
    });
    return delay(undefined);
  },
  async uploadReceipt(expense, file) {
    const list = receiptStore.get(expense.id) ?? [];
    list.push({ id: uid('r'), storagePath: file.uri, mimeType: file.mimeType, url: file.uri });
    receiptStore.set(expense.id, list);
    return delay(undefined, 300);
  },

  async listGroupSettlements(groupId) {
    requireMember(groupId);
    return delay(
      structuredClone(
        settlements.filter((s) => s.groupId === groupId && !s.deletedAt).sort((a, b) => b.date.localeCompare(a.date)),
      ),
    );
  },
  async listSettlementsAwaitingMe() {
    return delay(structuredClone(settlements.filter((s) => s.to === ME && s.status === 'pending' && !s.deletedAt)), 80);
  },
  async getSettlement(id) {
    const s = settlements.find((x) => x.id === id);
    if (!s) throw new AppError('not_found');
    return delay(structuredClone(s), 60);
  },
  async recordSettlement(i) {
    const g = requireMember(i.groupId);
    const prior = createdKeys.get(i.clientId);
    if (prior) return delay(prior);
    if (![i.from, i.to].includes(ME)) throw new AppError('forbidden');
    if (i.from === i.to || !(i.amount > 0)) throw new AppError('invalid_input');
    if (!isActive(g, i.from) || !isActive(g, i.to)) throw new AppError('invalid_participant');
    const id = uid('s');
    settlements.push({
      ...i,
      id,
      status: i.to === ME ? 'confirmed' : 'pending',
      createdBy: ME,
      createdAt: now(),
      deletedAt: null,
    });
    createdKeys.set(i.clientId, id);
    return delay(id, 400);
  },
  async respondSettlement(id, confirm) {
    const s = settlements.find((x) => x.id === id);
    if (!s || s.to !== ME) throw new AppError('forbidden');
    if (s.status !== 'pending') throw new AppError('conflict');
    s.status = confirm ? 'confirmed' : 'rejected';
    return delay(undefined);
  },
  async sendReminder() {
    return delay(undefined, 300);
  },

  async listActivity({ groupId, kind = 'all', search, cursor, limit = 30 }) {
    const vis = new Map(visibleGroups().map((g) => [g.id, g]));
    const items: ActivityItem[] = [...extraActivity];
    let id = 1000;
    for (const e of expenses) {
      const g = vis.get(e.groupId);
      if (!g) continue;
      const splits = Object.fromEntries(e.splits.map((s) => [s.profileId, s.amount]));
      const base = {
        description: e.description,
        amount_minor: e.amount,
        currency: e.currency,
        paid_by: e.paidBy,
        paid_by_name: nameOf(e.paidBy),
        category_id: e.categoryId,
        splits,
        group_name: g.name,
        actor_name: nameOf(e.createdBy),
      };
      items.push({
        id: id++,
        groupId: g.id,
        groupName: g.name,
        actorId: e.createdBy,
        type: 'expense_created',
        entityType: 'expense',
        entityId: e.id,
        data: base,
        createdAt: e.createdAt,
      });
      if (e.deletedAt)
        items.push({
          id: id++,
          groupId: g.id,
          groupName: g.name,
          actorId: ME,
          type: 'expense_deleted',
          entityType: 'expense',
          entityId: e.id,
          data: base,
          createdAt: e.deletedAt,
        });
    }
    for (const s of settlements) {
      const g = vis.get(s.groupId);
      if (!g || s.deletedAt) continue;
      items.push({
        id: id++,
        groupId: g.id,
        groupName: g.name,
        actorId: s.createdBy,
        type: 'settlement_recorded',
        entityType: 'settlement',
        entityId: s.id,
        data: {
          from: s.from,
          from_name: nameOf(s.from),
          to: s.to,
          to_name: nameOf(s.to),
          amount_minor: s.amount,
          currency: s.currency,
          method: s.method,
          status: s.status,
          group_name: g.name,
        },
        createdAt: s.createdAt,
      });
    }
    let list = items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((x, i) => ({ ...x, id: 100000 - i }));
    if (groupId) list = list.filter((x) => x.groupId === groupId);
    if (kind === 'expenses') list = list.filter((x) => x.entityType === 'expense');
    if (kind === 'settlements') list = list.filter((x) => x.entityType === 'settlement');
    if (kind === 'groups') list = list.filter((x) => x.entityType === 'member' || x.entityType === 'group');
    const s = search?.trim().toLowerCase();
    if (s)
      list = list.filter(
        (x) => JSON.stringify(x.data).toLowerCase().includes(s) || (x.groupName ?? '').toLowerCase().includes(s),
      );
    if (cursor) list = list.filter((x) => x.id < cursor);
    const page = list.slice(0, limit);
    return delay({ items: page, nextCursor: page.length === limit ? page[page.length - 1]!.id : null });
  },
  async listNotifications() {
    return delay(structuredClone(notifications));
  },
  async markNotificationsRead(ids) {
    notifications.forEach((n) => {
      if (!ids || ids.includes(n.id)) n.readAt = n.readAt ?? now();
    });
    return delay(undefined, 60);
  },
  async registerPushToken() {
    return delay(undefined, 10);
  },
  async unregisterPushToken() {
    return delay(undefined, 10);
  },
};

const splitDefaults = new Map<string, SplitDefault>();
const itemizations = new Map<string, ExpenseItemization>();
const recurring: RecurringExpense[] = [];
const receiptStore = new Map<string, { id: string; storagePath: string; mimeType: string; url: string | null }[]>();
