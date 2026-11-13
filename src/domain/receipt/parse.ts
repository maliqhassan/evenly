import { currencyExponent, parseMinor, type CurrencyCode, type Minor } from '@/domain/money';

/** A line of text from the photo, with its box in pixels (null when unknown). */
export interface OcrLine {
  text: string;
  bounds: { x: number; y: number; width: number; height: number } | null;
}

export interface ReceiptItem {
  name: string;
  amount: Minor;
}

export type DateOrder = 'MDY' | 'DMY' | 'YMD';

export interface ParsedReceipt {
  merchant: string | null;
  /** YYYY-MM-DD */
  date: string | null;
  /** The amount to pay, in minor units of the receipt's currency. */
  total: Minor | null;
  /** True when there was no TOTAL line and the amount was worked out from the items. */
  totalIsGuess: boolean;
  items: ReceiptItem[];
  /** Tax, service charge, tip and similar lines added together. */
  extra: Minor;
  /** items + extra, when there are items. */
  itemsTotal: Minor;
  /** True when the items and extras add up exactly to the total. */
  itemsMatchTotal: boolean;
}

export interface ParseOptions {
  currency: CurrencyCode;
  /** How to read ambiguous numeric dates such as 03/04/2026. */
  dateOrder?: DateOrder;
  /** For rejecting dates that can't be right (default: now). */
  today?: Date;
}

/* ------------------------------------------------------------------ */
/* Rows: put a name and its price back together                        */
/* ------------------------------------------------------------------ */

/**
 * Receipts print "Burger ........ 12.50" as two pieces of text. Lines whose
 * vertical centres are close are one row, joined left to right.
 */
export function groupRows(lines: readonly OcrLine[]): string[] {
  const boxed = lines.filter((l) => l.bounds && l.text.trim());
  if (boxed.length === 0) return lines.map((l) => l.text.trim()).filter(Boolean);

  const heights = boxed.map((l) => l.bounds!.height).sort((a, b) => a - b);
  const tolerance = Math.max(4, heights[Math.floor(heights.length / 2)]! * 0.6);
  const centre = (l: OcrLine) => l.bounds!.y + l.bounds!.height / 2;

  const rows: { y: number; parts: OcrLine[] }[] = [];
  for (const line of [...boxed].sort((a, b) => centre(a) - centre(b))) {
    const row = rows.find((r) => Math.abs(r.y - centre(line)) <= tolerance);
    if (row) {
      row.parts.push(line);
      row.y = row.parts.reduce((s, p) => s + centre(p), 0) / row.parts.length;
    } else {
      rows.push({ y: centre(line), parts: [line] });
    }
  }
  return rows
    .sort((a, b) => a.y - b.y)
    .map((r) =>
      r.parts
        .sort((a, b) => a.bounds!.x - b.bounds!.x)
        .map((p) => p.text.trim())
        .join('  '),
    );
}

/* ------------------------------------------------------------------ */
/* Amounts                                                             */
/* ------------------------------------------------------------------ */

const MARKER = String.raw`(?:\b(?:rs|pkr|inr|usd|eur|gbp|aed|sar|cad|aud)\.?|[$€£₨])`;
// 1,250.00 or 12.50 (dot decimals)  |  1.250,00 or 12,50 (comma decimals)
const DECIMAL_AMOUNT = String.raw`(?<![\d.,-])(?:\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2}|\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})(?![\d])`;
// A whole amount, only trusted next to a currency marker: Rs 1,250
const MARKED_INTEGER = String.raw`${MARKER}\s*(\d{1,3}(?:,\d{3})+|\d+)(?![\d]|[.,]\d)`;
// Amounts without decimals (JPY and friends): the last number on a row.
const TRAILING_INTEGER = String.raw`(?<![\d.,-])(\d{1,3}(?:,\d{3})+|\d+)\s*$`;

interface Found {
  minor: Minor;
  index: number;
}

/** "1.250,00" → "1250.00", "1,250.00" → "1250.00" */
function toDecimalString(token: string): string {
  const sep = Math.max(token.lastIndexOf('.'), token.lastIndexOf(','));
  const whole = token.slice(0, sep).replace(/[.,]/g, '');
  return `${whole}.${token.slice(sep + 1)}`;
}

