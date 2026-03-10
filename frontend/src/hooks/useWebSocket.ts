import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { useQueryClient } from '@tanstack/react-query';
import { useToastStore } from '../store/toastStore';
import { playNotificationSound } from '../utils/sound';

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const token = useAuthStore((s) => s.token);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
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
          case 'product_update':
          case 'product_created':
          case 'product_deleted':
            queryClient.invalidateQueries({ queryKey: ['products'] });
            break;
          case 'comment_added':
            queryClient.invalidateQueries({ queryKey: ['comments'] });
            queryClient.invalidateQueries({ queryKey: ['products'] });
            queryClient.invalidateQueries({ queryKey: ['unread-count'] });
            break;
          case 'attachment_uploaded':
            queryClient.invalidateQueries({ queryKey: ['attachments'] });
            queryClient.invalidateQueries({ queryKey: ['products'] });
            break;
          case 'chat_message':
            queryClient.invalidateQueries({ queryKey: ['chat'] });
            break;
          case 'activity_updated':
            queryClient.invalidateQueries({ queryKey: ['activity-full'] });
            if (data.payload?.actor_name && data.payload?.actor_id !== currentUserId) {
              const actorName = (data.payload.actor_name as string) || '';
              const actMsg = (data.payload.message as string) || 'Activity updated';
              const actEntityId = (data.payload.entity_id as number) || 0;
              const actLink = (data.payload.entity_url as string) || null;
              addToast({
                message: actMsg,
                content: '',
                type: 'activity',
                link: actLink,
                entityType: 'activity',
                entityId: actEntityId,
                senderName: actorName,
              });
            }
            break;
          case 'notification': {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
            queryClient.invalidateQueries({ queryKey: ['unread-count'] });
            const msg = data.payload?.message || 'New notification';
            const ntype = data.payload?.notif_type || 'notification';
            const entityType = (data.payload?.entity_type as string) || '';
            const entityId = (data.payload?.entity_id as number) || 0;
            const content = (data.payload?.content as string) || '';
            const senderName = (data.payload?.sender_name as string) || '';
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
      console.log('WebSocket disconnected, reconnecting...');
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [token, currentUserId, queryClient, addToast]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return wsRef;
}
