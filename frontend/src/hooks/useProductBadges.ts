import { useQuery } from '@tanstack/react-query';
import { notificationsApi } from '../api/client';

export const COMMENT_TYPES = ['comment_added', 'mention'];
export const ATTACHMENT_TYPES = ['attachment_uploaded'];
export type BadgeCategory = 'comments' | 'attachments';

export function useProductBadges() {
  const { data } = useQuery({
    queryKey: ['unread-summary'],
    queryFn: () => notificationsApi.getUnreadSummary(),
    staleTime: 0,
  });

  const raw: Record<string, string[]> = (data?.data as any) || {};

  // Build per-product category set
  const badges: Record<number, Set<BadgeCategory>> = {};
  for (const [entityId, types] of Object.entries(raw)) {
    const cats = new Set<BadgeCategory>();
    if (types.some(t => COMMENT_TYPES.includes(t))) cats.add('comments');
    if (types.some(t => ATTACHMENT_TYPES.includes(t))) cats.add('attachments');
    if (cats.size) badges[Number(entityId)] = cats;
  }

  const hasAny = (productId: number) => !!badges[productId]?.size;
  const has = (productId: number, cat: BadgeCategory) => !!badges[productId]?.has(cat);
  const totalProducts = Object.keys(badges).length;

  return { badges, hasAny, has, totalProducts };
}
