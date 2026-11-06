import { dehydrate, hydrate, type DehydratedState, type Query } from '@tanstack/react-query';
import { create } from 'zustand';

import { toAppError } from '@/api/errors';
import { isDemo } from '@/lib/config';
import { queryClient } from '@/lib/query-client';

/**
 * Offline support (FR-092, phase 1): the read cache is persisted to Expo
 * SQLite per user, so groups, balances and recent activity open instantly
 * and stay readable without a connection. Writes still go to the server; a
 * failed write keeps the user's draft and is safe to retry because every
 * financial mutation is idempotent on its client UUID.
 */
const PERSISTED_ROOTS = new Set([
  'groups',
  'balances',
  'friends',
  'notifications',
  'group',
  'categories',
  'activity',
  'expense',
]);
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const keyFor = (profileId: string) => `evenly.cache.v1.${profileId}`;

type KV = {
  getItem(k: string): Promise<string | null>;
  setItem(k: string, v: string): Promise<void>;
  removeItem(k: string): Promise<void>;
};
let kv: KV | null = null;
function storage(): KV | null {
  if (kv || isDemo) return kv;
  try {
    kv = (require('expo-sqlite/kv-store') as { default: KV }).default;
  } catch {
    kv = null;
  }
  return kv;
}

const shouldPersist = (q: Query) => q.state.status === 'success' && PERSISTED_ROOTS.has(String(q.queryKey[0]));

/** Load the cached snapshot for a user (call right after sign-in). */
export async function restoreCache(profileId: string): Promise<void> {
  const s = storage();
  if (!s) return;
  try {
    const raw = await s.getItem(keyFor(profileId));
    if (!raw) return;
    const { savedAt, state } = JSON.parse(raw) as { savedAt: number; state: DehydratedState };
    if (Date.now() - savedAt > MAX_AGE_MS) return;
    hydrate(queryClient, state);
  } catch {
    // A corrupt cache is never fatal — it is simply rebuilt.
  }
}

let unsubscribe: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Persist the cache (throttled) while this user is signed in. */
export function startPersisting(profileId: string): () => void {
  const s = storage();
  if (!s) return () => undefined;
  unsubscribe?.();
  const save = () => {
    timer = null;
    const state = dehydrate(queryClient, { shouldDehydrateQuery: shouldPersist });
    void s.setItem(keyFor(profileId), JSON.stringify({ savedAt: Date.now(), state })).catch(() => undefined);
  };
  unsubscribe = queryClient.getQueryCache().subscribe((e) => {
    if (e.type !== 'updated' || e.action.type !== 'success') return;
    if (!timer) timer = setTimeout(save, 1500);
  });
  return () => {
    unsubscribe?.();
    unsubscribe = null;
    if (timer) clearTimeout(timer);
  };
}

export async function clearCache(profileId: string): Promise<void> {
  await storage()
    ?.removeItem(keyFor(profileId))
    .catch(() => undefined);
}

/* ------------------------------ connectivity ----------------------------- */

/** Derived from request outcomes (no extra native dependency). */
export const useConnectivity = create<{ offline: boolean; set: (offline: boolean) => void }>((set) => ({
  offline: false,
  set: (offline) => set({ offline }),
}));

queryClient.getQueryCache().subscribe((e) => {
  if (e.type !== 'updated') return;
  if (e.action.type === 'success') {
    if (useConnectivity.getState().offline) useConnectivity.getState().set(false);
  } else if (e.action.type === 'error' && toAppError(e.action.error).code === 'network') {
    useConnectivity.getState().set(true);
  }
});
