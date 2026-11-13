/**
 * Finds every string the app marks for translation: t('…') and msg('…') calls
 * with a literal first argument. Used by the translation coverage test.
 */
export function extractKeys(source: string): string[] {
  const keys: string[] = [];
  const re = /\b(?:t|msg)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
  for (const m of source.matchAll(re)) {
    const raw = m[1] ?? m[2] ?? '';
    keys.push(raw.replace(/\\(['"\\])/g, '$1'));
  }
  return keys;
}

/** The {placeholders} in a string, sorted, for comparing a translation with its source. */
export const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
