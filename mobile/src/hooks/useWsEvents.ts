import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useNotificationStore } from '../store/notificationStore';
import { wsManager } from '../websocket/wsManager';

export interface WsCallbacks {
  onProductsChanged?: () => void;
  onCommentsChanged?: () => void;
  onAttachmentsChanged?: () => void;
  onNotification?: () => void;
  onForceLogout?: () => void;
  onActivityChanged?: () => void;
}

export function useWsEvents(callbacks?: WsCallbacks) {
  const token         = useAuthStore((s) => s.token);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const logout        = useAuthStore((s) => s.logout);
  const { addToast, incrementUnread } = useNotificationStore();

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
          incrementUnread();
          break;
        case 'attachment_uploaded':
          cb?.onAttachmentsChanged?.();
          cb?.onProductsChanged?.();
          break;
        case 'activity_updated':
          cb?.onActivityChanged?.();
          if (data.payload?.actor_id !== currentUserId &&
              data.payload?.entity !== 'comment' && data.payload?.entity !== 'attachment') {
            addToast({
              message: data.payload?.message || 'Activity updated',
              content: '', type: 'activity', entityType: 'activity',
              entityId: data.payload?.entity_id || 0,
              senderName: data.payload?.actor_name || '',
            });
          }
          break;
        case 'notification':
          cb?.onNotification?.();
          incrementUnread();
          addToast({
            message: data.payload?.message || 'New notification',
            content: data.payload?.content || '',
            type: data.payload?.notif_type || 'notification',
            entityType: data.payload?.entity_type || '',
            entityId: data.payload?.entity_id || 0,
            senderName: data.payload?.sender_name || '',
          });
          break;
      }
    };
    wsManager.addHandler(handler);
    return () => { wsManager.removeHandler(handler); };
  }, [currentUserId, logout, addToast, incrementUnread]);
}
