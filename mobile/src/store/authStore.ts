import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types';
import { tokenManager } from '../utils/tokenManager';

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  hydrated: boolean;

  setAuth: (token: string, refreshToken: string, user: User) => Promise<void>;
  setToken: (token: string, refreshToken: string) => Promise<void>;
  updateUser: (user: User) => void;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;

  // Role helpers
  isAdmin: () => boolean;
  isManager: () => boolean;
  isOrganiser: () => boolean;
  isEmployee: () => boolean;
  isViewOnly: () => boolean;

  // Permission helpers
  canCreateProduct: () => boolean;
  canDeleteProduct: () => boolean;
  canChangeStatus: () => boolean;
  canUploadAttachment: () => boolean;
  canComment: () => boolean;
  canSendChat: () => boolean;
  canAccessTrash: () => boolean;
  canViewStats: () => boolean;
}

const USER_KEY = 'kanban_user';

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  refreshToken: null,
  user: null,
  hydrated: false,

  hydrate: async () => {
    const [token, refreshToken, userJson] = await Promise.all([
      tokenManager.getAccessToken(),
      tokenManager.getRefreshToken(),
      AsyncStorage.getItem(USER_KEY),
    ]);
    set({
      token,
      refreshToken,
      user: userJson ? JSON.parse(userJson) : null,
      hydrated: true,
    });
  },

  setAuth: async (token, refreshToken, user) => {
    await Promise.all([
      tokenManager.setTokens(token, refreshToken),
      AsyncStorage.setItem(USER_KEY, JSON.stringify(user)),
    ]);
    set({ token, refreshToken, user });
  },

  setToken: async (token, refreshToken) => {
    await tokenManager.setTokens(token, refreshToken);
    set({ token, refreshToken });
  },

  updateUser: (user) => {
    AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ user });
  },

  logout: async () => {
    await Promise.all([
      tokenManager.clearTokens(),
      AsyncStorage.removeItem(USER_KEY),
    ]);
    set({ token: null, refreshToken: null, user: null });
  },

  // Roles
  isAdmin:     () => get().user?.role?.name === 'admin',
  isManager:   () => get().user?.role?.name === 'manager',
  isOrganiser: () => get().user?.role?.name === 'organiser',
  isEmployee:  () => get().user?.role?.name === 'employee',
  isViewOnly:  () => get().user?.role?.name === 'view_only',

  // Permissions
  canCreateProduct: () => {
    const r = get().user?.role?.name;
    return r === 'admin' || r === 'manager' || r === 'organiser';
  },
  canDeleteProduct: () => {
    const r = get().user?.role?.name;
    return r === 'admin' || r === 'manager';
  },
  canChangeStatus: () => {
    const r = get().user?.role?.name;
    return r === 'admin' || r === 'manager' || r === 'organiser';
  },
  canUploadAttachment: () => {
    const r = get().user?.role?.name;
    return r === 'admin' || r === 'manager' || r === 'organiser' || r === 'employee';
  },
  canComment: () => {
    const r = get().user?.role?.name;
    return r === 'admin' || r === 'manager' || r === 'organiser' || r === 'employee';
  },
  canSendChat: () => {
    const r = get().user?.role?.name;
    return r === 'admin' || r === 'manager' || r === 'organiser' || r === 'employee';
  },
  canAccessTrash: () => {
    const r = get().user?.role?.name;
    return r === 'admin' || r === 'manager';
  },
  canViewStats: () => {
    const r = get().user?.role?.name;
    return r === 'admin' || r === 'manager';
  },
}));
