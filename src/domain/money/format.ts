import { currencyExponent, type CurrencyCode } from './currency';
import { assertMinor, minorToDecimalString, type Minor } from './minor';

export const MINUS = '−';

export interface FormatOptions {
  locale?: string;
  /** "always" → +$1.00 / −$1.00, "negative" → −$1.00 only, "never" → $1.00 */
  sign?: 'always' | 'negative' | 'never';
  /** Drop ".00" when the amount is whole (e.g. "YOU LENT $135"). */
  trimZeroFraction?: boolean;
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function formatter(locale: string, currency: CurrencyCode, digits: number): Intl.NumberFormat {
  const key = `${locale}|${currency}|${digits}`;
  let f = formatterCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    formatterCache.set(key, f);
  }
  return f;
}

/**
 * Format integer minor units for display. The decimal string is built with
 * integer math, so Intl only handles symbols and grouping and the digits
 * never pass through a lossy float.
 */
export function formatMoney(minor: Minor, currency: CurrencyCode, opts: FormatOptions = {}): string {
  assertMinor(minor);
  const { locale = 'en-US', sign = 'negative', trimZeroFraction = false } = opts;
  const exp = currencyExponent(currency);
  const abs = Math.abs(minor);
  const digits = trimZeroFraction && abs % 10 ** exp === 0 ? 0 : exp;

  // Intl.NumberFormat.format accepts decimal strings (ES2023) and keeps them
  // exact; older engines coerce to number, which is exact for these magnitudes.
  const decimal = minorToDecimalString(abs, currency);
  let body: string;
  try {
    body = formatter(locale, currency, digits).format(decimal as unknown as number);
  } catch {
    body = `${currency} ${decimal}`;
  }

  if (minor === 0 || sign === 'never') return body;
  if (minor < 0) return MINUS + body;
  return sign === 'always' ? `+${body}` : body;
}

/** "$1,234.56" → stable symbol for a currency in a locale (e.g. for the amount input prefix). */
export function currencySymbol(currency: CurrencyCode, locale = 'en-US'): string {
  try {
    const parts = formatter(locale, currency, 0).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? currency;
  } catch {
    return currency;
  }
}
