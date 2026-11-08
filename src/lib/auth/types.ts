export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export type SignInResult =
  | { status: 'success'; user: AuthUser }
  | { status: 'cancelled' }
  | { status: 'error'; reason: 'network' | 'play_services' | 'config' | 'unknown'; message?: string };

/**
 * Identity provider abstraction. Production: Firebase Auth + Google Sign-In.
 * Demo: a local fake user. Only this module knows which one is active.
 */
export interface AuthClient {
  /** Subscribe to sign-in state; fires once with the restored session. */
  onChange(listener: (user: AuthUser | null) => void): () => void;
  signInWithGoogle(): Promise<SignInResult>;
  signOut(): Promise<void>;
  /**
   * Make sure the signed-in user's token carries what the backend requires
   * (Firebase: the `role: "authenticated"` claim). Call before the first
   * backend request of a session; cheap when already satisfied.
   */
  prepareSession(): Promise<void>;
  /** Current Firebase ID token (refreshed automatically when near expiry). */
  getIdToken(forceRefresh?: boolean): Promise<string | null>;
  /** Delete the identity-provider account (after the app data was deleted). */
  deleteUser(): Promise<void>;
}
