import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// expo-secure-store only works on native (iOS/Android), not web
// On web we fall back to AsyncStorage (localStorage-backed)
let SecureStore: typeof import('expo-secure-store') | null = null;
if (Platform.OS !== 'web') {
  SecureStore = require('expo-secure-store');
}

const ACCESS_KEY  = 'kanban_access_token';
const REFRESH_KEY = 'kanban_refresh_token';

async function get(key: string): Promise<string | null> {
  if (SecureStore) return SecureStore.getItemAsync(key);
  return AsyncStorage.getItem(key);
}

async function set(key: string, value: string): Promise<void> {
  if (SecureStore) { await SecureStore.setItemAsync(key, value); return; }
  await AsyncStorage.setItem(key, value);
}

async function del(key: string): Promise<void> {
  if (SecureStore) { await SecureStore.deleteItemAsync(key); return; }
  await AsyncStorage.removeItem(key);
}

export const tokenManager = {
  getAccessToken:  () => get(ACCESS_KEY),
  getRefreshToken: () => get(REFRESH_KEY),
  setTokens: (access: string, refresh: string) =>
    Promise.all([set(ACCESS_KEY, access), set(REFRESH_KEY, refresh)]).then(() => {}),
  clearTokens: () =>
    Promise.all([del(ACCESS_KEY), del(REFRESH_KEY)]).then(() => {}),
};
