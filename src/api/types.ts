import type { CurrencyCode, FxRates, Minor, SplitMethod } from '@/domain/money';

export type GroupType = 'home' | 'trip' | 'couple' | 'work' | 'other';
export type MemberRole = 'owner' | 'admin' | 'member';
export type MemberStatus = 'active' | 'left' | 'removed';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'other';
export type SettlementStatus = 'pending' | 'confirmed' | 'rejected';
export type NumberFormatPref = '1,234.56' | '1.234,56' | '1 234,56';
export type DateFormatPref = 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';

export interface Profile {
  id: string;
  fullName: string;
  email: string | null;
  avatarUrl: string | null;
  phone: string | null;
  defaultCurrency: CurrencyCode;
  timeZone: string;
  onboarded: boolean;
}

export interface Preferences {
  region: string;
  numberFormat: NumberFormatPref;
  dateFormat: DateFormatPref;
  appearance: 'light' | 'dark' | 'system';
  notifyPush: boolean;
  notifyExpenses: boolean;
  notifySettlements: boolean;
  notifyInvites: boolean;
  notifyReminders: boolean;
}

export type PlanName = 'free' | 'pro';

/** The user's plan and how much of the Free allowance they've used. */
export interface PlanInfo {
  plan: PlanName;
  groupLimit: number;
  groupsUsed: number;
  expenseLimit: number;
  expensesUsed: number;
  /** First day of next month (YYYY-MM-DD), when the expense count starts again. */
  resetsOn: string;
  /** Testing: users may switch plans themselves (no payments yet). */
  selfService: boolean;
}

export interface Me {
  profile: Profile;
  preferences: Preferences;
}

export interface Member {
  profileId: string;
  name: string;
  avatarUrl: string | null;
  email: string | null;
  role: MemberRole;
  status: MemberStatus;
  joinedAt: string;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  type: GroupType;
  icon: string;
  currency: CurrencyCode;
  createdBy: string;
  createdAt: string;
  archivedAt: string | null;
  /** All members ever (any status), so history can still name people who left. */
  members: Member[];
}

/** How the current user usually splits in a group; new expenses there start from it. */
export interface SplitDefault {
  /** Only methods that don't depend on the bill's total can be saved. */
  method: Extract<SplitMethod, 'equal' | 'percent' | 'shares'>;
  members: {
    profileId: string;
    included: boolean;
    /** basis points (percent) or scaled shares; 0 for equal */ value: number;
  }[];
}

export interface BalanceRow {
  groupId: string;
  profileId: string;
  currency: CurrencyCode;
  /** positive = is owed, negative = owes */
  net: Minor;
}

export interface Split {
  profileId: string;
  amount: Minor;
  inputValue: number | null;
}

export interface Expense {
  id: string;
  groupId: string;
  description: string;
  amount: Minor;
  currency: CurrencyCode;
  paidBy: string;
  categoryId: string;
  date: string;
  notes: string | null;
  splitMethod: SplitMethod;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  splits: Split[];
}

