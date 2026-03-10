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
  isWorker: () => boolean;
  canCreateProduct: () => boolean;
  canDeleteProduct: () => boolean;
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
      isWorker: () => get().user?.role?.name === 'worker',
      canCreateProduct: () => {
        const role = get().user?.role?.name;
        return role === 'admin' || role === 'manager';
      },
      canDeleteProduct: () => get().user?.role?.name === 'admin',
    }),
    { name: 'kanban-auth' }
  )
);
