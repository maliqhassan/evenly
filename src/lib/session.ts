import { router } from 'expo-router';

import { api, toAppError, type Me } from '@/api';
import { authClient, type AuthUser } from '@/lib/auth';
import { isDemo } from '@/lib/config';
import { captureError, identifyUser, resetUser, track } from '@/lib/monitoring';
import { clearCache, restoreCache, startPersisting, useConnectivity } from '@/lib/offline';
import { unregisterPush } from '@/lib/push';
import { queryClient } from '@/lib/query-client';
import { secureStorage } from '@/lib/secure-storage';
import { useSession } from '@/stores/session';

let lastUid: string | null = null;
let lastUser: AuthUser | null = null;
let stopPersisting: (() => void) | null = null;

const meKey = (uid: string) => `evenly.me.v1.${uid}`;

async function enter(me: Me) {
  await restoreCache(me.profile.id);
  stopPersisting?.();
  stopPersisting = startPersisting(me.profile.id);
  useSession.getState().setMe(me);
  identifyUser(me.profile.id);
}

async function handshake(user: AuthUser) {
  const s = useSession.getState();
  s.setAuthenticating(true);
  try {
    // Creates the profile on first sign-in; returns the existing one otherwise.
    const { me } = await api.ensureProfile({ fullName: user.displayName, avatarUrl: user.photoURL });
    if (!isDemo) void secureStorage.setItem(meKey(user.uid), JSON.stringify(me)).catch(() => undefined);
    await enter(me);
    track('sign_in_completed');
  } catch (e) {
    const code = toAppError(e).code;
    // Offline with a valid session: open from the last known profile and cache.
    if (code === 'network' && !isDemo) {
      const cached = await secureStorage.getItem(meKey(user.uid)).catch(() => null);
      if (cached) {
        const me = JSON.parse(cached) as Me;
        if (me.profile.onboarded) {
          useConnectivity.getState().set(true);
          await enter(me);
          return;
        }
      }
    }
    captureError(e, { where: 'ensureProfile' });
    lastUid = null;
    s.setSignedOut();
    router.replace({ pathname: '/sign-in-error', params: { reason: code === 'network' ? 'network' : 'server' } });
  }
}

/**
 * Wire the identity provider to the app session. `onChange` also fires on
 * hourly token refreshes; the profile handshake only runs when the signed-in
 * user actually changes.
 */
export function startSessionListener(): () => void {
  return authClient.onChange((user) => {
    lastUser = user;
    if (!user) {
      lastUid = null;
      stopPersisting?.();
      stopPersisting = null;
      queryClient.clear();
      resetUser();
      useSession.getState().setSignedOut();
      return;
    }
    if (user.uid === lastUid) return;
    lastUid = user.uid;
    void handshake(user);
  });
}

/** Retry the profile handshake for a restored session (e.g. after being offline). */
export async function retrySession() {
  if (lastUser) {
    lastUid = lastUser.uid;
    await handshake(lastUser);
  }
}

export async function signOut() {
  await unregisterPush();
  await authClient.signOut();
}

/** After the server deleted the account: wipe local data, then the identity. */
export async function forgetLocalData(profileId: string) {
  stopPersisting?.();
  stopPersisting = null;
  await clearCache(profileId);
  if (lastUser) await secureStorage.removeItem(meKey(lastUser.uid)).catch(() => undefined);
  queryClient.clear();
}
