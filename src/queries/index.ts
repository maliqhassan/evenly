import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import {
  api,
  type ActivityQuery,
  type CreateGroupInput,
  type Group,
  type OnboardingInput,
  type PlanName,
  type Preferences,
  type Profile,
  type RecordSettlementInput,
  type ExpenseItemization,
  type RepeatFrequency,
  type SaveExpenseInput,
  type SplitDefault,
  type UploadFile,
} from '@/api';
import type { CurrencyCode } from '@/domain/money';
import { useSession } from '@/stores/session';

/* --------------------------------- keys --------------------------------- */
export const qk = {
  me: ['me'] as const,
  categories: ['categories'] as const,
  groups: ['groups'] as const,
  balances: ['balances'] as const,
  friends: ['friends'] as const,
  groupExpenses: (id: string) => ['group', id, 'expenses'] as const,
  groupSettlements: (id: string) => ['group', id, 'settlements'] as const,
  groupTotals: (id: string) => ['group', id, 'totals'] as const,
  groupInvites: (id: string) => ['group', id, 'invites'] as const,
  splitDefault: (id: string) => ['group', id, 'split-default'] as const,
  recurring: (id: string) => ['group', id, 'recurring'] as const,
  fxRates: ['fx-rates'] as const,
  plan: ['plan'] as const,
  inviteLink: (id: string) => ['group', id, 'link'] as const,
  expense: (id: string) => ['expense', id] as const,
  settlement: (id: string) => ['settlement', id] as const,
  awaitingMe: ['settlements', 'awaiting'] as const,
  activity: (q: ActivityQuery) => ['activity', q] as const,
  notifications: ['notifications'] as const,
  myInvites: ['invites', 'mine'] as const,
  report: (currency: string, months: number) => ['report', currency, months] as const,
};

/** Anything that changes money invalidates every derived view. */
export function invalidateLedger(qc: QueryClient, groupId?: string) {
  qc.invalidateQueries({ queryKey: qk.balances });
  qc.invalidateQueries({ queryKey: ['activity'] });
  qc.invalidateQueries({ queryKey: ['report'] });
  qc.invalidateQueries({ queryKey: qk.awaitingMe });
  qc.invalidateQueries({ queryKey: qk.notifications });
  qc.invalidateQueries({ queryKey: qk.plan });
  if (groupId) qc.invalidateQueries({ queryKey: ['group', groupId] });
  else qc.invalidateQueries({ queryKey: ['group'] });
}

/* -------------------------------- queries ------------------------------- */
export const useCategories = () =>
  useQuery({ queryKey: qk.categories, queryFn: api.listCategories, staleTime: Infinity });

export const useGroups = () => useQuery({ queryKey: qk.groups, queryFn: api.listGroups });

export function useGroup(groupId: string | undefined | null): { group: Group | undefined; isLoading: boolean } {
  const { data, isLoading } = useGroups();
  return { group: useMemo(() => data?.find((g) => g.id === groupId), [data, groupId]), isLoading };
}

export const useBalances = () => useQuery({ queryKey: qk.balances, queryFn: api.getMyGroupBalances });
export const useFriends = () => useQuery({ queryKey: qk.friends, queryFn: api.getFriends });
export const useGroupExpenses = (id: string) =>
  useQuery({ queryKey: qk.groupExpenses(id), queryFn: () => api.listGroupExpenses(id), enabled: !!id });
export const useGroupSettlements = (id: string) =>
  useQuery({ queryKey: qk.groupSettlements(id), queryFn: () => api.listGroupSettlements(id), enabled: !!id });
export const useGroupTotals = (id: string) =>
  useQuery({ queryKey: qk.groupTotals(id), queryFn: () => api.getGroupTotals(id), enabled: !!id });
export const useRecurring = (groupId: string) =>
  useQuery({ queryKey: qk.recurring(groupId), queryFn: () => api.listRecurring(groupId), enabled: !!groupId });
