import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { chatApi } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { ChatMessage } from '../../types';
import { Send, MessageSquare, Smile } from 'lucide-react';

const EMOJIS = ['👍', '👎', '😄', '😢', '🎉', '🔥', '❤️', '🚀', '👏', '✅', '❌', '💡', '⭐', '🙏', '😂'];

export default function ChatPage() {
  const [message, setMessage] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const { data, isLoading } = useQuery({
    queryKey: ['chat'],
    queryFn: () => chatApi.getMessages(100),
    refetchInterval: 5000,
  });
  const messages: ChatMessage[] = data?.data || [];

  const sendMutation = useMutation({
    mutationFn: (msg: string) => chatApi.sendMessage(msg),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat'] });
      setMessage('');
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) sendMutation.mutate(message.trim());
  };

  const addEmoji = (emoji: string) => {
    setMessage((m) => m + emoji);
    setShowEmoji(false);
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateSep = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Group messages by date
  let lastDate = '';

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center">
          <MessageSquare className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Team Chat</h1>
          <p className="text-xs text-surface-500">Real-time team communication</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto glass rounded-2xl p-4 mb-4 space-y-1">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-surface-500">
            <MessageSquare className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isOwn = msg.user_id === user?.id;
            const msgDate = formatDateSep(msg.created_at);
            const showDate = msgDate !== lastDate;
            lastDate = msgDate;
            const senderName = msg.user?.name || msg.user_name || 'Unknown';

            return (
              <div key={msg.id || idx}>
                {showDate && (
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-surface-700/50" />
                    <span className="text-xs text-surface-500 font-medium">{msgDate}</span>
                    <div className="flex-1 h-px bg-surface-700/50" />
                  </div>
                )}
                <div className={`flex gap-3 mb-3 ${isOwn ? 'flex-row-reverse' : ''}`}>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-purple-500 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                    {senderName.charAt(0).toUpperCase()}
                  </div>
                  <div className={`max-w-[70%] ${isOwn ? 'text-right' : ''}`}>
                    <div className="flex items-center gap-2 mb-0.5" style={{ justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
                      <span className="text-xs font-medium text-surface-300">{senderName}</span>
                      <span className="text-xs text-surface-600">{formatTime(msg.created_at)}</span>
                    </div>
                    <div
                      className={`inline-block px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
                        isOwn
                          ? 'bg-brand-600 text-white rounded-br-md'
                          : 'bg-surface-700/80 text-surface-200 rounded-bl-md'
                      }`}
                    >
                      {msg.message}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2 relative">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowEmoji(!showEmoji)}
            className="btn-ghost p-2.5 rounded-xl"
          >
            <Smile className="w-5 h-5" />
          </button>
          {showEmoji && (
            <div className="absolute bottom-full mb-2 left-0 glass rounded-xl p-3 grid grid-cols-5 gap-2 animate-scale-in z-10">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => addEmoji(e)}
                  className="text-xl hover:scale-125 transition-transform p-1"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1"
        />
        <button type="submit" disabled={!message.trim() || sendMutation.isPending} className="btn-primary px-4 rounded-xl">
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
