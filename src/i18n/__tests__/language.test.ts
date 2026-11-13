import { I18nManager } from 'react-native';

import { currentLanguage, deviceLanguage, isRtl, t, useLanguage } from '../index';

const mockStore = new Map<string, string>();
jest.mock('@/lib/secure-storage', () => ({
  secureStorage: {
    getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  },
}));
let mockLocales = [{ languageCode: 'en' }];
jest.mock('expo-localization', () => ({ getLocales: () => mockLocales }));

describe('choosing a language', () => {
  beforeEach(() => {
    mockStore.clear();
    jest.spyOn(I18nManager, 'forceRTL').mockImplementation(() => undefined);
    jest.spyOn(I18nManager, 'allowRTL').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('switches the app’s text and remembers the choice', async () => {
    await useLanguage.getState().set('es');
    expect(currentLanguage()).toBe('es');
    expect(t('Add Expense')).toBe('Añadir gasto');
    expect(mockStore.get('evenly.language.v1')).toBe('es');

    await useLanguage.getState().set('en');
    expect(t('Add Expense')).toBe('Add Expense');
  });

  it('asks to reopen the app when the writing direction changes (Urdu, Arabic)', async () => {
    expect(await useLanguage.getState().set('ur')).toBe(true);
    expect(I18nManager.forceRTL).toHaveBeenLastCalledWith(true);
    expect(await useLanguage.getState().set('fr')).toBe(false);
    expect(I18nManager.forceRTL).toHaveBeenLastCalledWith(false);
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('hi')).toBe(false);
  });

  it('starts in the saved language, or the phone’s language the first time', async () => {
    mockLocales = [{ languageCode: 'tr' }];
    await useLanguage.getState().load();
    expect(currentLanguage()).toBe('tr');

    mockStore.set('evenly.language.v1', 'id');
    await useLanguage.getState().load();
    expect(currentLanguage()).toBe('id');
  });

  it('uses English when the phone’s language isn’t available', () => {
    mockLocales = [{ languageCode: 'sw' }, { languageCode: 'de' }];
    expect(deviceLanguage()).toBe('en');
    mockLocales = [{ languageCode: 'sw' }, { languageCode: 'hi' }];
    expect(deviceLanguage()).toBe('hi');
  });
});