export const useSetRecurringActive = (groupId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.setRecurringActive(id, active),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.recurring(groupId) }),
  });
};
export const useDeleteRecurring = (groupId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteRecurring(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.recurring(groupId) }),
  });
};
/** Today's exchange rates; they only change daily, so cache them for hours. */
export const useFxRates = () =>
  useQuery({ queryKey: qk.fxRates, queryFn: api.getFxRates, staleTime: 6 * 60 * 60 * 1000 });
/** The user's plan and Free allowance. */
export const usePlan = () => useQuery({ queryKey: qk.plan, queryFn: api.getPlan, staleTime: 60 * 1000 });
export function useSetPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (plan: PlanName) => api.setPlan(plan),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.plan }),
  });
}
export const useGroupSplitDefault = (id: string | null | undefined) =>
  useQuery({
    queryKey: qk.splitDefault(id ?? ''),
    queryFn: () => api.getGroupSplitDefault(id!),
    enabled: !!id,
  });
export const useSaveSplitDefault = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, value }: { groupId: string; value: SplitDefault | null }) =>
      value ? api.setGroupSplitDefault(groupId, value) : api.clearGroupSplitDefault(groupId),
    onSuccess: (_d, { groupId }) => qc.invalidateQueries({ queryKey: qk.splitDefault(groupId) }),
  });
};
export const useGroupInvitations = (id: string) =>
  useQuery({ queryKey: qk.groupInvites(id), queryFn: () => api.listGroupInvitations(id), enabled: !!id });
export const useInviteLink = (id: string) =>
  useQuery({
    queryKey: qk.inviteLink(id),
    queryFn: () => api.getInviteLink(id),
    enabled: !!id,
    staleTime: 10 * 60_000,
  });
export const useExpense = (id: string) =>
  useQuery({ queryKey: qk.expense(id), queryFn: () => api.getExpense(id), enabled: !!id });
export const useSettlement = (id: string | undefined) =>
  useQuery({ queryKey: qk.settlement(id ?? ''), queryFn: () => api.getSettlement(id!), enabled: !!id });
export const useAwaitingMe = () => useQuery({ queryKey: qk.awaitingMe, queryFn: api.listSettlementsAwaitingMe });
export const useNotifications = () => useQuery({ queryKey: qk.notifications, queryFn: api.listNotifications });
export const useMyInvitations = () => useQuery({ queryKey: qk.myInvites, queryFn: api.listMyInvitations });
export const useSpendingReport = (currency: CurrencyCode, months = 6) =>
  useQuery({ queryKey: qk.report(currency, months), queryFn: () => api.getSpendingReport(currency, months) });

export function useActivity(query: Omit<ActivityQuery, 'cursor'>) {
  return useInfiniteQuery({
    queryKey: qk.activity(query),
    queryFn: ({ pageParam }) => api.listActivity({ ...query, cursor: pageParam }),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useUnreadCount(): number {
  const { data } = useNotifications();
  return data?.filter((n) => !n.readAt).length ?? 0;
}

/* ------------------------------- mutations ------------------------------ */
function useMeRefresh() {
  const setMe = useSession((s) => s.setMe);
  return async () => setMe(await api.getMe());
}

export function useCompleteOnboarding() {
  const refresh = useMeRefresh();
  return useMutation({
    mutationFn: (i: OnboardingInput) => api.completeOnboarding(i),
    onSuccess: refresh,
  });
}

export function useUpdateProfile() {
  const refresh = useMeRefresh();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Parameters<typeof api.updateProfile>[0]) => api.updateProfile(p),
    onSuccess: async () => {
      await refresh();
      qc.invalidateQueries({ queryKey: qk.groups });
      qc.invalidateQueries({ queryKey: qk.friends });
    },
  });
}

export function useUpdatePreferences() {
  const patchMe = useSession((s) => s.patchMe);
  return useMutation({
    mutationFn: (p: Partial<Preferences>) => api.updatePreferences(p),
    // Optimistic: preferences are self-owned and low-risk.
    onMutate: (p) => patchMe((me) => ({ ...me, preferences: { ...me.preferences, ...p } })),
  });
}

