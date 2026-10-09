import * as SecureStore from 'expo-secure-store';

export const storage = {
  async setItem(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (err) {
      console.warn(`[storage] Error setting item ${key}:`, err);
    }
  },

  async getItem(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (err) {
      console.warn(`[storage] Error getting item ${key}:`, err);
      return null;
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (err) {
      console.warn(`[storage] Error deleting item ${key}:`, err);
    }
  },
};
