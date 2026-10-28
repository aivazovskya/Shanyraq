import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const memoryStore = new Map<string, string>();

function getLocalStorage(): Storage | null {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

async function isSecureStoreAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export const SafeStorage = {
  async getItem(key: string): Promise<string | null> {
    const ls = getLocalStorage();
    if (ls) {
      try {
        return ls.getItem(key);
      } catch {
        return memoryStore.get(key) || null;
      }
    }
    try {
      if (await isSecureStoreAvailable()) {
        return await SecureStore.getItemAsync(key);
      }
    } catch {
      // fallback to memory
    }
    return memoryStore.get(key) || null;
  },

  async setItem(key: string, value: string): Promise<void> {
    memoryStore.set(key, value);
    const ls = getLocalStorage();
    if (ls) {
      try {
        ls.setItem(key, value);
      } catch (e) {
        console.warn('localStorage setItem error:', e);
      }
      return;
    }
    try {
      if (await isSecureStoreAvailable()) {
        await SecureStore.setItemAsync(key, value);
      }
    } catch (e) {
      console.warn('SecureStore setItem error:', e);
    }
  },

  async removeItem(key: string): Promise<void> {
    memoryStore.delete(key);
    const ls = getLocalStorage();
    if (ls) {
      try {
        ls.removeItem(key);
      } catch (e) {
        console.warn('localStorage removeItem error:', e);
      }
      return;
    }
    try {
      if (await isSecureStoreAvailable()) {
        await SecureStore.deleteItemAsync(key);
      }
    } catch (e) {
      console.warn('SecureStore removeItem error:', e);
    }
  },
};
