import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { chatApi } from '../api/services';
import { useAuthStore } from '../store/authStore';
import { useWsEvents } from '../hooks/useWsEvents';
import { RootStackParamList } from '../navigation';

interface ChatMessage {
  id: number;
  user_id: number;
  user_name: string;
  message: string;
  created_at: string;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// Render message text with @[Name] mentions highlighted in indigo
function MessageText({ text, style }: { text: string; style?: object }) {
  const parts = text.split(/(@\[[^\]]+\])/g);
  return (
    <Text style={style}>
      {parts.map((part, i) => {
        const match = part.match(/^@\[([^\]]+)\]$/);
        if (match) {
          return (
            <Text key={i} style={s.mention}>@{match[1]}</Text>
          );
        }
        return <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
}

export default function TeamChatScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = useAuthStore((st) => st.user);

  const [messages, setMessages]     = useState<ChatMessage[]>([]);
  const [loading, setLoading]       = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]       = useState(false);
  const [oldestCursor, setOldestCursor] = useState<number | undefined>();
  const [input, setInput]           = useState('');
  const [sending, setSending]       = useState(false);

  const listRef = useRef<FlatList<ChatMessage>>(null);

  // ── Initial load ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const res = await chatApi.getMessages(50);
      const data: ChatMessage[] = res.data?.data || [];
      setMessages(data);
      setHasMore(res.data?.has_more || false);
      if (data.length > 0) {
        setOldestCursor(data[0].id); // oldest is first after backend reversal
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Scroll to end after initial load
  useEffect(() => {
    if (!loading && messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100);
    }
  }, [loading]);

  // ── Load older messages ──────────────────────────────────────────────────────
  const loadMore = async () => {
    if (loadingMore || !hasMore || !oldestCursor) return;
    setLoadingMore(true);
    try {
      const res = await chatApi.getMessages(50, oldestCursor);
      const older: ChatMessage[] = res.data?.data || [];
      if (older.length > 0) {
        setMessages((prev) => [...older, ...prev]);
        setHasMore(res.data?.has_more || false);
        setOldestCursor(older[0].id);
      }
    } catch {}
    setLoadingMore(false);
  };

  // ── Real-time new messages via WS ────────────────────────────────────────────
  const onChatMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      // Avoid duplicates (e.g. own message already added optimistically)
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  }, []);

  useWsEvents({ onChatMessage });

  // ── Send message ─────────────────────────────────────────────────────────────
  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);

    // Optimistic append
    const optimistic: ChatMessage = {
      id:         Date.now(), // temp id
      user_id:    user?.id || 0,
      user_name:  user?.name || 'You',
      message:    text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      const res = await chatApi.sendMessage(text);
      // Replace optimistic message with real one from server
      const real: ChatMessage = {
        id:         res.data?.id || optimistic.id,
        user_id:    res.data?.user_id || optimistic.user_id,
        user_name:  res.data?.user_name || optimistic.user_name,
        message:    text,
        created_at: res.data?.created_at || optimistic.created_at,
      };
      setMessages((prev) =>
        prev.map((m) => m.id === optimistic.id ? real : m)
      );
    } catch {
      // Remove optimistic on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(text); // restore input
    }
    setSending(false);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  const renderItem = ({ item, index }: { item: ChatMessage; index: number }) => {
    const isMe = item.user_id === user?.id;
    const prevMsg = index > 0 ? messages[index - 1] : null;
    const showName = !isMe && (
      !prevMsg || prevMsg.user_id !== item.user_id
    );

    return (
      <View style={[s.msgRow, isMe && s.msgRowMe]}>
        <View style={[s.bubble, isMe ? s.bubbleMe : s.bubbleThem]}>
          {showName && (
            <Text style={s.senderName}>{item.user_name}</Text>
          )}
          <MessageText
            text={item.message}
            style={[s.msgText, isMe && s.msgTextMe]}
          />
          <Text style={[s.msgTime, isMe && s.msgTimeMe]}>
            {formatTime(item.created_at)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.screen}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={s.title}>💬  Team Chat</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Message list */}
        {loading ? (
          <View style={s.center}>
            <ActivityIndicator color="#6366F1" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => String(m.id)}
            contentContainerStyle={s.listContent}
            onScrollToIndexFailed={() => {}}
            ListHeaderComponent={
              hasMore ? (
                <TouchableOpacity onPress={loadMore} style={s.loadMoreBtn} disabled={loadingMore}>
                  {loadingMore
                    ? <ActivityIndicator size="small" color="#6366F1" />
                    : <Text style={s.loadMoreText}>Load older messages</Text>
                  }
                </TouchableOpacity>
              ) : null
            }
            ListEmptyComponent={
              <View style={s.emptyWrap}>
                <Text style={{ fontSize: 36 }}>💬</Text>
                <Text style={s.emptyText}>No messages yet. Say hi!</Text>
              </View>
            }
            renderItem={renderItem}
          />
        )}

        {/* Input row */}
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            placeholder="Message team…"
            placeholderTextColor="#4B5563"
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={2000}
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[s.sendBtn, (!input.trim() || sending) && s.sendBtnDisabled]}
            onPress={send}
            disabled={!input.trim() || sending}
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={s.sendText}>↑</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0D14' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#1E2535',
  },
  backBtn:  { padding: 4 },
  backIcon: { fontSize: 22, color: '#94A3B8' },
  title:    { fontSize: 17, fontWeight: '700', color: '#F1F5F9' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  listContent: { paddingVertical: 12, paddingHorizontal: 12, gap: 4 },

  loadMoreBtn: {
    alignSelf: 'center', marginBottom: 12,
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 99, borderWidth: 1, borderColor: '#1E2535',
  },
  loadMoreText: { fontSize: 12, color: '#64748B' },

  emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyText: { fontSize: 14, color: '#64748B' },

  // Message bubbles
  msgRow:   { flexDirection: 'row', marginVertical: 2 },
  msgRowMe: { justifyContent: 'flex-end' },

  bubble: {
    maxWidth: '78%',
    borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  bubbleThem: {
    backgroundColor: '#141824',
    borderBottomLeftRadius: 4,
  },
  bubbleMe: {
    backgroundColor: '#4F46E5',
    borderBottomRightRadius: 4,
  },

  senderName: {
    fontSize: 11, fontWeight: '700', color: '#818CF8',
    marginBottom: 3,
  },
  msgText:    { fontSize: 14, color: '#E2E8F0', lineHeight: 20 },
  msgTextMe:  { color: '#fff' },
  mention:    { color: '#818CF8', fontWeight: '600' },
  msgTime:    { fontSize: 10, color: '#64748B', marginTop: 4, alignSelf: 'flex-end' },
  msgTimeMe:  { color: 'rgba(255,255,255,0.5)' },

  // Input
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#1E2535',
    backgroundColor: '#0A0D14',
  },
  input: {
    flex: 1,
    minHeight: 40, maxHeight: 120,
    backgroundColor: '#141824',
    borderRadius: 12,
    borderWidth: 1, borderColor: '#1E2535',
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 14, color: '#E2E8F0',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#6366F1',
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendText: { fontSize: 18, color: '#fff', fontWeight: '700' },
});
