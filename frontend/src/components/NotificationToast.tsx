import { useToastStore } from '../store/toastStore';
import { X, Bell, MessageSquare, Paperclip, AtSign } from 'lucide-react';

const TYPE_ICON: Record<string, React.ElementType> = {
  mention: AtSign,
  comment_added: MessageSquare,
  attachment_uploaded: Paperclip,
  chat_message: MessageSquare,
};

function ToastIcon({ type }: { type: string }) {
  const Icon = TYPE_ICON[type] || Bell;
  return <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />;
}

export default function NotificationToast() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-start gap-3 min-w-[280px] max-w-[360px] bg-surface-800 border border-surface-700/60 shadow-2xl rounded-xl px-4 py-3 animate-scale-in"
        >
          <div className="text-brand-400 mt-0.5">
            <ToastIcon type={toast.type} />
          </div>
          <p className="flex-1 text-sm text-surface-200 leading-snug">{toast.message}</p>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-surface-500 hover:text-surface-300 transition-colors flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
