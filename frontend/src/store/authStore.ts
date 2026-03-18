import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '../types';

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  setAuth: (token: string, refreshToken: string, user: User) => void;
  setToken: (token: string, refreshToken: string) => void;
  updateUser: (user: User) => void;
  logout: () => void;
  isAdmin: () => boolean;
  isManager: () => boolean;
  isOrganiser: () => boolean;
  isEmployee: () => boolean;
  isViewOnly: () => boolean;
  canCreateProduct: () => boolean;
  canDeleteProduct: () => boolean;
  canChangeStatus: () => boolean;
  canUploadAttachment: () => boolean;
  canComment: () => boolean;
  canSendChat: () => boolean;
  canAccessTrash: () => boolean;
  canViewStats: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      refreshToken: null,
      user: null,
      setAuth: (token, refreshToken, user) => set({ token, refreshToken, user }),
      setToken: (token, refreshToken) => set({ token, refreshToken }),
      updateUser: (user) => set({ user }),
      logout: () => set({ token: null, refreshToken: null, user: null }),
      isAdmin: () => get().user?.role?.name === 'admin',
      isManager: () => get().user?.role?.name === 'manager',
      isOrganiser: () => get().user?.role?.name === 'organiser',
      isEmployee: () => get().user?.role?.name === 'employee',
      isViewOnly: () => get().user?.role?.name === 'view_only',
      canCreateProduct: () => {
        const role = get().user?.role?.name;
        return role === 'admin' || role === 'manager' || role === 'organiser';
      },
      canDeleteProduct: () => {
        const role = get().user?.role?.name;
        return role === 'admin' || role === 'manager';
      },
      canChangeStatus: () => {
        const role = get().user?.role?.name;
        return role === 'admin' || role === 'manager' || role === 'organiser';
      },
      canUploadAttachment: () => {
        const role = get().user?.role?.name;
        return role === 'admin' || role === 'manager' || role === 'organiser' || role === 'employee';
      },
      canComment: () => {
        const role = get().user?.role?.name;
        return role === 'admin' || role === 'manager' || role === 'organiser' || role === 'employee';
      },
      canSendChat: () => {
        const role = get().user?.role?.name;
        return role === 'admin' || role === 'manager' || role === 'organiser' || role === 'employee';
      },
      canAccessTrash: () => {
        const role = get().user?.role?.name;
        return role === 'admin' || role === 'manager';
      },
      canViewStats: () => {
        const role = get().user?.role?.name;
        return role === 'admin' || role === 'manager';
      },
    }),
    { name: 'kanban-auth' }
  )
);
