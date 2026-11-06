import { isDemo } from '@/lib/config';

import type { Api } from './types';

export * from './errors';
export type * from './types';

/** The active backend: Supabase in production, in-memory demo otherwise. */
export const api: Api = isDemo
  ? (require('./demo') as typeof import('./demo')).demoApi
  : (require('./supabase') as typeof import('./supabase')).supabaseApi;