/** Money amounts on a row, left to right, in minor units of `currency`. */
export function findAmounts(row: string, currency: CurrencyCode): Found[] {
  const exp = currencyExponent(currency);
  // Rates ("17%"), dates ("12.11.2026") and times ("14:05") are not amounts. Blank them out
  // without shifting positions, so the rest of the row keeps its columns.
  const blank = (m: string) => ' '.repeat(m.length);
  const text = row
    .replace(/\d+(?:[.,]\d+)?\s*%/g, blank)
    .replace(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/g, blank)
    .replace(/\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m)?/gi, blank);
  const found: Found[] = [];

  if (exp === 0) {
    const whole = (s: string) => parseMinor(s.replace(/,/g, ''), currency);
    for (const m of text.matchAll(new RegExp(MARKED_INTEGER, 'gi'))) {
      const v = whole(m[1]!);
      if (v !== null) found.push({ minor: v, index: m.index! });
    }
    const t = text.match(new RegExp(TRAILING_INTEGER));
    if (t && !found.some((f) => f.index >= t.index!)) {
      const v = whole(t[1]!);
      if (v !== null) found.push({ minor: v, index: t.index! });
    }
    return found.sort((a, b) => a.index - b.index);
  }

  const taken: [number, number][] = [];
  for (const m of text.matchAll(new RegExp(DECIMAL_AMOUNT, 'g'))) {
    const v = parseMinor(toDecimalString(m[0]), currency);
    if (v !== null) {
      found.push({ minor: v, index: m.index! });
      taken.push([m.index!, m.index! + m[0].length]);
    }
  }
  for (const m of text.matchAll(new RegExp(MARKED_INTEGER, 'gi'))) {
    const start = m.index! + m[0].length - m[1]!.length;
    if (taken.some(([a, b]) => start >= a && start < b)) continue;
    const v = parseMinor(`${m[1]!.replace(/,/g, '')}.00`, currency);
    if (v !== null) found.push({ minor: v, index: m.index! });
  }
  return found.sort((a, b) => a.index - b.index);
}

/* ------------------------------------------------------------------ */
/* Row types                                                           */
/* ------------------------------------------------------------------ */

const SUBTOTAL = /\bsub\s*-?\s*total\b/i;
const NOT_A_TOTAL =
  /\btotal\s*(items?|qty|quantity|number|savings?|discount|tax|gst|vat|points?)\b|\bitems?\s*total\b|\bno\.?\s*of\b/i;
const STRONG_TOTAL =
  /\b(grand\s*total|amount\s*(due|payable)|balance\s*due|net\s*(total|amount|payable)|to\s*pay|bill\s*total|total\s*(due|payable|amount))\b/i;
