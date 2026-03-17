import { create } from 'zustand';

interface OrdersCommentStore {
  unreadProductIds: Record<number, true>;
  add: (productId: number) => void;
  clearProduct: (productId: number) => void;
  clear: () => void;
}

export const useOrdersCommentStore = create<OrdersCommentStore>((set) => ({
  unreadProductIds: {},
  add: (productId) =>
    set((s) => ({ unreadProductIds: { ...s.unreadProductIds, [productId]: true } })),
  clearProduct: (productId) =>
    set((s) => {
      const next = { ...s.unreadProductIds };
      delete next[productId];
      return { unreadProductIds: next };
    }),
  clear: () => set({ unreadProductIds: {} }),
}));
