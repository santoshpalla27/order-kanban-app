import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useNotificationStore } from '../store/notificationStore';
import { wsManager } from '../websocket/wsManager';
import { ALL_NOTIF_TYPES } from '../types';

// Maps activity entity_action → notification prefs type key.
const ACTION_TO_NOTIF_TYPE: Record<string, string> = {
  status_changed: 'status_change',
  created:        'product_created',
  deleted:        'product_deleted',
  restored:       'product_deleted',
  updated:        'status_change',
};

export interface WsCallbacks {
  onProductsChanged?: () => void;
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
          cb?.onCommentsChanged?.();
          cb?.onProductsChanged?.();
          cb?.onBadgesChanged?.();
          // Re-fetch real count — comment_added may or may not generate
          // a notification for the current user, so don't blindly increment
          refreshUnreadCount();
          break;
        case 'attachment_uploaded':
          cb?.onAttachmentsChanged?.();
          cb?.onProductsChanged?.();
          cb?.onBadgesChanged?.();
          break;
        case 'attachment_deleted':
          cb?.onAttachmentsChanged?.();
          break;
        case 'comment_deleted':
          cb?.onCommentsChanged?.();
          cb?.onAttachmentsChanged?.();
          break;
        case 'activity_updated':
          cb?.onActivityChanged?.();
          if (data.payload?.actor_id !== currentUserId &&
              data.payload?.entity !== 'comment' && data.payload?.entity !== 'attachment') {
            const actAction = (data.payload?.entity_action as string) || '';
            const notifType = ACTION_TO_NOTIF_TYPE[actAction] ?? 'status_change';
            // product_created toast is handled by the targeted notification event
            if (notifType === 'product_created') break;
            const prefs = useAuthStore.getState().user?.notification_prefs;
            // Can't check assignment on mobile, so allow if EITHER list includes the type.
            const myTypes: string[]  = prefs?.custom_my_types  ?? [...ALL_NOTIF_TYPES];
            const allTypes: string[] = prefs?.custom_all_types ?? [...ALL_NOTIF_TYPES];
            if (prefs && !myTypes.includes(notifType) && !allTypes.includes(notifType)) break;
            addToast({
              message: data.payload?.message || 'Activity updated',
              content: '', type: 'activity', entityType: 'activity',
              entityId: data.payload?.entity_id || 0,
              senderName: data.payload?.actor_name || '',
            });
          }
          break;
        case 'notification': {
          cb?.onNotification?.();
          refreshUnreadCount();
          const entityType = data.payload?.entity_type || '';
          // Suppress chat notification toasts when the user is already on the chat screen
          const isChatNotif = entityType === 'chat';
          const isStatusChange = (data.payload?.notif_type || '') === 'status_change';
          // Suppress toast for status_change — activity toast handles those
          if (!isStatusChange && (!isChatNotif || !useNotificationStore.getState().chatScreenActive)) {
            addToast({
              message: data.payload?.message || 'New notification',
              content: data.payload?.content || '',
              type: data.payload?.notif_type || 'notification',
              entityType,
              entityId: data.payload?.entity_id || 0,
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
