import { useState, useCallback } from 'react';
import { notificationsApi } from '../api/services';
import { useWsEvents } from './useWsEvents';

// summary: map of productId → array of unread notification types
type BadgeSummary = Record<number, string[]>;

export function useProductBadges() {
  const [summary, setSummary] = useState<BadgeSummary>({});

  const refresh = useCallback(() => {
    notificationsApi.getUnreadSummary()
      .then((res) => setSummary(res.data ?? {}))
      .catch(() => {});
  }, []);

  // Refresh on any new notification (product badges may have changed)
  useWsEvents({ onNotification: refresh });

  // hasAny returns true if the product has at least one unread notification type
  const hasAny = useCallback(
    (productId: number) => {
      const types = summary[productId];
      return !!(types && types.length > 0);
    },
    [summary],
  );

  return { summary, hasAny, refreshBadges: refresh };
}
