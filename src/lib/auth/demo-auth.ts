import type { AuthClient, AuthUser } from './types';

/** Local fake identity for demo mode (no network, no native modules). */
const DEMO_USER: AuthUser = {
  uid: 'demo-vanessa',
  email: 'vanessa.clarke@gmail.com',
  displayName: 'Vanessa Clarke',
  photoURL: null,
};

let current: AuthUser | null = null;
const listeners = new Set<(u: AuthUser | null) => void>();
const emit = () => listeners.forEach((l) => l(current));

export const demoAuthClient: AuthClient = {
  onChange(listener) {
    listeners.add(listener);
    setTimeout(() => listener(current), 0);
    return () => listeners.delete(listener);
  },
  async signInWithGoogle() {
    await new Promise((r) => setTimeout(r, 450));
    current = DEMO_USER;
    emit();
    return { status: 'success', user: DEMO_USER };
  },
  async signOut() {
    current = null;
    emit();
  },
  async prepareSession() {
    // Nothing to prepare for the local demo identity.
  },
  async getIdToken() {
    return current ? 'demo-token' : null;
  },
  async deleteUser() {
    current = null;
    emit();
  },
};
