import { currencyExponent, type CurrencyCode } from './currency';

/**
 * Money is always an integer count of minor units (cents, yen, fils…).
 * `number` is exact for integers up to 2^53 (≈ 90 trillion USD in cents),
 * and every entry point asserts that. Multiplications that could overflow
 * that range are done in BigInt (see split.ts).
 */
export type Minor = number;

export const MAX_MINOR = Number.MAX_SAFE_INTEGER;

export function assertMinor(value: number, label = 'amount'): asserts value is Minor {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer of minor units, got ${value}`);
  }
}

export function sumMinor(values: readonly Minor[]): Minor {
  let total = 0;
  for (const v of values) {
    assertMinor(v);
    total += v;
  }
  assertMinor(total, 'sum');
  return total;
}

/**
 * Parse what a user typed ("1,234.5", "120", ".75") into minor units.
 * Returns null for anything that is not a valid non-negative amount for the
 * currency (e.g. too many decimals, letters, empty input).
 */
export function parseMinor(input: string, currency: CurrencyCode): Minor | null {
  const exp = currencyExponent(currency);
  const cleaned = input.replace(/[\s,_]/g, '');
  if (cleaned === '' || cleaned === '.') return null;
  const re = exp === 0 ? /^\d+$/ : new RegExp(`^(\\d*)(?:\\.(\\d{0,${exp}}))?$`);
  const m = cleaned.match(re);
  if (!m) return null;
  const whole = exp === 0 ? cleaned : (m[1] ?? '');
  const frac = exp === 0 ? '' : (m[2] ?? '');
  const digits = (whole === '' ? '0' : whole) + frac.padEnd(exp, '0');
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : null;
}

/** 12050 USD → "120.50" (no symbol, no grouping). Used to seed text inputs. */
export function minorToDecimalString(minor: Minor, currency: CurrencyCode): string {
  assertMinor(minor);
  const exp = currencyExponent(currency);
  const neg = minor < 0;
  const abs = Math.abs(minor).toString();
  if (exp === 0) return (neg ? '-' : '') + abs;
  const padded = abs.padStart(exp + 1, '0');
  const whole = padded.slice(0, -exp);
  const frac = padded.slice(-exp);
  return `${neg ? '-' : ''}${whole}.${frac}`;
}

/** Major-unit float for display/charting only. Never feed this back into money math. */
export function minorToMajorForDisplay(minor: Minor, currency: CurrencyCode): number {
  return minor / 10 ** currencyExponent(currency);
}
