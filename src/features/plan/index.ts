import { router } from 'expo-router';

import { toAppError } from '@/api';
import { usePlan } from '@/queries';

/** Why the pricing screen was opened; it explains the reason at the top. */
export type PricingReason = 'groups' | 'expenses' | 'scan' | 'items' | 'fx' | 'csv' | 'offer';

export function openPricing(reason?: PricingReason) {
  router.push({ pathname: '/pricing', params: reason ? { reason } : {} });
}

/** True once the plan has loaded and it's Pro. */
export function useIsPro(): boolean {
  return usePlan().data?.plan === 'pro';
}

/**
 * If `e` is the server saying a Free limit was reached, open the pricing screen
 * and return true; otherwise return false so the caller shows its usual error.
 */
export function handlePlanLimit(e: unknown): boolean {
  const err = toAppError(e);
  if (err.code !== 'plan_limit') return false;
  openPricing(err.detail === 'groups' ? 'groups' : 'expenses');
  return true;
}

/** Prices shown while testing. Real prices will come from Google Play. */
export const PRO_PRICES = {
  currency: 'PKR',
  monthly: 29900,
  yearly: 199900,
} as const;
