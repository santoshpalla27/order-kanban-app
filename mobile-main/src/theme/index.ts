export interface ThemeColors {
  // Backgrounds
  bg: string;
  card: string;
  surface: string;
  surface2: string;
  headerBg: string;
  tabBarBg: string;
  inputBg: string;

  // Borders
  border: string;
  border2: string;

  // Text
  text: string;
  textSec: string;
  textMuted: string;
  textDim: string;

  // Brand (same both themes)
  brand: string;
  brandLight: string;

  // Misc
  isDark: boolean;
}

export const darkColors: ThemeColors = {
  bg:        '#0A0D14',
  card:      '#131720',
  surface:   '#1C2130',
  surface2:  '#1E2535',
  headerBg:  '#0F1117',
  tabBarBg:  '#0F1117',
  inputBg:   '#1C2130',

  border:    '#1E2535',
  border2:   '#2D3748',

  text:      '#F1F5F9',
  textSec:   '#94A3B8',
  textMuted: '#64748B',
  textDim:   '#475569',

  brand:      '#6366F1',
  brandLight: '#818CF8',

  isDark: true,
};

export const lightColors: ThemeColors = {
  bg:        '#F1F5F9',
  card:      '#FFFFFF',
  surface:   '#F8FAFC',
  surface2:  '#EEF2F7',
  headerBg:  '#FFFFFF',
  tabBarBg:  '#FFFFFF',
  inputBg:   '#F8FAFC',

  border:    '#E2E8F0',
  border2:   '#CBD5E1',

  text:      '#0F172A',
  textSec:   '#475569',
  textMuted: '#94A3B8',
  textDim:   '#CBD5E1',

  brand:      '#6366F1',
  brandLight: '#818CF8',

  isDark: false,
};
