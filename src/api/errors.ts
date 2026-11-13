/**
 * Maps backend error codes (raised by the RPC layer) to user-facing copy.
 * Raw database/network messages are never shown to users.
 */
export type AppErrorCode =
  | 'not_authenticated'
  | 'not_member'
  | 'forbidden'
  | 'not_found'
  | 'invalid_input'
  | 'split_mismatch'
  | 'invalid_participant'
  | 'conflict'
  | 'group_archived'
  | 'balances_outstanding'
  | 'invite_invalid'
  | 'rate_limited'
  | 'plan_limit'
  | 'network'
  | 'unknown';

const MESSAGES: Record<AppErrorCode, string> = {
  not_authenticated: 'Your session expired. Please sign in again.',
  not_member: 'You’re no longer a member of this group.',
  forbidden: 'You don’t have permission to do that.',
  not_found: 'This item no longer exists.',
  invalid_input: 'Some details aren’t valid. Please check and try again.',
  split_mismatch: 'The split doesn’t add up to the total.',
  invalid_participant: 'Everyone in the split must be a member of the group.',
  conflict: 'Someone else changed this in the meantime. Refresh and try again.',
  group_archived: 'This group is archived. Restore it to make changes.',
  balances_outstanding: 'Settle all balances first.',
  invite_invalid: 'This invite link is invalid or has expired.',
  rate_limited: 'You’ve already sent a reminder recently.',
  plan_limit: 'You’ve reached the Free plan limit. Upgrade to Pro to keep going.',
  network: 'You appear to be offline. Check your connection and try again.',
  unknown: 'Something went wrong. Please try again.',
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly detail?: string;
  constructor(code: AppErrorCode, detail?: string) {
    super(MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
    this.detail = detail;
  }
}

const KNOWN = new Set(Object.keys(MESSAGES));

/** Normalise anything thrown by supabase-js / fetch into an AppError. */
export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  const err = e as { message?: string; code?: string; details?: string; name?: string } | null;
  const message = (err?.message ?? '').trim();
  if (KNOWN.has(message)) return new AppError(message as AppErrorCode, err?.details);
  if (err?.code === '42501' || /permission denied/i.test(message)) return new AppError('forbidden');
  if (err?.code === 'PGRST301' || /jwt|token/i.test(message)) return new AppError('not_authenticated');
  if (/network request failed|failed to fetch|network/i.test(message) || err?.name === 'TypeError')
    return new AppError('network');
  return new AppError('unknown', message || undefined);
}

export function errorMessage(e: unknown): string {
  return toAppError(e).message;
}
