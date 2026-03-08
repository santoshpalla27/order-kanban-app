import { create } from 'zustand';

export interface Toast {
  id: string;
  message: string;
  type: string;
}

interface ToastState {
  toasts: Toast[];
  addToast: (message: string, type: string) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  addToast: (message, type) => {
    // Deduplicate: skip if the same message is already visible
    if (get().toasts.some((t) => t.message === message)) return;
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 5000);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
