import { useEffect, useCallback } from 'react';
import { useWsEvents } from './useWsEvents';
import { useAuthStore } from '../store/authStore';
import { useBadgeStore, BadgeCategory, COMMENT_TYPES, ATTACHMENT_TYPES, STATUS_CHANGE_TYPES } from '../store/badgeStore';

// Re-export constants so screens can import from one place
export { COMMENT_TYPES, ATTACHMENT_TYPES, STATUS_CHANGE_TYPES };
export type { BadgeCategory };

// ── All products badge hook ───────────────────────────────────────────────────
// Uses global store — refreshing from any component updates ALL consumers

export function useProductBadges() {
  const { allBadges, refreshAll, refreshMyOrders } = useBadgeStore();
  const userId = useAuthStore((s) => s.user?.id);

  // Always refresh both all-badges and my-orders-badges together
  const refresh = useCallback(() => {
    refreshAll();
    if (userId) refreshMyOrders(userId);
  }, [refreshAll, refreshMyOrders, userId]);

  useEffect(() => { refresh(); }, []);

  const onBadge = useCallback(() => { refresh(); }, [refresh]);
  useWsEvents({ onNotification: onBadge, onBadgesChanged: onBadge });

  const hasAny = useCallback(
    (productId: number) => !!allBadges[productId]?.size,
    [allBadges],
  );

  const has = useCallback(
    (productId: number, cat: BadgeCategory) => !!allBadges[productId]?.has(cat),
    [allBadges],
  );

  return { badges: allBadges, hasAny, has, refreshBadges: refresh };
}

// ── My Orders badge hook (assigned-to-user products only) ─────────────────────

export function useMyOrdersBadges() {
  const user = useAuthStore((s) => s.user);
  const userId = user?.id;
  const { myOrdersBadges, refreshMyOrders } = useBadgeStore();

  const refresh = useCallback(() => {
    if (userId) refreshMyOrders(userId);
  }, [userId, refreshMyOrders]);

  useEffect(() => { refresh(); }, [refresh]);

  const onBadge = useCallback(() => { refresh(); }, [refresh]);
  useWsEvents({ onNotification: onBadge, onBadgesChanged: onBadge });

  const productIds = new Set(Object.keys(myOrdersBadges).map(Number));
  return { count: productIds.size, productIds };
}
