import { z } from 'zod';

/**
 * Public, client-side configuration (EXPO_PUBLIC_* vars are inlined into the
 * bundle at build time — never put secrets here: no service-role keys, no
 * Firebase service accounts).
 */
const raw = {
  demoMode: process.env.EXPO_PUBLIC_DEMO_MODE,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  firebaseApiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  firebaseAuthDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  firebaseProjectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  firebaseAppId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  inviteBaseUrl: process.env.EXPO_PUBLIC_INVITE_BASE_URL,
  supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL,
  privacyUrl: process.env.EXPO_PUBLIC_PRIVACY_URL,
  termsUrl: process.env.EXPO_PUBLIC_TERMS_URL,
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY,
  posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST,
};

const nonEmpty = z.string().trim().min(1);

const liveSchema = z.object({
  supabaseUrl: z.url(),
  supabaseAnonKey: nonEmpty,
  firebaseApiKey: nonEmpty,
  firebaseAuthDomain: nonEmpty,
  firebaseProjectId: nonEmpty,
  firebaseAppId: nonEmpty,
  googleWebClientId: nonEmpty,
  googleIosClientId: z.string().optional(),
});

export const isDemo = raw.demoMode === 'true' || raw.demoMode === '1';

const live = liveSchema.safeParse(raw);

/** Names of env vars that are missing/invalid in live mode (shown on the config screen in dev). */
export const configErrors: string[] = isDemo
  ? []
  : live.success
    ? []
    : live.error.issues.map((i) => {
        const key = String(i.path[0]);
        return 'EXPO_PUBLIC_' + key.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase();
      });

export const config = {
  isDemo,
  live: live.success ? live.data : null,
  inviteBaseUrl: (raw.inviteBaseUrl || 'https://evenly.app/j').replace(/\/$/, ''),
  supportEmail: raw.supportEmail || 'support@evenly.app',
  privacyUrl: raw.privacyUrl || 'https://evenly.app/privacy',
  termsUrl: raw.termsUrl || 'https://evenly.app/terms',
  sentryDsn: raw.sentryDsn || null,
  posthogKey: raw.posthogKey || null,
  posthogHost: raw.posthogHost || 'https://us.i.posthog.com',
} as const;

export function inviteUrl(code: string): string {
  return `${config.inviteBaseUrl}/${code}`;
}

/** Accepts a full invite URL, an evenly:// deep link, or a bare code. */
export function parseInviteCode(input: string): string | null {
  const m = input.trim().match(/(?:\/j\/|join\/)?([a-z0-9]{10,32})\/?$/i);
  return m ? m[1]!.toLowerCase() : null;
}
