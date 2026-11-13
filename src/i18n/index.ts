import { getLocales } from 'expo-localization';
import { I18nManager } from 'react-native';
import { create } from 'zustand';

import { secureStorage } from '@/lib/secure-storage';

import ar from './ar';
import es from './es';
import fr from './fr';
import hi from './hi';
import id from './id';
import tr from './tr';
import ur from './ur';

/**
 * Translations without a library.
 *
 * Text in the app is written as t('English text'); each language is a
 * dictionary from that English text to its translation. Anything missing falls
 * back to English, so a gap never shows a blank or a key. {name} placeholders
 * are filled from the second argument: t('Hi, {name}!', { name }).
 *
 * A test checks that every t('…') in the code has a translation in every
 * language, with the same placeholders.
 */

export type LanguageCode = 'en' | 'ur' | 'ar' | 'hi' | 'es' | 'fr' | 'tr' | 'id';

export interface Language {
  code: LanguageCode;
  /** The language's own name, so people can find it whatever the app is set to. */
  name: string;
  /** Written right to left. */
  rtl: boolean;
}

export const LANGUAGES: readonly Language[] = [
  { code: 'en', name: 'English', rtl: false },
  { code: 'ur', name: 'اردو', rtl: true },
  { code: 'ar', name: 'العربية', rtl: true },
  { code: 'hi', name: 'हिन्दी', rtl: false },
  { code: 'es', name: 'Español', rtl: false },
  { code: 'fr', name: 'Français', rtl: false },
  { code: 'tr', name: 'Türkçe', rtl: false },
  { code: 'id', name: 'Bahasa Indonesia', rtl: false },
];

export const DICTIONARIES: Record<LanguageCode, Readonly<Record<string, string>>> = {
  en: {},
  ur,
  ar,
  hi,
  es,
  fr,
  tr,
  id,
};

const SAVED_KEY = 'evenly.language.v1';

export const isLanguage = (v: unknown): v is LanguageCode => LANGUAGES.some((l) => l.code === v);

/** The phone's language if Evenly has it, otherwise English. */
export function deviceLanguage(): LanguageCode {
  try {
    for (const l of getLocales()) if (isLanguage(l.languageCode)) return l.languageCode;
  } catch {
    // no locale information: English
  }
  return 'en';
}

/** Translate `text` into `lang`, filling {placeholders}. Pure, for tests and previews. */
export function translate(lang: LanguageCode, text: string, params?: Record<string, string | number>): string {
  const out = DICTIONARIES[lang][text] ?? text;
  return params ? out.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : out;
}

let current: LanguageCode = deviceLanguage();

/** Translate into the language the app is set to. */
export function t(text: string, params?: Record<string, string | number>): string {
  return translate(current, text, params);
}

export const currentLanguage = () => current;
export const isRtl = (code: LanguageCode) => LANGUAGES.find((l) => l.code === code)?.rtl ?? false;

/** Make the layout direction match the language. It takes effect the next time the app opens. */
function applyDirection(code: LanguageCode): boolean {
  const rtl = isRtl(code);
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  return I18nManager.isRTL !== rtl; // true when the app has to be reopened to flip
}

interface LanguageState {
  code: LanguageCode;
  /** Read the saved choice (or the phone's language the first time). */
  load: () => Promise<void>;
  /** Change language. Returns true when the app must be reopened to flip the layout direction. */
  set: (code: LanguageCode) => Promise<boolean>;
}

export const useLanguage = create<LanguageState>((set) => ({
  code: current,
  load: async () => {
    const saved = await secureStorage.getItem(SAVED_KEY).catch(() => null);
    const code = isLanguage(saved) ? saved : deviceLanguage();
    current = code;
    applyDirection(code);
    set({ code });
  },
  set: async (code) => {
    current = code;
    set({ code });
    await secureStorage.setItem(SAVED_KEY, code).catch(() => undefined);
    return applyDirection(code);
  },
}));

/**
 * Marks text for translation where it's defined (lists and constants made at
 * load time). Returns it unchanged; translate it where it's shown with t(text).
 */
export const msg = (text: string) => text;
