import { config } from '@/lib/config';

/**
 * Crash reporting (Sentry) and product analytics (PostHog). Both are no-ops
 * unless their keys are configured. Analytics never receives amounts,
 * descriptions or other financial details — only event names and coarse
 * properties.
 */
type SentryModule = typeof import('@sentry/react-native');
let sentry: SentryModule | null = null;
let posthog: {
  capture: (e: string, p?: Record<string, string | number | boolean>) => void;
  identify: (id: string) => void;
  reset: () => void;
} | null = null;

export function initMonitoring() {
  if (config.sentryDsn) {
    try {
      sentry = require('@sentry/react-native') as SentryModule;
      sentry.init({
        dsn: config.sentryDsn,
        tracesSampleRate: 0.2,
        sendDefaultPii: false,
        environment: __DEV__ ? 'development' : 'production',
        beforeSend(event) {
          // Strip request bodies — they may contain financial data.
          if (event.request) delete event.request.data;
          return event;
        },
      });
    } catch {
      sentry = null;
    }
  }
  if (config.posthogKey) {
    try {
      const { PostHog } = require('posthog-react-native') as typeof import('posthog-react-native');
      const client = new PostHog(config.posthogKey, { host: config.posthogHost, captureAppLifecycleEvents: true });
      posthog = {
        capture: (e, p) => void client.capture(e, p),
        identify: (id) => void client.identify(id),
        reset: () => void client.reset(),
      };
    } catch {
      posthog = null;
    }
  }
}

export function captureError(error: unknown, context?: Record<string, unknown>) {
  if (__DEV__) console.warn('[evenly]', error, context ?? '');
  sentry?.captureException(error, context ? { extra: context } : undefined);
}

/** Allowed analytics events — keep properties free of money and personal data. */
export type AnalyticsEvent =
  | 'sign_in_completed'
  | 'onboarding_completed'
  | 'group_created'
  | 'invite_link_shared'
  | 'invite_accepted'
  | 'expense_saved'
  | 'expense_deleted'
  | 'settlement_recorded'
  | 'reminder_sent';

export function track(event: AnalyticsEvent, props?: Record<string, string | number | boolean>) {
  posthog?.capture(event, props);
}

export function identifyUser(profileId: string) {
  posthog?.identify(profileId);
  sentry?.setUser({ id: profileId });
}

export function resetUser() {
  posthog?.reset();
  sentry?.setUser(null);
}

export const wrapRoot = <T>(component: T): T => (sentry ? (sentry.wrap(component as never) as T) : component);
