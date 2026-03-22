import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { notificationsApi } from '../api/client';
import { Notification } from '../types';
import { Bell, CheckCheck, ArrowRight, Eye } from 'lucide-react';

interface Props {
  onClose: () => void;
}

function getNotificationLink(n: Notification): string | null {
  if (n.entity_type === 'product' && n.entity_id) return `/?product=${n.entity_id}`;
  if (n.entity_type === 'chat') return '/chat';
  return null;
}

export default function NotificationPanel({ onClose }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.getAll(),
  });
  const notifications: Notification[] = data?.data?.data || [];

  const markRead = useMutation({
    mutationFn: (id: number) => notificationsApi.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => notificationsApi.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
    },
  });

  const formatTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const handleClick = (n: Notification) => {
    if (!n.is_read) markRead.mutate(n.id);
    const link = getNotificationLink(n);
    if (link) {
      onClose();
      navigate(link);
    }
  };

  return (
    <div className="absolute right-0 top-full mt-2 w-80 glass-opaque rounded-xl animate-scale-in z-50 shadow-2xl max-h-[480px] flex flex-col border border-surface-700/50">
      <div className="flex items-center justify-between p-4 border-b border-surface-700/50">
        <h3 className="text-sm font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-brand-400 to-indigo-400 flex items-center gap-2">
          <Bell className="w-4 h-4" /> Notifications
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { onClose(); navigate('/notifications'); }}
            className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
          >
            View all <ArrowRight className="w-3 h-3" />
          </button>
          <button
            onClick={() => markAllRead.mutate()}
            className="text-xs text-surface-400 hover:text-surface-300 flex items-center gap-1"
          >
            <CheckCheck className="w-3 h-3" /> Mark all
          </button>
        </div>
      </div>

      <div className="overflow-y-auto flex-1">
        {isLoading ? (
          <div className="p-8 text-center text-surface-500 text-sm">Loading...</div>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center text-surface-500 text-sm">No notifications</div>
        ) : (
          notifications.map((n) => {
            const link = getNotificationLink(n);
            return (
              <div
                key={n.id}
                className={`group flex items-start gap-3 px-4 py-3 border-b border-surface-700/30 transition-colors ${
                  link ? 'cursor-pointer hover:bg-surface-700/30' : 'cursor-default'
                } ${!n.is_read ? 'bg-brand-600/5' : ''}`}
                onClick={() => handleClick(n)}
              >
                {/* Unread dot */}
                <div className="flex-shrink-0 mt-1.5 w-2">
                  {!n.is_read && <div className="w-2.5 h-2.5 rounded-full bg-brand-500 shadow-[0_0_8px_theme(colors.brand.500)]" />}
                </div>

                {/* Message + hint + time */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-relaxed">{n.message}</p>
                  {link && (
                    <p className="text-[11px] text-brand-400/70 mt-0.5">
                      {n.entity_type === 'chat' ? 'Go to Team Chat →' : 'Go to product →'}
                    </p>
                  )}
                  <p className="text-xs text-surface-500 mt-0.5">{formatTime(n.created_at)}</p>
                </div>

                {/* Eye icon — mark as read without navigating */}
                {!n.is_read && (
                  <button
                    title="Mark as read"
                    onClick={(e) => {
                      e.stopPropagation();
                      markRead.mutate(n.id);
                    }}
                    className="flex-shrink-0 p-1 text-surface-500 hover:text-brand-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
