/**
 * ISO 4217 currency metadata.
 *
 * The minor-unit exponent is hard-coded (not read from Intl) so that the
 * client and the database agree byte-for-byte on what "1 unit" means.
 */

export type CurrencyCode = string & { readonly __brand?: 'CurrencyCode' };

export interface CurrencyInfo {
  code: CurrencyCode;
  name: string;
  /** Number of decimal digits in the minor unit (USD → 2, JPY → 0, KWD → 3). */
  exponent: 0 | 2 | 3;
  symbol: string;
}

const C = (code: string, name: string, exponent: 0 | 2 | 3, symbol: string): CurrencyInfo => ({
  code,
  name,
  exponent,
  symbol,
});

/** Curated list shown in pickers. Any valid ISO code still works via `getCurrency`. */
export const CURRENCIES: readonly CurrencyInfo[] = [
  C('USD', 'US Dollar', 2, '$'),
  C('EUR', 'Euro', 2, '€'),
  C('GBP', 'British Pound', 2, '£'),
  C('CAD', 'Canadian Dollar', 2, 'CA$'),
  C('AUD', 'Australian Dollar', 2, 'A$'),
  C('NZD', 'New Zealand Dollar', 2, 'NZ$'),
  C('MXN', 'Mexican Peso', 2, 'MX$'),
  C('BRL', 'Brazilian Real', 2, 'R$'),
  C('CHF', 'Swiss Franc', 2, 'CHF'),
  C('SEK', 'Swedish Krona', 2, 'kr'),
  C('NOK', 'Norwegian Krone', 2, 'kr'),
  C('DKK', 'Danish Krone', 2, 'kr'),
  C('PLN', 'Polish Złoty', 2, 'zł'),
  C('INR', 'Indian Rupee', 2, '₹'),
  C('PKR', 'Pakistani Rupee', 2, 'Rs'),
  C('AED', 'UAE Dirham', 2, 'AED'),
  C('SAR', 'Saudi Riyal', 2, 'SAR'),
  C('SGD', 'Singapore Dollar', 2, 'S$'),
  C('HKD', 'Hong Kong Dollar', 2, 'HK$'),
  C('CNY', 'Chinese Yuan', 2, '¥'),
  C('ZAR', 'South African Rand', 2, 'R'),
  C('TRY', 'Turkish Lira', 2, '₺'),
  C('JPY', 'Japanese Yen', 0, '¥'),
  C('KRW', 'South Korean Won', 0, '₩'),
  C('VND', 'Vietnamese Dong', 0, '₫'),
  C('CLP', 'Chilean Peso', 0, 'CLP$'),
  C('ISK', 'Icelandic Króna', 0, 'kr'),
  C('KWD', 'Kuwaiti Dinar', 3, 'KD'),
  C('BHD', 'Bahraini Dinar', 3, 'BD'),
  C('OMR', 'Omani Rial', 3, 'OMR'),
  C('JOD', 'Jordanian Dinar', 3, 'JD'),
];

const ZERO_DECIMAL = new Set([
  'JPY',
  'KRW',
  'VND',
  'CLP',
  'ISK',
  'UGX',
  'XAF',
  'XOF',
  'PYG',
  'RWF',
  'KMF',
  'GNF',
  'VUV',
  'XPF',
  'DJF',
  'BIF',
]);
const THREE_DECIMAL = new Set(['KWD', 'BHD', 'OMR', 'JOD', 'TND', 'LYD', 'IQD']);

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export function isCurrencyCode(value: string): value is CurrencyCode {
  return /^[A-Z]{3}$/.test(value);
}

export function currencyExponent(code: CurrencyCode): 0 | 2 | 3 {
  if (ZERO_DECIMAL.has(code)) return 0;
  if (THREE_DECIMAL.has(code)) return 3;
  return 2;
}

export function getCurrency(code: CurrencyCode): CurrencyInfo {
  const known = BY_CODE.get(code);
  if (known) return known;
  if (!isCurrencyCode(code)) throw new RangeError(`Invalid ISO 4217 currency code: ${code}`);
  return { code, name: code, exponent: currencyExponent(code), symbol: code };
}

/** "USD — US Dollar" as used in pickers and preferences. */
export function currencyLabel(code: CurrencyCode): string {
  const c = getCurrency(code);
  return `${c.code} — ${c.name}`;
}
