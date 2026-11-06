import { isDemo } from '@/lib/config';

import type { AuthClient } from './types';

export type { AuthClient, AuthUser, SignInResult } from './types';

/** The active identity provider (Firebase in production, local fake in demo). */
export const authClient: AuthClient = isDemo
  ? (require('./demo-auth') as typeof import('./demo-auth')).demoAuthClient
  : (require('./firebase-auth') as typeof import('./firebase-auth')).firebaseAuthClient;
