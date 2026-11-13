import { currencyExponent, type CurrencyCode } from './currency';
import type { Minor } from './minor';

/** Units of each currency per 1 USD, as decimal strings (e.g. { PKR: '276.622899', USD: '1' }). */
export type FxRates = Readonly<Record<string, string>>;

const SCALE = 10_000_000_000n; // 10 decimal places, the precision the rates are stored with

/** "276.622899" → 2766228990000n. Null for anything that isn't a positive decimal. */
function scaled(rate: string | undefined): bigint | null {
  const m = rate?.trim().match(/^(\d+)(?:\.(\d{1,10}))?$/);
  if (!m) return null;
  const v = BigInt(m[1]!) * SCALE + BigInt((m[2] ?? '').padEnd(10, '0'));
  return v > 0n ? v : null;
}

/**
 * Convert an amount between currencies at the given rates, in whole minor
 * units (rounded half away from zero). Exact integer maths, so the same input
 * always gives the same answer.
 *
 * This is for showing an approximate total only. Nothing converted is ever
 * stored or settled: balances stay in the currency they were created in.
 * Returns null when either currency has no rate.
 */
export function convertMinor(amount: Minor, from: CurrencyCode, to: CurrencyCode, rates: FxRates): Minor | null {
  if (!Number.isSafeInteger(amount)) return null;
  if (from === to) return amount;
  const rFrom = scaled(rates[from]);
  const rTo = scaled(rates[to]);
  if (rFrom === null || rTo === null) return null;

  // amount / 10^expFrom units of `from` → × rTo/rFrom units of `to` → × 10^expTo minor units
  const num = BigInt(Math.abs(amount)) * rTo * 10n ** BigInt(currencyExponent(to));
  const den = rFrom * 10n ** BigInt(currencyExponent(from));
  const rounded = (num * 2n + den) / (den * 2n); // round half up on the absolute value
  const out = Number(rounded);
  return Number.isSafeInteger(out) ? (amount < 0 ? -out : out) : null;
}

/**
 * Add up amounts in different currencies as one amount in `to`.
 * Returns null if any currency can't be converted, so the caller shows nothing
 * rather than a total with something silently left out.
 */
export function sumConverted(
  parts: readonly { amount: Minor; currency: CurrencyCode }[],
  to: CurrencyCode,
  rates: FxRates,
): Minor | null {
  let total = 0;
  for (const p of parts) {
    const c = convertMinor(p.amount, p.currency, to, rates);
    if (c === null) return null;
    total += c;
  }
  return total;
}