const WEAK_TOTAL = /\b(total|payable)\b/i;
const EXTRA = /\b(tax|gst|vat|sst|hst|pst|service\s*(charge|fee)?|svc|tip|gratuity|delivery|packing|surcharge)\b/i;
/** "GST No: 123", "NTN # 456": registration numbers, not charges. */
const REGISTRATION = /\b(gst|vat|ntn|strn|tax)\s*(no|#|reg|id|number)\b/i;
const NOT_AN_ITEM =
  /\b(cash|change|card|visa|master\s*card|mastercard|amex|debit|credit|tender|paid|payment|balance|round(ing|ed)?|discount|saving|coupon|voucher|points?|tel|phone|ph\.|fax|invoice|receipt|order|table|server|cashier|thank|ntn|strn|gst\s*(no|#)|ref|auth|approval|change\s*due|qty|quantity|price|amount|description|item)\b/i;

const letters = (s: string) => (s.match(/[A-Za-z]/g) ?? []).length;

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = MONTHS.join('|');

function isoIfValid(y: number, m: number, d: number, today: Date): string | null {
  const year = y < 100 ? 2000 + y : y;
  const date = new Date(Date.UTC(year, m - 1, d));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  // A receipt is from the last year or so. Anything else is a misread.
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (date.getTime() > t + 86_400_000 || date.getTime() < t - 400 * 86_400_000) return null;
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function findDate(rows: readonly string[], order: DateOrder, today: Date): string | null {
  for (const row of rows) {
    let m = row.match(/(?<!\d)(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/);
    if (m) {
      const iso = isoIfValid(+m[1]!, +m[2]!, +m[3]!, today);
      if (iso) return iso;
    }
    m = row.match(/(?<!\d)(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/);
    if (m) {
      const a = +m[1]!;
      const b = +m[2]!;
      const y = +m[3]!;
      // A part above 12 can only be the day; otherwise use the user's order.
      const dayFirst = a > 12 ? true : b > 12 ? false : order !== 'MDY';
      const iso = dayFirst ? isoIfValid(y, b, a, today) : isoIfValid(y, a, b, today);
      if (iso) return iso;
    }
    m = row.match(new RegExp(`(?<!\\d)(\\d{1,2})\\s*(${MONTH_RE})[a-z]*\\.?,?\\s*(\\d{4}|\\d{2})(?!\\d)`, 'i'));
    if (m) {
      const iso = isoIfValid(+m[3]!, MONTHS.indexOf(m[2]!.toLowerCase()) + 1, +m[1]!, today);
      if (iso) return iso;
    }
    m = row.match(new RegExp(`\\b(${MONTH_RE})[a-z]*\\.?\\s*(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})(?!\\d)`, 'i'));
    if (m) {
      const iso = isoIfValid(+m[3]!, MONTHS.indexOf(m[1]!.toLowerCase()) + 1, +m[2]!, today);
      if (iso) return iso;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Merchant                                                            */
/* ------------------------------------------------------------------ */

const NOT_A_MERCHANT =
  /receipt|invoice|\bbill\b|\border\b|\btel\b|phone|www\.|http|@|\bntn\b|\bstrn\b|\bgst\b|cashier|\btable\b|\bdate\b|\btime\b|welcome|thank|customer|copy/i;

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

export function findMerchant(rows: readonly string[]): string | null {
  for (const raw of rows.slice(0, 6)) {
    const row = raw.replace(/\s+/g, ' ').trim();
    const digits = (row.match(/\d/g) ?? []).length;
    if (letters(row) < 3 || digits > row.length * 0.3 || NOT_A_MERCHANT.test(row)) continue;
    const name = row === row.toUpperCase() ? titleCase(row) : row;
    return name.slice(0, 60);
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* The receipt                                                         */
/* ------------------------------------------------------------------ */

/** Quantity prefixes and "@ unit price" tails are not part of an item's name. */
function cleanItemName(row: string, amountStart: number): string {
  return row
    .slice(0, amountStart)
    .replace(/@\s*[\d.,]+\s*$/, '')
    .replace(/^\s*\d+\s*(?:x|×)\s+/i, '')
    .replace(/^\s*\d+\s+(?=[A-Za-z])/, '')
    .replace(/[.\-_:·]{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function parseReceipt(lines: readonly OcrLine[], opts: ParseOptions): ParsedReceipt {
  const { currency, dateOrder = 'MDY', today = new Date() } = opts;
  const rows = groupRows(lines);

  let strongTotal: Minor | null = null;
  let weakTotal: Minor | null = null;
  let extra = 0;
  const items: ReceiptItem[] = [];
  let largest: Minor | null = null;

  for (const row of rows) {
    const amounts = findAmounts(row, currency);
    if (amounts.length === 0) continue;
    const last = amounts[amounts.length - 1]!;
    largest = Math.max(largest ?? 0, ...amounts.map((a) => a.minor));

    if (SUBTOTAL.test(row)) continue;
    if (!NOT_A_TOTAL.test(row) && STRONG_TOTAL.test(row))
      strongTotal = last.minor; // the last one wins
    else if (!NOT_A_TOTAL.test(row) && WEAK_TOTAL.test(row) && !EXTRA.test(row)) weakTotal = last.minor;
    else if (EXTRA.test(row)) {
      if (!REGISTRATION.test(row)) extra += last.minor;
    } else if (!NOT_AN_ITEM.test(row) && !NOT_A_TOTAL.test(row)) {
      const name = cleanItemName(row, last.index);
      if (letters(name) >= 2 && last.minor > 0) items.push({ name, amount: last.minor });
    }
  }

  const itemsSum = items.reduce((s, i) => s + i.amount, 0);
  let total = strongTotal ?? weakTotal;
  let totalIsGuess = false;
  if (total === null) {
    totalIsGuess = true;
    total = items.length > 0 ? itemsSum + extra : largest;
  }
  const itemsTotal = items.length > 0 ? itemsSum + extra : 0;

  return {
    merchant: findMerchant(rows),
    date: findDate(rows, dateOrder, today),
    total,
    totalIsGuess,
    items,
    extra,
    itemsTotal,
    itemsMatchTotal: items.length > 0 && total !== null && itemsTotal === total,
  };
}
