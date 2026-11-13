import { currencyExponent, parseMinor, type CurrencyCode, type Minor } from '@/domain/money';

/* ------------------------------------------------------------------ */
/* Reading the file                                                    */
/* ------------------------------------------------------------------ */

/** The separator a CSV uses: comma, semicolon (common in Europe) or tab. */
export function detectDelimiter(text: string): ',' | ';' | '\t' {
  const firstLine = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? '';
  const count = (d: string) => {
    let n = 0;
    let quoted = false;
    for (const ch of firstLine) {
      if (ch === '"') quoted = !quoted;
      else if (ch === d && !quoted) n++;
    }
    return n;
  };
  const counts = [',', ';', '\t'].map((d) => [d, count(d)] as const).sort((a, b) => b[1] - a[1]);
  return counts[0]![1] > 0 ? (counts[0]![0] as ',' | ';' | '\t') : ',';
}

/** RFC 4180 CSV: quoted fields, "" for a quote, line breaks inside quotes, CRLF or LF. Skips blank lines. */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

/* ------------------------------------------------------------------ */
/* Values                                                              */
/* ------------------------------------------------------------------ */

/**
 * A money value from a spreadsheet, signed, in minor units:
 * "-1,234.50", "1.234,50", "(12.00)", "12.00-", "Rs 1,850", "$45". Null if it isn't one.
 */
export function parseCsvAmount(value: string, currency: CurrencyCode): Minor | null {
  let s = value.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[A-Za-z$€£₨¥₹\s]/g, '').replace(/[ ']/g, '');
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.endsWith('-')) {
    negative = !negative;
    s = s.slice(0, -1);
  } else if (s.startsWith('+')) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let whole: string;
  let frac = '';
  if (lastDot >= 0 && lastComma >= 0) {
    // Both used: whichever comes last is the decimal separator.
    const sep = Math.max(lastDot, lastComma);
    whole = s.slice(0, sep).replace(/[.,]/g, '');
    frac = s.slice(sep + 1);
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = Math.max(lastComma, lastDot);
    const tail = s.slice(sep + 1);
    const groups = s.split(s[sep]!);
    // "1,250" / "1.250.000": every group after the first has 3 digits → thousands separators.
    if (tail.length === 3 && groups.slice(1).every((g) => g.length === 3)) {
      whole = s.replace(/[.,]/g, '');
    } else {
      whole = s.slice(0, sep).replace(/[.,]/g, '');
      frac = tail;
    }
  } else whole = s;

  if (!/^\d+$/.test(whole || '0') || !/^\d*$/.test(frac)) return null;
  const exp = currencyExponent(currency);
  if (frac.length > exp) {
    // More decimals than the currency has: only fine if they're zeros ("1250.00" in yen).
    if (/^0+$/.test(frac.slice(exp))) frac = frac.slice(0, exp);
    else return null;
  }
  const minor = parseMinor(frac ? `${whole || '0'}.${frac}` : whole || '0', currency);
  return minor === null ? null : negative ? -minor : minor;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function iso(y: number, m: number, d: number, today: Date): string | null {
  const year = y < 100 ? 2000 + y : y;
  const date = new Date(Date.UTC(year, m - 1, d));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (year < 2000 || date.getTime() > Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + 1)) return null;
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** A date from a spreadsheet cell, as YYYY-MM-DD. `order` settles 03/04/2026. */
export function parseCsvDate(value: string, order: 'MDY' | 'DMY', today = new Date()): string | null {
  const s = value.trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!, today);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?:\s.*)?$/);
  if (m) {
    const a = +m[1]!;
    const b = +m[2]!;
    const dayFirst = a > 12 ? true : b > 12 ? false : order === 'DMY';
    return dayFirst ? iso(+m[3]!, b, a, today) : iso(+m[3]!, a, b, today);
  }
  m = s.match(/^(\d{1,2})[-\s/.]([A-Za-z]{3,})[-\s/.,]+(\d{4}|\d{2})$/);
  if (m) {
    const mi = MONTHS.indexOf(m[2]!.slice(0, 3).toLowerCase());
    return mi >= 0 ? iso(+m[3]!, mi + 1, +m[1]!, today) : null;
  }
  m = s.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const mi = MONTHS.indexOf(m[1]!.slice(0, 3).toLowerCase());
    return mi >= 0 ? iso(+m[3]!, mi + 1, +m[2]!, today) : null;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Columns                                                             */
