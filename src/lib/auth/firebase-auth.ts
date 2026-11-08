import { getApp, getApps, initializeApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import {
  GoogleAuthProvider,
  initializeAuth,
  onIdTokenChanged,
  signInWithCredential,
  signOut as fbSignOut,
  type Auth,
  type Persistence,
  type User,
} from 'firebase/auth';

import { config } from '@/lib/config';
import { secureStorage } from '@/lib/secure-storage';

import type { AuthClient, AuthUser, SignInResult } from './types';

// `getReactNativePersistence` exists only in Firebase's React Native build
// (resolved by Metro), not in the web typings TypeScript sees.
const getReactNativePersistence = (
  FirebaseAuth as unknown as {
    getReactNativePersistence: (storage: typeof secureStorage) => Persistence;
  }
).getReactNativePersistence;

let auth: Auth | null = null;

function getAuthInstance(): Auth {
  if (auth) return auth;
  const live = config.live;
  if (!live) throw new Error('Firebase is not configured');
  const app = getApps().length
    ? getApp()
    : initializeApp({
        apiKey: live.firebaseApiKey,
        authDomain: live.firebaseAuthDomain,
        projectId: live.firebaseProjectId,
        appId: live.firebaseAppId,
      });
  auth = initializeAuth(app, { persistence: getReactNativePersistence(secureStorage) });
  return auth;
}

const toAuthUser = (u: User): AuthUser => ({
  uid: u.uid,
  email: u.email,
  displayName: u.displayName,
  photoURL: u.photoURL,
});

// Native module — loaded lazily so the JS bundle still boots in Expo Go / demo.
type GoogleSigninModule = typeof import('@react-native-google-signin/google-signin');
let google: GoogleSigninModule | null = null;
function getGoogle(): GoogleSigninModule {
  if (!google) {
    google = require('@react-native-google-signin/google-signin') as GoogleSigninModule;
    google.GoogleSignin.configure({
      webClientId: config.live!.googleWebClientId,
      iosClientId: config.live!.googleIosClientId || undefined,
      offlineAccess: false,
    });
  }
  return google;
}

export const firebaseAuthClient: AuthClient = {
  onChange(listener) {
    // onIdTokenChanged also fires on token refresh, so the Supabase client
    // always picks up a fresh token.
    return onIdTokenChanged(getAuthInstance(), (u) => listener(u ? toAuthUser(u) : null));
  },

  async signInWithGoogle(): Promise<SignInResult> {
    let g: GoogleSigninModule;
    try {
      g = getGoogle();
    } catch {
      return { status: 'error', reason: 'config', message: 'Google Sign-In needs a development build (not Expo Go).' };
    }
    const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } = g;
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) return { status: 'cancelled' };
      const idToken = response.data.idToken;
      if (!idToken)
        return {
          status: 'error',
          reason: 'config',
          message: 'Google did not return an ID token. Check the web client ID.',
        };

      const credential = GoogleAuthProvider.credential(idToken);
      const result = await signInWithCredential(getAuthInstance(), credential);
      // The `role` claim Supabase needs is added in prepareSession().
      return { status: 'success', user: toAuthUser(result.user) };
    } catch (e) {
      if (isErrorWithCode(e)) {
        if (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS)
          return { status: 'cancelled' };
        if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return { status: 'error', reason: 'play_services' };
      }
      const code = (e as { code?: string }).code ?? '';
      if (code === 'auth/network-request-failed') return { status: 'error', reason: 'network' };
      return { status: 'error', reason: 'unknown', message: (e as Error).message };
    }
  },

  async signOut() {
    try {
      await getGoogle().GoogleSignin.signOut();
    } catch {
      // Not signed in with the native SDK (or Expo Go) — ignore.
    }
    await fbSignOut(getAuthInstance());
  },

  async prepareSession() {
    const user = getAuthInstance().currentUser;
    if (!user) throw new Error('not signed in');
    const current = await user.getIdTokenResult();
    if (current.claims.role === 'authenticated') return;

    // First sign-in: ask the `firebase-role` Edge Function to add the claim to
    // this (verified) account, then refresh the token so it carries it.
    const live = config.live!;
    const res = await fetch(`${live.supabaseUrl}/functions/v1/firebase-role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: live.supabaseAnonKey },
      body: JSON.stringify({ idToken: current.token }),
    });
    if (!res.ok) throw new Error(`role claim setup failed (${res.status})`);
    const refreshed = await user.getIdTokenResult(true);
    if (refreshed.claims.role !== 'authenticated') throw new Error('role claim missing after refresh');
  },

  async getIdToken(forceRefresh = false) {
    const user = getAuthInstance().currentUser;
    return user ? user.getIdToken(forceRefresh) : null;
  },

  async deleteUser() {
    const user = getAuthInstance().currentUser;
    if (!user) return;
    try {
      await user.delete();
    } catch (e) {
      // Firebase requires a recent login to delete; re-authenticate with Google once.
      if ((e as { code?: string }).code === 'auth/requires-recent-login') {
        const { GoogleSignin, isSuccessResponse } = getGoogle();
        const response = await GoogleSignin.signIn();
        if (isSuccessResponse(response) && response.data.idToken) {
          await FirebaseAuth.reauthenticateWithCredential(user, GoogleAuthProvider.credential(response.data.idToken));
          await user.delete();
          return;
        }
      }
      throw e;
    } finally {
      try {
        await getGoogle().GoogleSignin.revokeAccess();
      } catch {
        // ignore
      }
    }
  },
};
