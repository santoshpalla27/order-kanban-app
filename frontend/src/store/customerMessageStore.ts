import { create } from 'zustand';

interface CustomerMessageStore {
  unreadByProduct: Record<number, number>;
  increment: (productId: number) => void;
  clear: (productId: number) => void;
  hasUnread: (productId: number) => boolean;
  getCount: (productId: number) => number;
}

export const useCustomerMessageStore = create<CustomerMessageStore>((set, get) => ({
  unreadByProduct: {},
  increment: (productId) =>
    set((s) => ({
      unreadByProduct: {
        ...s.unreadByProduct,
        [productId]: (s.unreadByProduct[productId] || 0) + 1,
      },
    })),
  clear: (productId) =>
    set((s) => {
      const next = { ...s.unreadByProduct };
      delete next[productId];
      return { unreadByProduct: next };
    }),
  hasUnread: (productId) => (get().unreadByProduct[productId] || 0) > 0,
  getCount: (productId) => get().unreadByProduct[productId] || 0,
}));
