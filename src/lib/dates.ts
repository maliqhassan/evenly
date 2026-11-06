/**
 * Date helpers. Expense/settlement dates are calendar dates (YYYY-MM-DD) in
 * the user's local time — never converted through UTC, so "Nov 6" stays Nov 6.
 */

export type DateFormatPref = 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

export function todayISO(now = new Date()): string {
  return toISODate(now);
}

export function addDays(iso: string, days: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const monthShort = (iso: string) => MONTHS[fromISODate(iso).getMonth()]!;
export const monthLong = (iso: string) => MONTHS_LONG[fromISODate(iso).getMonth()]!;
export const dayOfMonth = (iso: string) => fromISODate(iso).getDate();

/** "Nov 6, 2026" */
export function formatDate(iso: string, pref: DateFormatPref = 'MM/DD/YYYY'): string {
  const d = fromISODate(iso);
  if (pref === 'DD/MM/YYYY') return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (pref === 'YYYY-MM-DD') return toISODate(d);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "Nov 6" / "6 Nov" */
export function formatShortDate(iso: string, pref: DateFormatPref = 'MM/DD/YYYY'): string {
  const d = fromISODate(iso);
  return pref === 'DD/MM/YYYY' ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "Today, Nov 6" · "Yesterday, Nov 5" · "Nov 3, 2025" (other years) · "Nov 3" */
export function formatRelativeDay(iso: string, pref: DateFormatPref = 'MM/DD/YYYY', now = new Date()): string {
  const today = todayISO(now);
  const short = formatShortDate(iso, pref);
  if (iso === today) return `Today, ${short}`;
  if (iso === addDays(today, -1)) return `Yesterday, ${short}`;
  return fromISODate(iso).getFullYear() === now.getFullYear() ? short : formatDate(iso, pref);
}

/** Section headers: "TODAY" · "YESTERDAY" · "NOV 3" */
export function dayHeader(iso: string, now = new Date()): string {
  const today = todayISO(now);
  if (iso === today) return 'TODAY';
  if (iso === addDays(today, -1)) return 'YESTERDAY';
  const d = fromISODate(iso);
  const base = `${MONTHS[d.getMonth()]!.toUpperCase()} ${d.getDate()}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base}, ${d.getFullYear()}`;
}

/** "NOVEMBER 2026" */
export function monthHeader(iso: string): string {
  const d = fromISODate(iso);
  return `${MONTHS_LONG[d.getMonth()]!.toUpperCase()} ${d.getFullYear()}`;
}

/** "5m ago" · "1h ago" · "Yesterday" · "Nov 3" for timestamps. */
export function timeAgo(timestamp: string, now = new Date()): string {
  const t = new Date(timestamp);
  const s = Math.max(0, (now.getTime() - t.getTime()) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400 && t.getDate() === now.getDate()) return `${Math.floor(s / 3600)}h ago`;
  const iso = toISODate(t);
  if (iso === addDays(todayISO(now), -1)) return 'Yesterday';
  return formatShortDate(iso);
}

/** "Today, 6:42 PM" for audit entries. */
export function formatTimestamp(timestamp: string, now = new Date()): string {
  const t = new Date(timestamp);
  const time = t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${formatRelativeDay(toISODate(t), 'MM/DD/YYYY', now).split(',')[0]}, ${time}`;
}

/** Local calendar date of a timestamp. */
export const isoDateOf = (timestamp: string) => toISODate(new Date(timestamp));

/** "since Jan 2026" */
export const sinceLabel = (timestamp: string) => {
  const d = new Date(timestamp);
  return `since ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
