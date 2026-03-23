import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { notificationsApi } from '../api/client';
import { Notification } from '../types';
import { Bell, CheckCheck, ArrowRight, Eye } from 'lucide-react';

interface Props {
  onClose: () => void;
}

const NOTIF_META: Record<string, { color: string; label: string }> = {
  comment_added:       { color: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',       label: 'Comment'    },
  mention:             { color: 'text-purple-400 bg-purple-400/10 border-purple-400/20', label: 'Mention'    },
  attachment_uploaded: { color: 'text-orange-400 bg-orange-400/10 border-orange-400/20', label: 'Attachment' },
  status_change:       { color: 'text-amber-400 bg-amber-400/10 border-amber-400/20',    label: 'Status'     },
  chat_message:        { color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', label: 'Chat'   },
};

function getTypeMeta(type: string) {
  return NOTIF_META[type] || { color: 'text-brand-400 bg-brand-400/10 border-brand-400/20', label: type.replace(/_/g, ' ') };
}

function getAvatarGradient(name: string) {
  const colors = [
    'from-pink-500 to-rose-500', 'from-orange-400 to-amber-500',
    'from-emerald-500 to-teal-500', 'from-cyan-500 to-blue-500',
    'from-violet-500 to-purple-500', 'from-fuchsia-500 to-pink-500',
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
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
    if (link) { onClose(); navigate(link); }
  };

  return (
    <div className="absolute right-0 top-full mt-2 w-[340px] glass-opaque rounded-xl animate-scale-in z-50 shadow-2xl max-h-[480px] flex flex-col border border-surface-700/50">
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

      <div className="overflow-y-auto flex-1 divide-y divide-surface-700/20">
        {isLoading ? (
          <div className="p-8 text-center text-surface-500 text-sm">Loading...</div>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center text-surface-500 text-sm">No notifications</div>
        ) : (
          notifications.map((n) => {
            const link = getNotificationLink(n);
            const meta = getTypeMeta(n.type);
            const senderName = n.sender_name || '';
            const initial = senderName ? senderName.charAt(0).toUpperCase() : '?';
            return (
              <div
                key={n.id}
                className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                  link ? 'cursor-pointer hover:bg-surface-700/30' : 'cursor-default'
                } ${!n.is_read ? 'bg-brand-600/5' : ''}`}
                onClick={() => handleClick(n)}
              >
                {/* Avatar */}
                <div
                  className={`w-8 h-8 rounded-full bg-gradient-to-br ${getAvatarGradient(senderName || n.type)} flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5`}
                >
                  {initial}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {senderName && (
                      <span className="text-xs font-semibold text-surface-200">{senderName}</span>
                    )}
                    {n.type && (
                      <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border ${meta.color}`}>
                        {meta.label}
                      </span>
                    )}
                    {!n.is_read && (
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />
                    )}
                  </div>
                  <p className={`text-xs mt-0.5 leading-relaxed ${n.is_read ? 'text-surface-500' : 'text-surface-300'}`}>
                    {n.message}
                  </p>
                </div>

                {/* Right: time + eye */}
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <span className="text-[10px] text-surface-500 whitespace-nowrap">{formatTime(n.created_at)}</span>
                  {!n.is_read && (
                    <button
                      title="Mark as read"
                      onClick={(e) => { e.stopPropagation(); markRead.mutate(n.id); }}
                      className="p-0.5 text-surface-500 hover:text-brand-400 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
