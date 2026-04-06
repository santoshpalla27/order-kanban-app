import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useQueryClient } from '@tanstack/react-query';
import { useToastStore } from '../store/toastStore';
import { useChatStore } from '../store/chatStore';
import { playNotificationSound, playChatSound } from '../utils/sound';
import { NotifType, NotificationPrefs, ALL_NOTIF_TYPES } from '../types';
import type { Product } from '../types';

// Map activity entity_action → notification prefs type key.
const ACTION_TO_NOTIF_TYPE: Record<string, NotifType> = {
  status_changed: 'status_change',
  created:        'product_created',
  deleted:        'product_deleted',
  restored:       'product_deleted',
  updated:        'status_change', // product detail updates — treat same as status_change
};

// Returns true if the user's web prefs allow showing this notification type.
// productId is needed only for my_orders mode to check assignment.
function webPrefsAllow(
  prefs: NotificationPrefs | undefined,
  notifType: NotifType,
  productId: number,
  currentUserId: number | undefined,
  cachedProducts: Product[],
): boolean {
  if (!prefs) return true;
  const types: NotifType[] = prefs.web?.types ?? [...ALL_NOTIF_TYPES];
  const enabled = prefs.web?.enabled ?? true;
  if (!enabled) return false;
  if (!types.includes(notifType)) return false;

  const mode = prefs.mode ?? 'all';
  if (mode === 'all' || mode === 'custom') return true;

  if (mode === 'my_orders') {
    // Find the product in any cached query data to check assignees.
    const product = cachedProducts.find((p) => p.id === productId);
    if (!product) return true; // not in cache — allow (can't tell, don't suppress)
    return product.assignees?.some((a) => a.id === currentUserId) ?? false;
  }
  return true;
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const token = useAuthStore((s) => s.token);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const notifPrefs = useAuthStore((s) => s.user?.notification_prefs);
  const logout = useAuthStore((s) => s.logout);
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const navigate = useNavigate();
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (!token) return;

    const apiUrl = import.meta.env.VITE_API_URL;
    const url = new URL(apiUrl);
    const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${url.host}${url.pathname}/ws?token=${token}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'force_logout':
            clearTimeout(reconnectTimer.current);
            wsRef.current?.close();
            logout();
            navigate('/login');
            break;
          case 'product_update':
          case 'product_created':
          case 'product_deleted':
            queryClient.invalidateQueries({ queryKey: ['products'] });
            break;
          case 'comment_added':
            queryClient.invalidateQueries({ queryKey: ['comments'] });
            queryClient.invalidateQueries({ queryKey: ['products'] });
            queryClient.invalidateQueries({ queryKey: ['unread-count'] });
            queryClient.invalidateQueries({ queryKey: ['unread-summary'] });
            break;
          case 'comment_deleted':
            queryClient.invalidateQueries({ queryKey: ['comments'] });
            queryClient.invalidateQueries({ queryKey: ['attachments'] });
            break;
          case 'attachment_uploaded':
            queryClient.invalidateQueries({ queryKey: ['attachments'] });
            queryClient.invalidateQueries({ queryKey: ['products'] });
            queryClient.invalidateQueries({ queryKey: ['unread-summary'] });
            break;
          case 'attachment_deleted':
            queryClient.invalidateQueries({ queryKey: ['attachments'] });
            break;
          case 'chat_message':
            queryClient.invalidateQueries({ queryKey: ['chat'] });
            // Show badge on Team Chat nav if the message is from someone else
            // and the user is not currently on the chat page.
            if (
              data.payload?.user_id !== currentUserId &&
              !window.location.pathname.includes('/chat')
            ) {
              useChatStore.getState().increment();
            }
            break;
          case 'activity_updated':
            queryClient.invalidateQueries({ queryKey: ['activity-full'] });
            if (data.payload?.actor_name && data.payload?.actor_id !== currentUserId &&
                data.payload?.entity !== 'comment' && data.payload?.entity !== 'attachment') {
              const actorName = (data.payload.actor_name as string) || '';
              const actMsg = (data.payload.message as string) || 'Activity updated';
              const actEntityId = (data.payload.entity_id as number) || 0;
              const actLink = (data.payload.entity_url as string) || null;
              const actAction = (data.payload.entity_action as string) || '';
              const notifType: NotifType = ACTION_TO_NOTIF_TYPE[actAction] ?? 'status_change';

              // Collect all products from any matching query cache entries.
              const cachedProducts: Product[] = [];
              queryClient.getQueriesData<any>({ queryKey: ['products'] }).forEach(([, d]) => {
                if (Array.isArray(d)) cachedProducts.push(...d);
                else if (d?.data && Array.isArray(d.data)) cachedProducts.push(...d.data);
                else if (d?.pages) d.pages.forEach((p: any) => Array.isArray(p?.data) && cachedProducts.push(...p.data));
              });

              if (!webPrefsAllow(notifPrefs, notifType, actEntityId, currentUserId, cachedProducts)) break;

              addToast({
                message: actMsg,
                content: '',
                type: 'activity',
                link: actLink,
                entityType: 'activity',
                entityId: actEntityId,
                senderName: actorName,
              });
              playNotificationSound();
            }
            break;
          case 'notification': {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
            queryClient.invalidateQueries({ queryKey: ['unread-count'] });
            queryClient.invalidateQueries({ queryKey: ['unread-summary'] });
            const entityType = (data.payload?.entity_type as string) || '';
            const isChatNotif = entityType === 'chat';
            // Suppress toast and sound when user is already on the chat page
            if (isChatNotif && window.location.pathname.includes('/chat')) break;
            const ntype = data.payload?.notif_type || 'notification';
            // Suppress toast for status_change and product_created — activity toast handles those
            if (ntype === 'status_change' || ntype === 'product_created') break;
            const msg = data.payload?.message || 'New notification';
            const entityId = (data.payload?.entity_id as number) || 0;
            const content = (data.payload?.content as string) || '';
            const senderName = (data.payload?.sender_name as string) || '';
            let link: string | null = null;
            if (entityType === 'product' && entityId) link = `/?product=${entityId}`;
            else if (isChatNotif) link = '/chat';
            addToast({ message: msg, content, type: ntype, link, entityType, entityId, senderName });
            if (isChatNotif) playChatSound(); else playNotificationSound();
            break;
          }
        }
      } catch (e) {
        console.error('WS parse error:', e);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected, reconnecting...');
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [token, currentUserId, notifPrefs, logout, navigate, queryClient, addToast]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return wsRef;
}
