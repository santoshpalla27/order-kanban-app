import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useQueryClient } from '@tanstack/react-query';
import { useToastStore } from '../store/toastStore';
import { useChatStore } from '../store/chatStore';
import { playNotificationSound } from '../utils/sound';

// Only these 4 types show a toast — everything else updates the UI silently.
const ACTIONABLE_NOTIF_TYPES = new Set(['mention', 'assigned', 'customer_message', 'completed']);

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const token = useAuthStore((s) => s.token);
  const currentUserId = useAuthStore((s) => s.user?.id);
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
            // Refresh timeline silently — no toast
            queryClient.invalidateQueries({ queryKey: ['timeline'] });
            queryClient.invalidateQueries({ queryKey: ['products'] });
            break;

          case 'comment_deleted':
            queryClient.invalidateQueries({ queryKey: ['timeline'] });
            queryClient.invalidateQueries({ queryKey: ['attachments'] });
            break;

          case 'attachment_uploaded':
          case 'attachment_deleted':
            // File events refresh timeline inline — no toast
            queryClient.invalidateQueries({ queryKey: ['timeline'] });
            queryClient.invalidateQueries({ queryKey: ['attachments'] });
            queryClient.invalidateQueries({ queryKey: ['products'] });
            break;

          case 'chat_message':
            queryClient.invalidateQueries({ queryKey: ['chat'] });
            if (
              data.payload?.user_id !== currentUserId &&
              !window.location.pathname.includes('/chat')
            ) {
              useChatStore.getState().increment();
            }
            break;

          case 'activity_updated':
            // Status changes show in timeline — no toast
            queryClient.invalidateQueries({ queryKey: ['activity-full'] });
            queryClient.invalidateQueries({ queryKey: ['timeline'] });
            break;

          case 'notification': {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
            queryClient.invalidateQueries({ queryKey: ['unread-count'] });
            queryClient.invalidateQueries({ queryKey: ['unread-summary'] });

            const ntype: string = data.payload?.notif_type || '';
            // Only show toast for the 4 actionable types
            if (!ACTIONABLE_NOTIF_TYPES.has(ntype)) break;

            const entityType = (data.payload?.entity_type as string) || '';
            const entityId = (data.payload?.entity_id as number) || 0;
            const content = (data.payload?.content as string) || '';
            const senderName = (data.payload?.sender_name as string) || '';
            const msg = (data.payload?.message as string) || 'New notification';
            let link: string | null = null;
            if (entityType === 'product' && entityId) link = `/?product=${entityId}`;
            else if (entityType === 'chat') link = '/chat';

            addToast({ message: msg, content, type: ntype, link, entityType, entityId, senderName });
            playNotificationSound();
            break;
          }
        }
      } catch (e) {
        console.error('WS parse error:', e);
      }
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      console.log('WebSocket disconnected, reconnecting...');
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [token, currentUserId, logout, navigate, queryClient, addToast]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return wsRef;
}
