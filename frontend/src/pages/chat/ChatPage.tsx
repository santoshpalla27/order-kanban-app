import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { chatApi } from '../../api/client';
import { formatDate, formatTime } from '../../utils/date';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';
import { ChatMessage } from '../../types';
import { Send, Smile, Users, Hash, ChevronUp } from 'lucide-react';
import MentionInput, { renderWithMentions, MentionInputHandle } from '../../components/MentionInput';

const EMOJIS = ['👍', '👎', '😄', '😢', '🎉', '🔥', '❤️', '🚀', '👏', '✅', '❌', '💡', '⭐', '🙏', '😂'];

const AVATAR_COLORS = [
  'from-pink-500 to-rose-500',
  'from-orange-400 to-amber-500',
  'from-emerald-500 to-teal-500',
  'from-cyan-500 to-blue-500',
  'from-violet-500 to-purple-500',
  'from-fuchsia-500 to-pink-500',
  'from-lime-500 to-green-500',
  'from-red-500 to-orange-500',
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const PAGE_SIZE = 50;

export default function ChatPage() {
  const [message, setMessage] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const initialScrollDone = useRef(false);
  const inputRef = useRef<MentionInputHandle>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const clearUnreadChat = useChatStore((s) => s.clear);

  // Clear the unread badge the moment the user opens this page.
  useEffect(() => { clearUnreadChat(); }, [clearUnreadChat]);

  // Older history loaded via "Load older" button
  const [olderMessages, setOlderMessages] = useState<ChatMessage[]>([]);
  const [olderCursor, setOlderCursor] = useState<number | null>(null);
  const [hasOlderHistory, setHasOlderHistory] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderInitialised, setOlderInitialised] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['chat'],
    queryFn: () => chatApi.getMessages(PAGE_SIZE),
    refetchInterval: 5000,
  });

  const latestMessages: ChatMessage[] = data?.data?.data ?? [];

  // On first load, initialise older-history cursor from the latest page
  useEffect(() => {
    if (!olderInitialised && data?.data) {
      const page = data.data;
      if (page.has_more && page.next_cursor != null) {
        setOlderCursor(page.next_cursor);
        setHasOlderHistory(true);
      }
      setOlderInitialised(true);
    }
  }, [data, olderInitialised]);

  // De-duplicate: olderMessages may overlap with latestMessages after a refetch
  const allMessages = (() => {
    const latestIds = new Set(latestMessages.map(m => m.id));
    const unique = olderMessages.filter(m => !latestIds.has(m.id));
    return [...unique, ...latestMessages];
  })();

  const loadOlderMessages = useCallback(async () => {
    if (!olderCursor || loadingOlder) return;
    const container = messagesContainerRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;

    setLoadingOlder(true);
    try {
      const res = await chatApi.getMessages(PAGE_SIZE, olderCursor);
      const page = res.data;
      setOlderMessages(prev => [...page.data, ...prev]);
      if (page.has_more && page.next_cursor != null) {
        setOlderCursor(page.next_cursor);
        setHasOlderHistory(true);
      } else {
        setOlderCursor(null);
        setHasOlderHistory(false);
      }
      // Restore scroll position after prepend
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - prevScrollHeight;
        }
      });
    } finally {
      setLoadingOlder(false);
    }
  }, [olderCursor, loadingOlder]);

  const sendMutation = useMutation({
    mutationFn: (msg: string) => chatApi.sendMessage(msg),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat'] });
      setMessage('');
    },
  });

  const lastMessageId = allMessages[allMessages.length - 1]?.id;
  useEffect(() => {
    if (!lastMessageId) return;
    if (!initialScrollDone.current) {
      initialScrollDone.current = true;
      messagesEndRef.current?.scrollIntoView();
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lastMessageId]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (message.trim()) sendMutation.mutate(message.trim());
  };

  const addEmoji = (emoji: string) => {
    setMessage((m) => m + emoji);
    setShowEmoji(false);
    inputRef.current?.focus();
  };

  const formatTime = (dateStr: string) =>
    formatTime(dateStr);

  const formatDateSep = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return formatDate(d);
  };

  // Pre-process messages: compute grouping info
  let lastDate = '';
  const processed = allMessages.map((msg, idx) => {
    const isOwn = msg.user_id === user?.id;
    const senderName = msg.user?.name || msg.user_name || 'Unknown';
    const msgDate = formatDateSep(msg.created_at);
    const showDate = msgDate !== lastDate;
    lastDate = msgDate;
    const prev = allMessages[idx - 1];
    const next = allMessages[idx + 1];
    const sameDay = (a: ChatMessage, b: ChatMessage) =>
      formatDateSep(a.created_at) === formatDateSep(b.created_at);
    const isFirst = !prev || prev.user_id !== msg.user_id || !sameDay(prev, msg);
    const isLast = !next || next.user_id !== msg.user_id || !sameDay(next, msg);
    return { msg, isOwn, senderName, msgDate, showDate, isFirst, isLast };
  });

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">

      {/* Header */}
      <div className="glass rounded-xl px-4 py-2.5 mb-3 flex items-center justify-center gap-2.5 border border-surface-700/40 relative">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow shadow-brand-500/20">
          <Hash className="w-4 h-4 text-white" />
        </div>
        <div className="text-center">
          <h2 className="text-base font-semibold tracking-tight text-surface-100">Team Chat</h2>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto rounded-2xl px-4 py-3 mb-3 bg-surface-900/50 border border-surface-700/30"
      >
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
          </div>
        ) : allMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-surface-500 gap-4">
            <div className="w-20 h-20 rounded-full bg-surface-800/80 border border-surface-700/50 flex items-center justify-center">
              <Users className="w-9 h-9 opacity-30" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-surface-400">No messages yet</p>
              <p className="text-xs text-surface-600 mt-1">Start the conversation!</p>
            </div>
          </div>
        ) : (
          <div className="space-y-0.5">
            {/* Load older button */}
            {hasOlderHistory && (
              <div className="flex justify-center pb-4">
                <button
                  onClick={loadOlderMessages}
                  disabled={loadingOlder}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-surface-800/80 border border-surface-700/50 text-surface-400 hover:text-surface-200 hover:border-surface-600 transition-colors disabled:opacity-50"
                >
                  {loadingOlder ? (
                    <div className="w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                  ) : (
                    <ChevronUp className="w-3 h-3" />
                  )}
                  {loadingOlder ? 'Loading…' : 'Load older messages'}
                </button>
              </div>
            )}

            {processed.map(({ msg, isOwn, senderName, showDate, isFirst, isLast }, idx) => (
              <div key={msg.id || idx}>
                {/* Date separator */}
                {showDate && (
                  <div className="flex items-center gap-3 my-5">
                    <div className="flex-1 h-px bg-surface-700/40" />
                    <span className="text-[11px] text-surface-400 font-medium bg-surface-800/80 px-3 py-1 rounded-full border border-surface-700/40 tracking-wide">
                      {formatDateSep(msg.created_at)}
                    </span>
                    <div className="flex-1 h-px bg-surface-700/40" />
                  </div>
                )}

                {/* Message row */}
                <div className={`group flex items-end gap-2 w-full ${isOwn ? 'justify-end' : 'justify-start'} ${isLast ? 'mb-2' : 'mb-0.5'}`}>

                  {/* Avatar (others only) */}
                  {!isOwn && (
                    <div className="w-7 flex-shrink-0 self-end mb-0.5">
                      {isLast ? (
                        <div
                          title={senderName}
                          className={`w-7 h-7 rounded-full bg-gradient-to-br ${getAvatarColor(senderName)} flex items-center justify-center text-[10px] font-bold text-white shadow-sm`}
                        >
                          {senderName.charAt(0).toUpperCase()}
                        </div>
                      ) : (
                        <div className="w-7 h-7" />
                      )}
                    </div>
                  )}

                  {/* Bubble Container */}
                  <div className={`flex flex-col max-w-[85%] lg:max-w-[65%] ${isOwn ? 'items-end' : 'items-start'}`}>

                    {/* Sender name (others, first in group only) */}
                    {!isOwn && isFirst && (
                      <span className={`text-[11px] font-medium mb-1 px-1 bg-gradient-to-r ${getAvatarColor(senderName)} bg-clip-text text-transparent`}>
                        {senderName}
                      </span>
                    )}

                    {/* Bubble */}
                    <div
                      className={`relative px-3.5 py-2 shadow-sm ${
                        isOwn
                          ? 'bg-brand-600 text-white rounded-2xl' + (isFirst ? ' rounded-tr-sm' : '')
                          : 'bg-surface-800 text-surface-200 border border-surface-700/50 rounded-2xl' + (isFirst ? ' rounded-tl-sm' : '')
                      }`}
                    >
                      <p className={`text-sm whitespace-pre-wrap ${isOwn ? 'text-white/95' : 'text-surface-200'}`}>
                        {renderWithMentions(msg.message, user?.name, (id) => navigate(`/?product=${id}`))}
                        <span className={`float-right ml-3 mt-1.5 text-[9px] translate-y-0.5 ${isOwn ? 'text-white/60' : 'text-surface-500'}`}>
                          {formatTime(msg.created_at)}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 glass rounded-2xl px-3 py-2 border border-surface-700/40"
      >
        {/* Emoji picker */}
        <div className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setShowEmoji(!showEmoji)}
            className={`p-2 rounded-xl transition-colors ${showEmoji ? 'text-brand-400 bg-brand-500/10' : 'text-surface-400 hover:text-surface-200 hover:bg-surface-700/50'}`}
          >
            <Smile className="w-5 h-5" />
          </button>
          {showEmoji && (
            <div className="absolute bottom-full mb-2 left-0 glass rounded-2xl p-3 grid grid-cols-5 gap-1.5 animate-scale-in z-10 shadow-2xl border border-surface-700/50 min-w-[200px]">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => addEmoji(e)}
                  className="text-xl hover:scale-125 transition-transform p-1.5 rounded-lg hover:bg-surface-700/50"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Text input with @mention support */}
        <MentionInput
          ref={inputRef}
          value={message}
          onChange={setMessage}
          onSubmit={handleSubmit}
          placeholder="Type a message... (@name to mention)"
          className="bg-transparent border-none outline-none text-sm placeholder:text-surface-500"
        />

        {/* Send button */}
        <button
          type="submit"
          disabled={!message.trim() || sendMutation.isPending}
          className="w-9 h-9 rounded-full bg-brand-600 hover:bg-brand-500 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all flex-shrink-0 shadow-md shadow-brand-900/30"
        >
          <Send className="w-4 h-4 text-white" />
        </button>
      </form>
    </div>
  );
}