export interface AuditEntry {
  id: number;
  action: 'create' | 'update' | 'delete' | 'confirm' | 'reject';
  actorId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

export interface Receipt {
  id: string;
  storagePath: string;
  mimeType: string;
  url: string | null;
}

/** One line of an itemized bill, shared equally by the people who had it. */
export interface ExpenseItem {
  name: string;
  amount: Minor;
  memberIds: string[];
}

/** The items an expense was split from, plus tax / tip shared in proportion. */
export interface ExpenseItemization {
  items: ExpenseItem[];
  extra: Minor;
}

export interface ExpenseDetail extends Expense {
  audit: AuditEntry[];
  receipts: Receipt[];
  itemization: ExpenseItemization | null;
}

export interface Settlement {
  id: string;
  groupId: string;
  from: string;
  to: string;
  amount: Minor;
  currency: CurrencyCode;
  method: PaymentMethod;
  reference: string | null;
  date: string;
  note: string | null;
  status: SettlementStatus;
  createdBy: string;
  createdAt: string;
}

export interface ActivityItem {
  id: number;
  groupId: string | null;
  groupName: string | null;
  actorId: string | null;
  type: string;
  entityType: 'expense' | 'settlement' | 'group' | 'member' | 'invitation' | null;
  entityId: string | null;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  type: string;
  body: string;
  data: Record<string, unknown>;
  groupId: string | null;
  actorId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface Invitation {
  id: string;
  groupId: string;
  inviteeProfileId: string;
  invitedBy: string;
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  createdAt: string;
}

export interface Friend {
  profileId: string;
  name: string;
  avatarUrl: string | null;
  email: string | null;
  groupIds: string[];
  groupNames: string[];
}

export interface Category {
  id: string;
  name: string;
  icon: string;
}

export interface SpendingReport {
  currency: CurrencyCode;
  months: { month: string; share: Minor }[];
  categories: { categoryId: string; name: string; icon: string; share: Minor }[];
}

export interface GroupTotals {
  currency: CurrencyCode;
  totalSpent: Minor;
  myPaid: Minor;
  myShare: Minor;
  count: number;
}

export interface InvitePreview {
  groupId: string;
  groupName: string;
  icon: string;
  currency: CurrencyCode;
  memberCount: number;
  inviterName: string;
  alreadyMember: boolean;
}

export interface SaveExpenseInput {
  groupId: string;
  /** Client-generated UUID; replays of the same create are idempotent. */
  clientId: string;
  expenseId?: string;
  expectedVersion?: number;
  description: string;
  amount: Minor;
  currency: CurrencyCode;
  paidBy: string;
  splits: { profileId: string; amount: Minor; inputValue: number | null }[];
  splitMethod: SplitMethod;
  categoryId: string;
  date: string;
  notes: string | null;
}

export type RepeatFrequency = 'weekly' | 'monthly' | 'yearly';

/** A template that creates an expense on a schedule. */
export interface RecurringExpense {
  id: string;
  groupId: string;
  createdBy: string;
  description: string;
  amount: Minor;
  currency: CurrencyCode;
  paidBy: string;
  categoryId: string;
  frequency: RepeatFrequency;
  /** Date of the next expense to be created (YYYY-MM-DD). */
  nextRun: string;
  active: boolean;
  /** Why it was paused automatically (e.g. a member left), if it was. */
  lastError: string | null;
}

export interface CreateRecurringInput extends Omit<SaveExpenseInput, 'expenseId' | 'expectedVersion' | 'date'> {
  frequency: RepeatFrequency;
  /** The date of the expense just created; the next one is one period later. */
  startDate: string;
}

export interface RecordSettlementInput {
  groupId: string;
  clientId: string;
  from: string;
  to: string;
  amount: Minor;
  currency: CurrencyCode;
  method: PaymentMethod;
  reference: string | null;
  date: string;
  note: string | null;
}

export interface OnboardingInput {
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  defaultCurrency: CurrencyCode;
  timeZone: string;
  region: string;
  numberFormat: NumberFormatPref;
  dateFormat: DateFormatPref;
}

export interface CreateGroupInput {
  name: string;
  type: GroupType;
  currency: CurrencyCode;
  icon: string;
  description?: string | null;
  inviteeIds: string[];
}

export interface ActivityQuery {
  groupId?: string;
  kind?: 'all' | 'expenses' | 'settlements' | 'groups';
  search?: string;
  cursor?: number | null;
  limit?: number;
}

export interface Page<T> {
  items: T[];
  nextCursor: number | null;
}

export interface UploadFile {
  uri: string;
  mimeType: string;
  size?: number | null;
}

/**
 * Everything the UI needs from the backend. Two implementations:
 * `supabaseApi` (production) and `demoApi` (in-memory, seeded with the
 * design's sample data, for previews and tests).
 */
export interface Api {
  ensureProfile(input: { fullName?: string | null; avatarUrl?: string | null }): Promise<{ me: Me; isNew: boolean }>;
  getMe(): Promise<Me>;
  completeOnboarding(input: OnboardingInput): Promise<void>;
  updateProfile(
    patch: Partial<Pick<Profile, 'fullName' | 'phone' | 'avatarUrl' | 'defaultCurrency' | 'timeZone'>>,
  ): Promise<void>;
  updatePreferences(patch: Partial<Preferences>): Promise<void>;
  uploadAvatar(file: UploadFile): Promise<string>;
  deleteAccount(): Promise<void>;