export function useUpdateDefaultCurrency() {
  const patchMe = useSession((s) => s.patchMe);
  return useMutation({
    mutationFn: (currency: Profile['defaultCurrency']) => api.updateProfile({ defaultCurrency: currency }),
    onMutate: (c) => patchMe((me) => ({ ...me, profile: { ...me.profile, defaultCurrency: c } })),
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (i: CreateGroupInput) => api.createGroup(i),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.groups });
      qc.invalidateQueries({ queryKey: ['activity'] });
      qc.invalidateQueries({ queryKey: qk.plan });
    },
  });
}

export function useUpdateGroup(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (i: Omit<CreateGroupInput, 'inviteeIds'>) => api.updateGroup(groupId, i),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.groups }),
  });
}

export function useGroupMembership() {
  const qc = useQueryClient();
  const done = () => {
    qc.invalidateQueries({ queryKey: qk.groups });
    qc.invalidateQueries({ queryKey: qk.balances });
    qc.invalidateQueries({ queryKey: qk.friends });
    qc.invalidateQueries({ queryKey: qk.plan });
  };
  return {
    archive: useMutation({
      mutationFn: (v: { groupId: string; archived: boolean }) => api.setGroupArchived(v.groupId, v.archived),
      onSuccess: done,
    }),
    leave: useMutation({ mutationFn: (groupId: string) => api.leaveGroup(groupId), onSuccess: done }),
    remove: useMutation({
      mutationFn: (v: { groupId: string; profileId: string }) => api.removeMember(v.groupId, v.profileId),
      onSuccess: done,
    }),
  };
}

export function useInviteProfiles(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.inviteProfiles(groupId, ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.groupInvites(groupId) }),
  });
}

export function useRespondInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; accept: boolean }) => api.respondInvitation(v.id, v.accept),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.myInvites });
      qc.invalidateQueries({ queryKey: qk.notifications });
      qc.invalidateQueries({ queryKey: qk.groups });
      qc.invalidateQueries({ queryKey: qk.balances });
      qc.invalidateQueries({ queryKey: qk.friends });
    },
  });
}

export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.acceptInvite(code),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.groups });
      qc.invalidateQueries({ queryKey: qk.balances });
      qc.invalidateQueries({ queryKey: qk.friends });
    },
  });
}

export function useSaveExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      input: SaveExpenseInput;
      receipt?: UploadFile | null;
      repeat?: RepeatFrequency;
      /** Items to attach (set), none (null removes any), or undefined to leave them alone. */
      itemization?: ExpenseItemization | null;
    }) => {
      const id = await api.saveExpense(v.input);
      if (v.itemization !== undefined) await api.setExpenseItems(id, v.itemization);
      if (v.receipt) await api.uploadReceipt({ id, groupId: v.input.groupId }, v.receipt);
      if (v.repeat && !v.input.expenseId) {
        // Both calls are idempotent on the client id, so a retry after a failure here is safe.
        const { expenseId: _e, expectedVersion: _v, date, ...rest } = v.input;
        await api.createRecurring({ ...rest, frequency: v.repeat, startDate: date });
      }
      return id;
    },
    onSuccess: (id, v) => {
      if (v.repeat) qc.invalidateQueries({ queryKey: qk.recurring(v.input.groupId) });
      invalidateLedger(qc, v.input.groupId);
      qc.invalidateQueries({ queryKey: qk.expense(id) });
    },
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; groupId: string }) => api.deleteExpense(v.id),
    onSuccess: (_, v) => invalidateLedger(qc, v.groupId),
  });
}

export function useRecordSettlement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (i: RecordSettlementInput) => api.recordSettlement(i),
    onSuccess: (_, i) => invalidateLedger(qc, i.groupId),
  });
}

export function useRespondSettlement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; confirm: boolean; groupId: string }) => api.respondSettlement(v.id, v.confirm),
    onSuccess: (_, v) => invalidateLedger(qc, v.groupId),
  });
}

export function useSendReminder() {
  return useMutation({
    mutationFn: (v: { groupId: string; profileId: string }) => api.sendReminder(v.groupId, v.profileId),
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => api.markNotificationsRead(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });
}
