import { create } from 'zustand';

import { secureStorage } from '@/lib/secure-storage';

const SEEN_KEY = 'evenly.intro.seen.v1';

interface IntroState {
  /** null until read from storage at launch. */
  seen: boolean | null;
  load: () => Promise<void>;
  /** The feature tour is shown once per install; call when it's finished or skipped. */
  markSeen: () => void;
}

export const useIntro = create<IntroState>((set) => ({
  seen: null,
  load: async () => {
    const v = await secureStorage.getItem(SEEN_KEY).catch(() => null);
    set({ seen: v === '1' });
  },
  markSeen: () => {
    set({ seen: true });
    void secureStorage.setItem(SEEN_KEY, '1').catch(() => undefined);
  },
}));
