import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useNotificationStore } from '../store/notificationStore';
import { wsManager } from '../websocket/wsManager';

// Only these 4 types generate a visible toast — everything else is silent.
const ACTIONABLE_NOTIF_TYPES = new Set(['mention', 'assigned', 'customer_message', 'completed']);

export interface WsCallbacks {
  onProductsChanged?: () => void;
  onTimelineChanged?: () => void;
  // Kept for backwards-compat with hooks that still use them
  onCommentsChanged?: () => void;
  onAttachmentsChanged?: () => void;
  onNotification?: () => void;
  onBadgesChanged?: () => void;
  onForceLogout?: () => void;
  onActivityChanged?: () => void;
  onChatMessage?: (msg: any) => void;
}

export function useWsEvents(callbacks?: WsCallbacks) {
  const token         = useAuthStore((s) => s.token);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const logout        = useAuthStore((s) => s.logout);
  const { addToast, refreshUnreadCount } = useNotificationStore();

  const cbRef = useRef<WsCallbacks | undefined>(callbacks);
  cbRef.current = callbacks;

  useEffect(() => {
    if (!token) { wsManager.disconnect(); return; }
    wsManager.connect(token);
  }, [token]);

  useEffect(() => {
    const handler = (data: any) => {
      const cb = cbRef.current;
      switch (data.type) {
        case 'force_logout':
          wsManager.disconnect();
          logout();
          cb?.onForceLogout?.();
          break;

        case 'product_created':
        case 'product_update':
        case 'product_deleted':
          cb?.onProductsChanged?.();
          break;

        case 'comment_added':
          cb?.onTimelineChanged?.();
          cb?.onCommentsChanged?.();
          cb?.onProductsChanged?.();
          cb?.onBadgesChanged?.();
          refreshUnreadCount();
          break;

        case 'attachment_uploaded':
          cb?.onTimelineChanged?.();
          cb?.onAttachmentsChanged?.();
          cb?.onProductsChanged?.();
          cb?.onBadgesChanged?.();
          break;

        case 'attachment_deleted':
          cb?.onTimelineChanged?.();
          cb?.onAttachmentsChanged?.();
          break;

        case 'comment_deleted':
          cb?.onTimelineChanged?.();
          cb?.onCommentsChanged?.();
          break;

        case 'activity_updated':
          cb?.onTimelineChanged?.();
          cb?.onActivityChanged?.();
          // No toast for activity updates — timeline shows them inline
          break;

        case 'notification': {
          cb?.onNotification?.();
          cb?.onBadgesChanged?.();
          refreshUnreadCount();
          const ntype      = (data.payload?.notif_type || '') as string;
          const entityType = data.payload?.entity_type  || '';
          const isChatNotif = entityType === 'chat';
          // Only show toast for the 4 actionable types
          if (ACTIONABLE_NOTIF_TYPES.has(ntype) && (!isChatNotif || !useNotificationStore.getState().chatScreenActive)) {
            addToast({
              message:    data.payload?.message    || 'New notification',
              content:    data.payload?.content    || '',
              type:       ntype,
              entityType,
              entityId:   data.payload?.entity_id  || 0,
              senderName: data.payload?.sender_name || '',
            });
          }
          break;
        }

        case 'chat_message':
          cb?.onChatMessage?.(data.payload);
          if (data.payload?.user_id !== currentUserId && !useNotificationStore.getState().chatScreenActive) {
            const cur = useNotificationStore.getState().unreadChatCount;
            useNotificationStore.getState().setUnreadChatCount(cur + 1);
          }
          break;
      }
    };
    wsManager.addHandler(handler);
    return () => { wsManager.removeHandler(handler); };
  }, [currentUserId, logout, addToast, refreshUnreadCount]);
}
