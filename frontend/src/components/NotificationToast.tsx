import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useToastStore, Toast } from '../store/toastStore';
import { commentsApi, chatApi, notificationsApi } from '../api/client';
import { X, Send, MessageSquare, Paperclip, RefreshCw, Package, Bell } from 'lucide-react';

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
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function typeIconMeta(type: string): { icon: React.ReactNode; bg: string } {
  switch (type) {
    case 'comment_added':
    case 'customer_comment_added':
    case 'mention':
      return { icon: <MessageSquare className="w-2.5 h-2.5 text-white" />, bg: 'bg-violet-500' };
    case 'attachment_uploaded':
    case 'customer_attachment_uploaded':
      return { icon: <Paperclip className="w-2.5 h-2.5 text-white" />, bg: 'bg-orange-500' };
    case 'status_change':
      return { icon: <RefreshCw className="w-2.5 h-2.5 text-white" />, bg: 'bg-amber-500' };
    case 'product_created':
      return { icon: <Package className="w-2.5 h-2.5 text-white" />, bg: 'bg-blue-500' };
    case 'chat_message':
      return { icon: <MessageSquare className="w-2.5 h-2.5 text-white" />, bg: 'bg-teal-500' };
    default:
      return { icon: <Bell className="w-2.5 h-2.5 text-white" />, bg: 'bg-brand-500' };
  }
}

function ToastCard({ toast, compact }: { toast: Toast; compact?: boolean }) {
  const { removeToast } = useToastStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(100);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const DURATION = 10000;
  const INTERVAL = 50;

  useEffect(() => {
    const start = Date.now();
    progressRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / DURATION) * 100);
      setProgress(remaining);
      if (remaining === 0 && progressRef.current) clearInterval(progressRef.current);
    }, INTERVAL);
    return () => { if (progressRef.current) clearInterval(progressRef.current); };
  }, []);

  const isChat = toast.entityType === 'chat';
  const canReply = (toast.entityType === 'product' && toast.type !== 'product_created' && toast.type !== 'product_deleted') || isChat;
  const senderInitials = toast.senderName ? initials(toast.senderName) : '?';
  const colorClass = toast.senderName ? avatarColor(toast.senderName) : 'bg-surface-600';
  const typeMeta = typeIconMeta(toast.type);

  const handleOpen = () => {
    removeToast(toast.id);
    if (toast.link) navigate(toast.link);
  };

  const handleSend = async () => {
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      if (toast.entityType === 'product' && toast.entityId) {
        await commentsApi.create(toast.entityId, text);
        await notificationsApi.markReadByEntityAndTypes('product', toast.entityId, ['comment_added', 'mention']);
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        queryClient.invalidateQueries({ queryKey: ['unread-count'] });
        queryClient.invalidateQueries({ queryKey: ['unread-summary'] });
      } else if (isChat) {
        await chatApi.sendMessage(text);
      }
      setReply('');
      removeToast(toast.id);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`pointer-events-auto flex flex-col w-[380px] bg-surface-800/60 backdrop-blur-xl shadow-2xl rounded-xl overflow-hidden animate-slide-in ${
      isChat
        ? 'border border-teal-500/30 shadow-teal-900/20'
        : 'border border-surface-600/40 shadow-brand-900/10'
    }`}>

      {/* Header: avatar + sender name + action text + close */}
      <div className="flex items-start gap-2.5 px-3 pt-3 pb-2">
        {/* Avatar with type icon badge */}
        <div className="relative flex-shrink-0">
          <div className={`w-10 h-10 rounded-full ${colorClass} flex items-center justify-center text-white text-sm font-bold`}>
            {senderInitials}
          </div>
          <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full ${typeMeta.bg} flex items-center justify-center ring-2 ring-surface-800`}>
            {typeMeta.icon}
          </div>
        </div>

        {/* Text */}
        <div
          className={`flex-1 min-w-0 ${toast.link ? 'cursor-pointer' : ''}`}
          onClick={toast.link ? handleOpen : undefined}
        >
          <div className="flex items-center gap-1.5">
            {toast.senderName && (
              <p className="text-sm font-bold text-surface-100 leading-tight truncate">
                {toast.senderName}
              </p>
            )}
            {isChat && (
              <span className="flex-shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-teal-500/20 text-teal-400 leading-none">
                Team Chat
              </span>
            )}
          </div>
          <p className="text-xs text-surface-400 leading-snug mt-0.5 break-words">
            {toast.message}
          </p>
        </div>

        {/* Right side: Close */}
        <div className="flex-shrink-0 flex items-center gap-1.5 mt-0.5">
          <button
            onClick={() => removeToast(toast.id)}
            className="text-surface-500 hover:text-surface-300 transition-colors p-0.5 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Compact: show type badge instead of full content */}
      {compact && (
        <div className="px-3 pb-2 -mt-1">
          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${
            isChat ? 'text-teal-400 bg-teal-400/10 border-teal-400/20' : 'text-brand-400 bg-brand-400/10 border-brand-400/20'
          }`}>
            {typeMeta.icon} {toast.type.replace(/_/g, ' ')}
          </span>
        </div>
      )}

      {/* Message bubble — customer portal style */}
      {!compact && toast.content && (
        <div className="px-3 pb-2">
          <div
            className={`px-3.5 py-2.5 rounded-2xl rounded-tl-sm max-w-full bg-surface-800/80 backdrop-blur-md border border-surface-700/50 ${toast.link ? 'cursor-pointer' : ''}`}
            onClick={toast.link ? handleOpen : undefined}
          >
            <p className="text-sm text-surface-200 leading-relaxed break-words">{toast.content}</p>
          </div>
        </div>
      )}

      {/* Inline reply — customer portal input bar style */}
      {!compact && canReply && (
        <div className="px-2 pb-2.5 flex items-center gap-1.5" style={{ background: 'transparent' }}>
          <div className="flex-1 flex items-center rounded-2xl px-3 py-2" style={{ background: '#f0f2f5' }}>
            <input
              type="text"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Type a message…"
              className="flex-1 text-sm bg-transparent outline-none"
              style={{ color: '#111b21' }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!reply.trim() || sending}
            className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            style={{ background: '#25d366' }}
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
      )}

      {/* Open button — bottom right for non-replyable toasts */}
      {!compact && !canReply && toast.link && (
        <div className="flex justify-end px-4 pb-3 -mt-1">
          <button
            onClick={handleOpen}
            className={`text-[11px] font-semibold px-3 py-1 rounded-full transition-colors ${
              isChat
                ? 'text-teal-400 bg-teal-400/10 hover:bg-teal-400/20'
                : 'text-brand-400 bg-brand-400/10 hover:bg-brand-400/20'
            }`}
          >
            Open →
          </button>
        </div>
      )}

      {/* Progress bar */}
      <div className="h-0.5 w-full bg-surface-700/40">
        <div
          className={`h-full transition-none ${isChat ? 'bg-teal-500/60' : 'bg-brand-500/60'}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export default function NotificationToast() {
  const { toasts } = useToastStore();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast, i) => (
        <ToastCard key={toast.id} toast={toast} compact={i < toasts.length - 1} />
      ))}
    </div>
  );
}
