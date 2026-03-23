import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = 'kanban_theme';

interface ThemeState {
  isDark: boolean;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  toggle: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  isDark: false,
  hydrated: false,

  hydrate: async () => {
    try {
      const val = await AsyncStorage.getItem(THEME_KEY);
      set({ isDark: val === 'dark', hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  toggle: async () => {
    const next = !get().isDark;
    set({ isDark: next });
    try { await AsyncStorage.setItem(THEME_KEY, next ? 'dark' : 'light'); } catch {}
  },
}));