  listCategories(): Promise<Category[]>;

  listGroups(): Promise<Group[]>;
  createGroup(input: CreateGroupInput): Promise<string>;
  updateGroup(groupId: string, input: Omit<CreateGroupInput, 'inviteeIds'>): Promise<void>;
  setGroupArchived(groupId: string, archived: boolean): Promise<void>;
  leaveGroup(groupId: string): Promise<void>;
  listRecurring(groupId: string): Promise<RecurringExpense[]>;
  createRecurring(input: CreateRecurringInput): Promise<string>;
  setRecurringActive(id: string, active: boolean): Promise<void>;
  deleteRecurring(id: string): Promise<void>;
  /** Today's exchange rates (units per USD), for approximate totals. fetchedAt is null if none are loaded yet. */
  getFxRates(): Promise<{ rates: FxRates; fetchedAt: string | null }>;
  getPlan(): Promise<PlanInfo>;
  /** Testing only, while there are no payments: switch your own plan. */
  setPlan(plan: PlanName): Promise<void>;
  getGroupSplitDefault(groupId: string): Promise<SplitDefault | null>;
  setGroupSplitDefault(groupId: string, d: SplitDefault): Promise<void>;
  clearGroupSplitDefault(groupId: string): Promise<void>;
  removeMember(groupId: string, profileId: string): Promise<void>;

  getInviteLink(groupId: string): Promise<{ code: string; expiresAt: string }>;
  resetInviteLink(groupId: string): Promise<{ code: string; expiresAt: string }>;
  listGroupInvitations(groupId: string): Promise<Invitation[]>;
  listMyInvitations(): Promise<
    (Invitation & { groupName: string; inviterName: string; memberCount: number; currency: CurrencyCode })[]
  >;
  inviteProfiles(groupId: string, profileIds: string[]): Promise<number>;
  previewInvite(code: string): Promise<InvitePreview>;
  acceptInvite(code: string): Promise<string>;
  respondInvitation(invitationId: string, accept: boolean): Promise<string>;
  findProfileByEmail(email: string): Promise<{ id: string; fullName: string; avatarUrl: string | null } | null>;
  getFriends(): Promise<Friend[]>;

  getMyGroupBalances(): Promise<BalanceRow[]>;
  getGroupTotals(groupId: string): Promise<GroupTotals[]>;
  getSpendingReport(currency: CurrencyCode, months: number): Promise<SpendingReport>;

  listGroupExpenses(groupId: string): Promise<Expense[]>;
  getExpense(expenseId: string): Promise<ExpenseDetail>;
  /** Attach the items an expense was split from; null removes them. */
  setExpenseItems(expenseId: string, value: ExpenseItemization | null): Promise<void>;
  saveExpense(input: SaveExpenseInput): Promise<string>;
  deleteExpense(expenseId: string): Promise<void>;
  uploadReceipt(expense: { id: string; groupId: string }, file: UploadFile): Promise<void>;

  listGroupSettlements(groupId: string): Promise<Settlement[]>;
  listSettlementsAwaitingMe(): Promise<Settlement[]>;
  getSettlement(id: string): Promise<Settlement>;
  recordSettlement(input: RecordSettlementInput): Promise<string>;
  respondSettlement(id: string, confirm: boolean): Promise<void>;
  sendReminder(groupId: string, profileId: string): Promise<void>;

  listActivity(query: ActivityQuery): Promise<Page<ActivityItem>>;
  listNotifications(): Promise<AppNotification[]>;
  markNotificationsRead(ids?: string[]): Promise<void>;
  registerPushToken(token: string, platform: 'ios' | 'android'): Promise<void>;
  unregisterPushToken(token: string): Promise<void>;

  /** Subscribe to server-side changes relevant to the user; returns an unsubscribe fn. */
  subscribe?(onChange: (topic: 'notifications' | 'ledger' | 'groups') => void): () => void;
}
