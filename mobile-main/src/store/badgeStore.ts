import { create } from 'zustand';
import { notificationsApi } from '../api/services';

export const COMMENT_TYPES = ['comment_added', 'mention'];
export const ATTACHMENT_TYPES = ['attachment_uploaded'];
export type BadgeCategory = 'comments' | 'attachments';

type RawSummary = Record<string, string[]>;
export type Badges = Record<number, Set<BadgeCategory>>;

export function buildBadges(raw: RawSummary): Badges {
  const badges: Badges = {};
  for (const [entityId, types] of Object.entries(raw)) {
    const cats = new Set<BadgeCategory>();
    if (types.some((t) => COMMENT_TYPES.includes(t))) cats.add('comments');
    if (types.some((t) => ATTACHMENT_TYPES.includes(t))) cats.add('attachments');
    if (cats.size) badges[Number(entityId)] = cats;
  }
  return badges;
}

interface BadgeStore {
  // All products with unread notifications
  allBadges: Badges;
  // Only products assigned to the current user
  myOrdersBadges: Badges;

  refreshAll: () => Promise<void>;
  refreshMyOrders: (userId: number) => Promise<void>;
}

export const useBadgeStore = create<BadgeStore>((set) => ({
  allBadges: {},
  myOrdersBadges: {},

  refreshAll: async () => {
    try {
      const res = await notificationsApi.getUnreadSummary();
      set({ allBadges: buildBadges((res.data as RawSummary) ?? {}) });
    } catch {}
  },

  refreshMyOrders: async (userId: number) => {
    try {
      const res = await notificationsApi.getUnreadSummary(userId);
      set({ myOrdersBadges: buildBadges((res.data as RawSummary) ?? {}) });
    } catch {}
  },
}));
