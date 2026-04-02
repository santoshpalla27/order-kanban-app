import { useQuery } from '@tanstack/react-query';
import { notificationsApi } from '../api/client';

export const COMMENT_TYPES = ['comment_added', 'mention'];
export const ATTACHMENT_TYPES = ['attachment_uploaded'];
export const STATUS_CHANGE_TYPES = ['status_change'];
export const CUSTOMER_COMMENT_TYPES = ['customer_comment_added'];
export const CUSTOMER_ATTACHMENT_TYPES = ['customer_attachment_uploaded'];
export type BadgeCategory = 'comments' | 'attachments' | 'status_change' | 'customer_comments' | 'customer_attachments';

function buildBadges(raw: Record<string, { status: string; types: string[] }>) {
  const badges: Record<number, { status: string; cats: Set<BadgeCategory> }> = {};
  for (const [entityId, info] of Object.entries(raw)) {
    const cats = new Set<BadgeCategory>();
    if (info.types.some(t => COMMENT_TYPES.includes(t))) cats.add('comments');
    if (info.types.some(t => ATTACHMENT_TYPES.includes(t))) cats.add('attachments');
    if (info.types.some(t => STATUS_CHANGE_TYPES.includes(t))) cats.add('status_change');
    if (info.types.some(t => CUSTOMER_COMMENT_TYPES.includes(t))) cats.add('customer_comments');
    if (info.types.some(t => CUSTOMER_ATTACHMENT_TYPES.includes(t))) cats.add('customer_attachments');
    if (cats.size) badges[Number(entityId)] = { status: info.status, cats };
  }
  return badges;
}

// All products (Kanban, List View)
export function useProductBadges() {
  const { data } = useQuery({
    queryKey: ['unread-summary'],
    queryFn: () => notificationsApi.getUnreadSummary(),
    staleTime: 0,
  });
  const raw: Record<string, { status: string; types: string[] }> = (data?.data as any) || {};
  const badges = buildBadges(raw);
  const hasAny = (productId: number) => !!badges[productId]?.cats.size;
  const has = (productId: number, cat: BadgeCategory) => !!badges[productId]?.cats.has(cat);
  const totalProducts = Object.keys(badges).length;

  const badgeCountsByStatus: Record<string, number> = { yet_to_start: 0, working: 0, review: 0, done: 0 };
  for (const b of Object.values(badges)) {
    if (b.status in badgeCountsByStatus) {
      badgeCountsByStatus[b.status]++;
    }
  }

  return { badges, hasAny, has, totalProducts, badgeCountsByStatus };
}

// Only products assigned to the given user (My Orders sidebar badge)
export function useMyOrdersBadges(userId: number | undefined) {
  const { data } = useQuery({
    queryKey: ['unread-summary', 'assigned', userId],
    queryFn: () => notificationsApi.getUnreadSummary(userId),
    staleTime: 0,
    enabled: !!userId,
  });
  const raw: Record<string, { status: string; types: string[] }> = (data?.data as any) || {};
  const badges = buildBadges(raw);
  const productIds = new Set(Object.keys(badges).map(Number));
  
  const badgeCountsByStatus: Record<string, number> = { yet_to_start: 0, working: 0, review: 0, done: 0 };
  for (const b of Object.values(badges)) {
    if (b.status in badgeCountsByStatus) {
      badgeCountsByStatus[b.status]++;
    }
  }

  return { count: productIds.size, productIds, badgeCountsByStatus };
}
