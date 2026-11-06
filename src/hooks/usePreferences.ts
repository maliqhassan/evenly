import type { DateFormatPref, NumberFormatPref } from '@/api';
import type { CurrencyCode } from '@/domain/money';
import { useSession } from '@/stores/session';

const LOCALE_BY_NUMBER_FORMAT: Record<NumberFormatPref, string> = {
  '1,234.56': 'en-US',
  '1.234,56': 'de-DE',
  '1 234,56': 'fr-FR',
};

export function localeFor(format: NumberFormatPref | undefined): string {
  return LOCALE_BY_NUMBER_FORMAT[format ?? '1,234.56'] ?? 'en-US';
}

/** Formatting preferences for the current user (safe to call when signed out). */
export function usePreferences(): { locale: string; dateFormat: DateFormatPref; currency: CurrencyCode } {
  const prefs = useSession((s) => s.me?.preferences);
  const currency = useSession((s) => s.me?.profile.defaultCurrency ?? 'USD');
  return { locale: localeFor(prefs?.numberFormat), dateFormat: prefs?.dateFormat ?? 'MM/DD/YYYY', currency };
}
