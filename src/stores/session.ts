import { create } from 'zustand';

import type { Me } from '@/api';

/**
 * Session lifecycle (drives the route guards in app/_layout.tsx):
 *   booting    → fonts loading / restoring the Firebase session
 *   signedOut  → Welcome / Sign in / Sign-in error
 *   onboarding → first sign-in: Complete profile → Preferences
 *   signedIn   → the app
 */
export type SessionStatus = 'booting' | 'signedOut' | 'onboarding' | 'signedIn';

interface SessionState {
  status: SessionStatus;
  me: Me | null;
  /** Set while the post-Google profile handshake runs (shows a spinner on Sign in). */
  authenticating: boolean;
  setSignedOut: () => void;
  setMe: (me: Me) => void;
  patchMe: (fn: (me: Me) => Me) => void;
  setAuthenticating: (v: boolean) => void;
}

export const useSession = create<SessionState>((set, get) => ({
  status: 'booting',
  me: null,
  authenticating: false,
  setSignedOut: () => set({ status: 'signedOut', me: null, authenticating: false }),
  setMe: (me) => set({ me, status: me.profile.onboarded ? 'signedIn' : 'onboarding', authenticating: false }),
  patchMe: (fn) => {
    const me = get().me;
    if (me) set({ me: fn(me) });
  },
  setAuthenticating: (authenticating) => set({ authenticating }),
}));

/** The signed-in profile id (throws if called outside the signed-in area). */
export function useMyId(): string {
  const id = useSession((s) => s.me?.profile.id);
  if (!id) throw new Error('useMyId called without a session');
  return id;
}
