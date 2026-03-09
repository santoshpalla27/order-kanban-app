import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '../types';

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
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
      user: null,
      setAuth: (token, user) => set({ token, user }),
      updateUser: (user) => set({ user }),
      logout: () => set({ token: null, user: null }),
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
