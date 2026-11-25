import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Directory, File, Paths } from 'expo-file-system';

// Apenas os tokens JWT ficam no SecureStore (Keystore/Keychain nativo com limite de 2 KB)
const SECURE_JWT_KEYS = new Set(['rm_token', 'rm_refresh_token']);
const STORAGE_DIR_NAME = 'rm_storage';

function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getStorageDirectory(): Directory {
  const dir = new Directory(Paths.document, STORAGE_DIR_NAME);
  if (!dir.exists) {
    dir.create({ idempotent: true, intermediates: true });
  }
  return dir;
}

function getStorageFile(key: string): File {
  const dir = getStorageDirectory();
  return new File(dir, `${sanitizeKey(key)}.txt`);
}

export const storage = {
  async setItem(key: string, value: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(key, value);
        }
        return;
      }

      if (SECURE_JWT_KEYS.has(key)) {
        await SecureStore.setItemAsync(key, value);
        return;
      }

      const file = getStorageFile(key);
      if (!file.exists) {
        file.create({ intermediates: true, overwrite: true });
      }
      file.write(value);
    } catch (err) {
      console.warn(`[storage] Error setting item ${key}:`, err);
    }
  },

  async getItem(key: string): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        if (typeof localStorage !== 'undefined') {
          return localStorage.getItem(key);
        }
        return null;
      }

      if (SECURE_JWT_KEYS.has(key)) {
        return await SecureStore.getItemAsync(key);
      }

      const file = getStorageFile(key);
      if (file.exists) {
        return await file.text();
      }

      // Migração transparente única caso a chave pequena existisse no SecureStore legado
      try {
        const legacyVal = await SecureStore.getItemAsync(key);
        if (legacyVal !== null) {
          file.create({ intermediates: true, overwrite: true });
          file.write(legacyVal);
          await SecureStore.deleteItemAsync(key).catch(() => {});
          return legacyVal;
        }
      } catch {}

      return null;
    } catch (err) {
      console.warn(`[storage] Error getting item ${key}:`, err);
      return null;
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(key);
        }
        return;
      }

      if (SECURE_JWT_KEYS.has(key)) {
        await SecureStore.deleteItemAsync(key);
        return;
      }

      const file = getStorageFile(key);
      if (file.exists) {
        file.delete();
      }
      // Garante limpeza de eventual resíduo legado no SecureStore
      await SecureStore.deleteItemAsync(key).catch(() => {});
    } catch (err) {
      console.warn(`[storage] Error deleting item ${key}:`, err);
    }
  },
};
