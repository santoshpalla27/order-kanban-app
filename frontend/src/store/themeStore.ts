import { create } from 'zustand';

type Theme = 'dark' | 'light';

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>((set) => {
  // Read saved theme or default to light
  const saved = (localStorage.getItem('kanban-theme') as Theme) || 'light';
  // Apply immediately on load
  document.documentElement.setAttribute('data-theme', saved);

  return {
    theme: saved,
    toggleTheme: () =>
      set((state) => {
        const next = state.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('kanban-theme', next);
        document.documentElement.setAttribute('data-theme', next);
        return { theme: next };
      }),
    setTheme: (theme: Theme) => {
      localStorage.setItem('kanban-theme', theme);
      document.documentElement.setAttribute('data-theme', theme);
      set({ theme });
    },
  };
});