/* ------------------------------------------------------------------ */

export interface ColumnMap {
  date: number | null;
  description: number | null;
  /** One signed amount column… */
  amount: number | null;
  /** …or separate money-out / money-in columns (bank statements). */
  debit: number | null;
  credit: number | null;
  currency: number | null;
}

const RULES: [keyof ColumnMap, RegExp][] = [
  ['date', /\b(date|posted|posting|booking|value date|transaction date|time)\b/i],
  ['debit', /\b(debit|withdrawals?|paid out|money out|outflow|dr)\b/i],
  ['credit', /\b(credit|deposits?|paid in|money in|inflow|cr)\b/i],
  ['currency', /\b(currency|ccy|cur)\b/i],
  ['amount', /\b(amount|value|sum|total|price|cost)\b/i],
  [
    'description',
    /\b(description|details?|narrative|merchant|payee|memo|name|particulars|remarks|reference|item|title|note)\b/i,
  ],
];

/** Guess which column is which from the header row. Balance columns are never used. */
export function guessColumns(header: readonly string[]): ColumnMap {
  const map: ColumnMap = { date: null, description: null, amount: null, debit: null, credit: null, currency: null };
  header.forEach((raw, i) => {
    const h = raw.trim();
    if (!h || /\bbalance\b/i.test(h)) return;
    for (const [key, re] of RULES) {
      if (map[key] === null && re.test(h)) {
        map[key] = i;
        return;
      }
    }
  });
  return map;
}

/* ------------------------------------------------------------------ */
/* Rows to import                                                      */
/* ------------------------------------------------------------------ */

export type SkipReason = 'no_amount' | 'not_spending' | 'no_date' | 'other_currency';

export interface ImportRow {
  /** Row number in the file (1 = first data row), for the preview. */
  line: number;
  date: string | null;
  description: string;
  /** Always positive: the amount spent. */
  amount: Minor;
  skip: SkipReason | null;
}

export interface BuildOptions {
  currency: CurrencyCode;
  dateOrder: 'MDY' | 'DMY';
  /** With a single amount column: are expenses negative (bank exports) or positive (spreadsheets)? */
  spending: 'negative' | 'positive';
  today?: Date;
}

/** Turn data rows into expenses, marking the ones that can't or shouldn't be imported and why. */
export function buildImportRows(rows: readonly string[][], map: ColumnMap, opts: BuildOptions): ImportRow[] {
  const cell = (r: readonly string[], i: number | null) => (i === null ? '' : (r[i] ?? '').trim());
  return rows.map((r, n) => {
    const description = cell(r, map.description).replace(/\s+/g, ' ').slice(0, 120) || 'Imported expense';
    const date = map.date === null ? null : parseCsvDate(cell(r, map.date), opts.dateOrder, opts.today);
    const base = { line: n + 1, date, description };

    const cur = cell(r, map.currency).toUpperCase();
    if (cur && /^[A-Z]{3}$/.test(cur) && cur !== opts.currency)
      return { ...base, amount: 0, skip: 'other_currency' as const };

    let amount: Minor | null;
    if (map.debit !== null || map.credit !== null) {
      const out = parseCsvAmount(cell(r, map.debit), opts.currency);
      // Money in (a credit) isn't an expense.
      amount =
        out === null || out === 0 ? (parseCsvAmount(cell(r, map.credit), opts.currency) ? -1 : null) : Math.abs(out);
    } else {
      const v = parseCsvAmount(cell(r, map.amount), opts.currency);
      amount = v === null ? null : opts.spending === 'negative' ? -v : v;
    }
    if (amount === null || amount === 0) return { ...base, amount: 0, skip: 'no_amount' as const };
    if (amount < 0) return { ...base, amount: 0, skip: 'not_spending' as const };
    if (map.date !== null && !date) return { ...base, amount, skip: 'no_date' as const };
    return { ...base, amount, skip: null };
  });
}

/** Whether the first row is a header (it has no amount-looking cell that parses). */
export function looksLikeHeader(row: readonly string[], currency: CurrencyCode): boolean {
  return !row.some((c) => /\d/.test(c) && parseCsvAmount(c, currency) !== null && !/[A-Za-z]{3}/.test(c));
}
