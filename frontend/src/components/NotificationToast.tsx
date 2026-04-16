import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useToastStore, Toast } from '../store/toastStore';
import { commentsApi, notificationsApi } from '../api/client';
import { X, Send, MessageSquare, CheckCircle, UserPlus, Bell } from 'lucide-react';

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-fuchsia-500', 'bg-orange-500',
];

function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2);
}

function typeIconMeta(type: string): { icon: React.ReactNode; bg: string; label: string } {
  switch (type) {
    case 'mention':
      return { icon: <MessageSquare className="w-2.5 h-2.5 text-white" />, bg: 'bg-violet-500', label: 'Mentioned you' };
    case 'customer_message':
      return { icon: <MessageSquare className="w-2.5 h-2.5 text-white" />, bg: 'bg-teal-500', label: 'Customer message' };
    case 'completed':
      return { icon: <CheckCircle className="w-2.5 h-2.5 text-white" />, bg: 'bg-emerald-500', label: 'Order completed' };
    case 'assigned':
      return { icon: <UserPlus className="w-2.5 h-2.5 text-white" />, bg: 'bg-blue-500', label: 'Assigned to you' };
    default:
      return { icon: <Bell className="w-2.5 h-2.5 text-white" />, bg: 'bg-brand-500', label: 'Notification' };
  }
}

function ToastCard({ toast }: { toast: Toast }) {
  const { removeToast } = useToastStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const canReply = toast.type === 'mention' || toast.type === 'customer_message';
  const senderInitials = toast.senderName ? initials(toast.senderName) : '?';
  const colorClass = toast.senderName ? avatarColor(toast.senderName) : 'bg-surface-600';
  const typeMeta = typeIconMeta(toast.type);

  const handleOpen = () => {
    removeToast(toast.id);
    if (toast.link) navigate(toast.link);
  };

  const handleSend = async () => {
    const text = reply.trim();
    if (!text || sending || !toast.entityId) return;
    setSending(true);
    try {
      await commentsApi.create(toast.entityId, text);
      await notificationsApi.markReadByEntityAndTypes('product', toast.entityId, ['mention', 'customer_message']);
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['timeline', toast.entityId] });
      setReply('');
      removeToast(toast.id);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="pointer-events-auto flex flex-col w-[360px] bg-surface-800/90 backdrop-blur-xl shadow-2xl rounded-xl overflow-hidden border border-surface-600/40 animate-slide-in">
      {/* Header */}
      <div className="flex items-start gap-2.5 px-3 pt-3 pb-2">
        <div className="relative flex-shrink-0">
          <div className={`w-9 h-9 rounded-full ${colorClass} flex items-center justify-center text-white text-sm font-bold`}>
            {senderInitials}
          </div>
          <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full ${typeMeta.bg} flex items-center justify-center ring-2 ring-surface-800`}>
            {typeMeta.icon}
          </div>
        </div>
        <div className={`flex-1 min-w-0 ${toast.link ? 'cursor-pointer' : ''}`} onClick={toast.link ? handleOpen : undefined}>
          <p className="text-sm font-semibold text-surface-100 leading-tight truncate">
            {toast.senderName || typeMeta.label}
          </p>
          <p className="text-xs text-surface-400 leading-snug mt-0.5 break-words">{toast.message}</p>
        </div>
        <button onClick={() => removeToast(toast.id)} className="text-surface-500 hover:text-surface-300 transition-colors p-0.5 rounded flex-shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Message preview */}
      {toast.content && (
        <div className="px-3 pb-2 cursor-pointer" onClick={toast.link ? handleOpen : undefined}>
          <p className="text-sm text-surface-200 bg-surface-700/40 px-3 py-2 rounded-xl leading-relaxed break-words line-clamp-3">
            {toast.content}
          </p>
        </div>
      )}

      {/* Inline reply (only for mention + customer_message) */}
      {canReply && (
        <div className="px-2 pb-2.5 flex items-center gap-1.5">
          <div className="flex-1 flex items-center rounded-2xl px-3 py-2 bg-surface-700/50">
            <input
              type="text"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Reply…"
              className="flex-1 text-sm bg-transparent outline-none text-surface-200 placeholder-surface-500"
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!reply.trim() || sending}
            className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center disabled:opacity-40 transition-colors hover:bg-brand-400"
          >
            <Send className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
      )}

      {/* Open button for non-replyable toasts */}
      {!canReply && toast.link && (
        <div className="flex justify-end px-3 pb-3 -mt-1">
          <button onClick={handleOpen} className="text-[11px] font-semibold px-3 py-1 rounded-full text-brand-400 bg-brand-400/10 hover:bg-brand-400/20 transition-colors">
            Open →
          </button>
        </div>
      )}
    </div>
  );
}

export default function NotificationToast() {
  const { toasts } = useToastStore();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.slice(-3).map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
