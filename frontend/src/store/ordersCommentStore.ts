import { create } from 'zustand';

interface OrdersCommentStore {
  unreadCount: number;
  increment: () => void;
  clear: () => void;
}

export const useOrdersCommentStore = create<OrdersCommentStore>((set) => ({
  unreadCount: 0,
  increment: () => set((s) => ({ unreadCount: s.unreadCount + 1 })),
  clear: () => set({ unreadCount: 0 }),
}));
