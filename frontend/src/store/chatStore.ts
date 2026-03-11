import { create } from 'zustand';

interface ChatStore {
  unreadCount: number;
  increment: () => void;
  clear: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  unreadCount: 0,
  increment: () => set((s) => ({ unreadCount: s.unreadCount + 1 })),
  clear: () => set({ unreadCount: 0 }),
}));
