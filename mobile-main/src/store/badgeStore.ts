import { create } from 'zustand';
import { notificationsApi } from '../api/services';

export const COMMENT_TYPES = ['comment_added', 'mention'];
export const ATTACHMENT_TYPES = ['attachment_uploaded'];
export const STATUS_CHANGE_TYPES = ['status_change'];
export const CUSTOMER_COMMENT_TYPES = ['customer_comment_added'];
export const CUSTOMER_ATTACHMENT_TYPES = ['customer_attachment_uploaded'];
export type BadgeCategory = 'comments' | 'attachments' | 'status_change' | 'customer_comments' | 'customer_attachments';

type RawSummary = Record<string, string[]>;
export type Badges = Record<number, Set<BadgeCategory>>;

export function buildBadges(raw: RawSummary): Badges {
  const badges: Badges = {};
  for (const [entityId, types] of Object.entries(raw)) {
    const cats = new Set<BadgeCategory>();
    if (types.some((t) => COMMENT_TYPES.includes(t))) cats.add('comments');
    if (types.some((t) => ATTACHMENT_TYPES.includes(t))) cats.add('attachments');
    if (types.some((t) => STATUS_CHANGE_TYPES.includes(t))) cats.add('status_change');
    if (types.some((t) => CUSTOMER_COMMENT_TYPES.includes(t))) cats.add('customer_comments');
    if (types.some((t) => CUSTOMER_ATTACHMENT_TYPES.includes(t))) cats.add('customer_attachments');
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
