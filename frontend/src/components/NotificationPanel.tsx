import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { notificationsApi } from '../api/client';
import { Notification } from '../types';
import { Bell, Check, CheckCheck, ArrowRight } from 'lucide-react';

interface Props {
  onClose: () => void;
}

export default function NotificationPanel({ onClose }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.getAll(),
  });
  const notifications: Notification[] = data?.data || [];

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

  return (
    <div className="absolute right-0 top-full mt-2 w-80 glass-opaque rounded-xl animate-scale-in z-50 max-h-[480px] flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-surface-700/50">
        <h3 className="font-semibold flex items-center gap-2">
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
          notifications.map((n) => (
            <div
              key={n.id}
              className={`px-4 py-3 border-b border-surface-700/30 hover:bg-surface-700/30 transition-colors cursor-pointer ${
                !n.is_read ? 'bg-brand-600/5' : ''
              }`}
              onClick={() => !n.is_read && markRead.mutate(n.id)}
            >
              <div className="flex items-start gap-3">
                {!n.is_read && (
                  <div className="w-2 h-2 rounded-full bg-brand-500 mt-1.5 flex-shrink-0" />
                )}
                <div className={`flex-1 ${n.is_read ? 'ml-5' : ''}`}>
                  <p className="text-sm leading-relaxed">{n.message}</p>
                  <p className="text-xs text-surface-500 mt-1">{formatTime(n.created_at)}</p>
                </div>
                {!n.is_read && (
                  <button className="text-surface-500 hover:text-brand-400 p-1">
                    <Check className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
