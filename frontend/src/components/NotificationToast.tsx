import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToastStore, Toast } from '../store/toastStore';
import { commentsApi, chatApi } from '../api/client';
import { X, Send, MessageSquare } from 'lucide-react';

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

function ToastCard({ toast }: { toast: Toast }) {
  const { removeToast } = useToastStore();
  const navigate = useNavigate();
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const isChat = toast.entityType === 'chat';
  const canReply = toast.entityType === 'product' || isChat;
  const senderInitials = toast.senderName ? initials(toast.senderName) : '?';
  const colorClass = toast.senderName ? avatarColor(toast.senderName) : 'bg-surface-600';

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
    <div className={`pointer-events-auto flex flex-col w-[340px] bg-surface-800 shadow-2xl rounded-xl overflow-hidden animate-scale-in ${
      isChat
        ? 'border border-teal-500/50'
        : 'border border-surface-700/60'
    }`}>

      {/* Coloured top stripe — teal for chat, brand for everything else */}
      <div className={`h-0.5 w-full ${isChat ? 'bg-gradient-to-r from-teal-400 to-emerald-400' : 'bg-gradient-to-r from-brand-500 to-brand-400'}`} />

      {/* Header: avatar + sender name + action text + close */}
      <div className="flex items-start gap-2.5 px-3 pt-3 pb-2">
        {/* Avatar — chat shows chat icon badge overlay */}
        <div className="relative flex-shrink-0">
          <div className={`w-8 h-8 rounded-full ${colorClass} flex items-center justify-center text-white text-xs font-bold`}>
            {senderInitials}
          </div>
          {isChat && (
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-teal-500 flex items-center justify-center">
              <MessageSquare className="w-2.5 h-2.5 text-white" />
            </div>
          )}
        </div>

        {/* Text */}
        <div
          className={`flex-1 min-w-0 ${toast.link ? 'cursor-pointer' : ''}`}
          onClick={toast.link ? handleOpen : undefined}
        >
          <div className="flex items-center gap-1.5">
            {toast.senderName && (
              <p className="text-xs font-semibold text-surface-100 leading-tight truncate">
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

        {/* Close */}
        <button
          onClick={() => removeToast(toast.id)}
          className="flex-shrink-0 text-surface-500 hover:text-surface-300 transition-colors p-0.5 rounded mt-0.5"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Message bubble */}
      {toast.content && (
        <div
          className={`mx-3 mb-2 px-3 py-2 rounded-lg border ${
            isChat
              ? 'bg-teal-500/10 border-teal-500/20 cursor-pointer'
              : `bg-surface-700/50 border-surface-700/40 ${toast.link ? 'cursor-pointer' : ''}`
          }`}
          onClick={toast.link ? handleOpen : undefined}
        >
          <p className="text-sm text-surface-200 leading-relaxed break-words">{toast.content}</p>
        </div>
      )}

      {/* Inline reply */}
      {canReply && (
        <div className="flex items-center gap-2 px-3 pb-3 pt-1">
          <input
            type="text"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Reply…"
            className={`flex-1 text-sm bg-surface-700/60 border rounded-lg px-3 py-1.5 text-surface-200 placeholder-surface-500 outline-none transition-colors ${
              isChat
                ? 'border-surface-600/50 focus:border-teal-500/60'
                : 'border-surface-600/50 focus:border-brand-500/60'
            }`}
          />
          <button
            onClick={handleSend}
            disabled={!reply.trim() || sending}
            className={`flex-shrink-0 p-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors ${
              isChat ? 'bg-teal-600 hover:bg-teal-500' : 'bg-brand-600 hover:bg-brand-500'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Open link for non-replyable toasts */}
      {!canReply && toast.link && (
        <div className="px-3 pb-3 pt-1">
          <button
            onClick={handleOpen}
            className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
          >
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
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
