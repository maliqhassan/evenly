import fs from 'node:fs';
import path from 'node:path';

import { DICTIONARIES, LANGUAGES, translate, type LanguageCode } from '../index';
import { extractKeys, placeholders } from '../keys';

/** Every string the app marks for translation, read from the source code. */
function usedKeys(): Set<string> {
  const keys = new Set<string>();
  const walk = (dir: string) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) {
        if (f.name !== '__tests__' && f.name !== 'i18n') walk(p);
      } else if (/\.tsx?$/.test(f.name)) {
        extractKeys(fs.readFileSync(p, 'utf8')).forEach((k) => keys.add(k));
      }
    }
  };
  walk(path.join(__dirname, '..', '..'));
  return keys;
}

const used = usedKeys();
const others = LANGUAGES.map((l) => l.code).filter((c): c is Exclude<LanguageCode, 'en'> => c !== 'en');

describe('translations', () => {
  it('finds the app’s text', () => {
    expect(used.size).toBeGreaterThan(300);
    expect(used.has('Add Expense')).toBe(true);
  });

  describe.each(others)('%s', (code) => {
    const dict = DICTIONARIES[code];

    it('translates every string the app uses', () => {
      const missing = [...used].filter((k) => !(k in dict));
      expect(missing).toEqual([]);
    });

    it('has no translations for text the app no longer uses (catches typos in keys)', () => {
      const stale = Object.keys(dict).filter((k) => !used.has(k));
      expect(stale).toEqual([]);
    });

    it('keeps every {placeholder} of the English text', () => {
      const broken = Object.entries(dict).filter(([en, tr]) => placeholders(en).join() !== placeholders(tr).join());
      expect(broken).toEqual([]);
    });

    it('never leaves a translation empty', () => {
      expect(Object.entries(dict).filter(([, v]) => !v.trim())).toEqual([]);
    });
  });
});

describe('translate', () => {
  it('fills placeholders and falls back to English for unknown text', () => {
    expect(translate('es', 'Hi, {name}!', { name: 'Sara' })).toBe('¡Hola, Sara!');
    expect(translate('es', 'Text nobody translated')).toBe('Text nobody translated');
    expect(translate('en', 'Hi, {name}!', { name: 'Sara' })).toBe('Hi, Sara!');
  });

  it('leaves a placeholder alone when no value is given', () => {
    expect(translate('en', 'Hi, {name}!')).toBe('Hi, {name}!');
  });
});
