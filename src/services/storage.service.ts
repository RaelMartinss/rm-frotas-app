import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Directory, File, Paths } from 'expo-file-system';

// Apenas os tokens JWT ficam no SecureStore (Keystore/Keychain nativo com limite de 2 KB)
const SECURE_JWT_KEYS = new Set(['rm_token', 'rm_refresh_token']);
const STORAGE_DIR_NAME = 'rm_storage';

// Cache write-through em memória RAM: elimina I/O repetido de disco e decriptação no Keystore a cada request
const memoryCache = new Map<string, string | null>();
const inflightReads = new Map<string, Promise<string | null>>();
let cachedDir: Directory | null = null;

function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getStorageDirectory(): Directory {
  if (cachedDir) return cachedDir;
  const dir = new Directory(Paths.document, STORAGE_DIR_NAME);
  if (!dir.exists) {
    dir.create({ idempotent: true, intermediates: true });
  }
  cachedDir = dir;
  return dir;
}

function getStorageFile(key: string): File {
  const dir = getStorageDirectory();
  return new File(dir, `${sanitizeKey(key)}.txt`);
}

export const storage = {
  /**
   * Retorna instantaneamente da RAM caso a chave já tenha sido carregada nesta sessão (`undefined` se ainda não lida)
   */
  peekMemory(key: string): string | null | undefined {
    return memoryCache.get(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    memoryCache.set(key, value);
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
    if (memoryCache.has(key)) {
      return memoryCache.get(key) ?? null;
    }

    const pending = inflightReads.get(key);
    if (pending) {
      return pending;
    }

    const readPromise = (async (): Promise<string | null> => {
      try {
        if (Platform.OS === 'web') {
          const val = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
          memoryCache.set(key, val);
          return val;
        }

        if (SECURE_JWT_KEYS.has(key)) {
          const val = await SecureStore.getItemAsync(key);
          memoryCache.set(key, val);
          return val;
        }

        const file = getStorageFile(key);
        if (file.exists) {
          const text = await file.text();
          memoryCache.set(key, text);
          return text;
        }

        // Migração transparente única caso a chave pequena existisse no SecureStore legado
        try {
          const legacyVal = await SecureStore.getItemAsync(key);
          if (legacyVal !== null) {
            file.create({ intermediates: true, overwrite: true });
            file.write(legacyVal);
            await SecureStore.deleteItemAsync(key).catch(() => {});
            memoryCache.set(key, legacyVal);
            return legacyVal;
          }
        } catch {}

        // Cacheia também `null` em memória para nunca repetir leituras de disco/SecureStore em chaves ausentes
        memoryCache.set(key, null);
        return null;
      } catch (err) {
        console.warn(`[storage] Error getting item ${key}:`, err);
        return null;
      } finally {
        inflightReads.delete(key);
      }
    })();

    inflightReads.set(key, readPromise);
    return readPromise;
  },

  async removeItem(key: string): Promise<void> {
    memoryCache.set(key, null);
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
      await SecureStore.deleteItemAsync(key).catch(() => {});
    } catch (err) {
      console.warn(`[storage] Error deleting item ${key}:`, err);
    }
  },
};
