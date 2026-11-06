import * as SecureStore from 'expo-secure-store';

/**
 * AsyncStorage-compatible adapter over Expo SecureStore (Keychain / Keystore).
 * SecureStore values are limited to ~2 KB, and Firebase's persisted user
 * (tokens included) can be larger, so values are split into chunks.
 */
const CHUNK = 1800;
const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const k = safeKey(key);
    const countRaw = await SecureStore.getItemAsync(`${k}__n`);
    if (countRaw === null) return SecureStore.getItemAsync(k);
    const n = Number(countRaw);
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const part = await SecureStore.getItemAsync(`${k}__${i}`);
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    const k = safeKey(key);
    await secureStorage.removeItem(key);
    if (value.length <= CHUNK) {
      await SecureStore.setItemAsync(k, value);
      return;
    }
    const n = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < n; i++) {
      await SecureStore.setItemAsync(`${k}__${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    }
    await SecureStore.setItemAsync(`${k}__n`, String(n));
  },

  async removeItem(key: string): Promise<void> {
    const k = safeKey(key);
    const countRaw = await SecureStore.getItemAsync(`${k}__n`);
    if (countRaw !== null) {
      const n = Number(countRaw);
      for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(`${k}__${i}`);
      await SecureStore.deleteItemAsync(`${k}__n`);
    }
    await SecureStore.deleteItemAsync(k);
  },
};
