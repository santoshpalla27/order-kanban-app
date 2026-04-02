import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, ScrollView, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { chatApi, usersApi, productsApi } from '../api/services';
import { useAuthStore } from '../store/authStore';
import { useWsEvents } from '../hooks/useWsEvents';
import { useNotificationStore } from '../store/notificationStore';
import { RootStackParamList } from '../navigation';
import { useThemeStore } from '../store/themeStore';
import { darkColors, lightColors, ThemeColors } from '../theme';
import { Feather } from '@expo/vector-icons';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: number;
  user_id: number;
  user_name?: string;
  user?: { id: number; name: string };
  message: string;
  created_at: string;
}

interface UserItem {
  id: number;
  name: string;
}

interface OrderItem {
  id: number;
  product_id: string;   // display ID e.g. "ABC123"
  customer_name: string;
}

type MentionEntry =
  | { kind: 'user';  item: UserItem  }
  | { kind: 'order'; item: OrderItem };

interface Processed {
  msg: ChatMessage;
  isOwn: boolean;
  isFirst: boolean;   // first in a consecutive group from same sender
  isLast: boolean;    // last in a consecutive group from same sender
  showDate: boolean;
  dateLabel: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const EMOJIS = ['👍','👎','😄','😢','🎉','🔥','❤️','🚀','👏','✅','❌','💡','⭐','🙏','😂'];

const AVATAR_COLORS = [
  '#EC4899', '#F97316', '#10B981', '#06B6D4',
  '#8B5CF6', '#D946EF', '#84CC16', '#EF4444',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAvatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit',
  });
}

function processMessages(msgs: ChatMessage[], myId?: number): Processed[] {
  let lastDate = '';
  return msgs.map((msg, idx) => {
    const isOwn     = msg.user_id === myId;
    const dateLabel = formatDateLabel(msg.created_at);
    const showDate  = dateLabel !== lastDate;
    lastDate = dateLabel;

    const prev = msgs[idx - 1];
    const next = msgs[idx + 1];
    const isFirst = !prev || prev.user_id !== msg.user_id ||
      formatDateLabel(prev.created_at) !== dateLabel;
    const isLast  = !next || next.user_id !== msg.user_id ||
      formatDateLabel(next.created_at) !== formatDateLabel(msg.created_at);

    return { msg, isOwn, isFirst, isLast, showDate, dateLabel };
  });
}

// ─── Mention-aware text renderer ──────────────────────────────────────────────

function MsgText({
  text, isOwn, onOrderPress, st,
}: {
  text: string;
  isOwn: boolean;
  onOrderPress?: (id: number) => void;
  st: ReturnType<typeof makeStyles>;
}) {
  // Split on both @[Name] and @{id:PROD-ID} tokens
  const parts = text.split(/(@\[[^\]]+\]|@\{\d+:[^}]+\})/g);
  return (
    <Text style={[st.msgText, isOwn && st.msgTextOwn]}>
      {parts.map((part, i) => {
        const userM  = part.match(/^@\[([^\]]+)\]$/);
        const orderM = part.match(/^@\{(\d+):([^}]+)\}$/);
        if (userM) {
          return (
            <Text key={i} style={[st.mention, isOwn && st.mentionOwn]}>
              @{userM[1]}
            </Text>
          );
        }
        if (orderM) {
          return (
            <Text
              key={i}
              style={st.orderMention}
              onPress={() => onOrderPress?.(Number(orderM[1]))}
            >
              @{orderM[2]}
            </Text>
          );
        }
        return <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function TeamChatScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user       = useAuthStore((s) => s.user);

  // Suppress chat notification toasts while this screen is active
  useEffect(() => {
    useNotificationStore.getState().setChatScreenActive(true);
    useNotificationStore.getState().setUnreadChatCount(0);
    return () => { useNotificationStore.getState().setChatScreenActive(false); };
  }, []);

  const isDark = useThemeStore((s) => s.isDark);
  const c = isDark ? darkColors : lightColors;
  const st = useMemo(() => makeStyles(c), [c]);

  // ── State ──────────────────────────────────────────────────────────────────
  const [messages,     setMessages]     = useState<ChatMessage[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [hasMore,      setHasMore]      = useState(false);
  const [cursor,       setCursor]       = useState<number | undefined>();

  const [input,        setInput]        = useState('');
  const [sending,      setSending]      = useState(false);
  const [showEmoji,    setShowEmoji]    = useState(false);
  // After a mention is inserted we want the cursor right after the token.
  // We store the target position in a ref (avoids triggering re-renders) and
  // apply it via state only once the TextInput has re-focused.
  const pendingCursor = useRef<{ start: number; end: number } | null>(null);
  const [forcedCursor, setForcedCursor] = useState<{ start: number; end: number } | undefined>();

  // @mention
  const [allUsers,      setAllUsers]      = useState<UserItem[]>([]);
  const [mentionQuery,  setMentionQuery]  = useState<string | null>(null);
  const [mentionStart,  setMentionStart]  = useState(0);
  const [orderResults,  setOrderResults]  = useState<OrderItem[]>([]);
  const [orderLoading,  setOrderLoading]  = useState(false);
  const orderTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const listRef      = useRef<FlatList<Processed>>(null);
  const inputRef     = useRef<TextInput>(null);
  const didScroll    = useRef(false);
  const keyboardOpen = useRef(false);
  const userScrolled = useRef(false);

  // ── Load users for @mention ────────────────────────────────────────────────
  useEffect(() => {
    usersApi.getList()
      .then((res) => {
        const raw: any[] = Array.isArray(res.data) ? res.data : [];
        setAllUsers(raw.map((u) => ({ id: u.id, name: u.name })));
      })
      .catch(() => {});
  }, []);

  // ── Debounced order search whenever mentionQuery changes ───────────────────
  useEffect(() => {
    if (mentionQuery === null) { setOrderResults([]); return; }
    clearTimeout(orderTimer.current);
    orderTimer.current = setTimeout(async () => {
      setOrderLoading(true);
      try {
        const res = await productsApi.getPaged(
          mentionQuery ? { search: mentionQuery } : undefined, 6,
        );
        const raw: any[] = res.data?.data ?? [];
        setOrderResults(raw.map((p) => ({
          id:            p.id,
          product_id:    p.product_id,
          customer_name: p.customer_name,
        })));
      } catch { setOrderResults([]); }
      setOrderLoading(false);
    }, 250);
    return () => clearTimeout(orderTimer.current);
  }, [mentionQuery]);

  // ── Initial load ───────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const res = await chatApi.getMessages(PAGE_SIZE);
      const data: ChatMessage[] = res.data?.data || [];
      setMessages(data);
      setHasMore(res.data?.has_more || false);
      if (res.data?.next_cursor != null) setCursor(res.data.next_cursor);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Scroll to bottom on first load
  useEffect(() => {
    if (!loading && messages.length > 0 && !didScroll.current) {
      didScroll.current = true;
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 150);
    }
  }, [loading, messages.length]);

  // Scroll to bottom when keyboard opens so latest message stays visible
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      keyboardOpen.current = true;
      setTimeout(() => {
        if (!userScrolled.current) {
          listRef.current?.scrollToEnd({ animated: false });
        }
      }, 50);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      keyboardOpen.current = false;
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // ── Load older ─────────────────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !cursor) return;
    setLoadingMore(true);
    try {
      const res  = await chatApi.getMessages(PAGE_SIZE, cursor);
      const data: ChatMessage[] = res.data?.data || [];
      if (data.length) {
        setMessages((prev) => [...data, ...prev]);
        setHasMore(res.data?.has_more || false);
        if (res.data?.next_cursor != null) setCursor(res.data.next_cursor);
        else setHasMore(false);
      }
    } catch {}
    setLoadingMore(false);
  }, [loadingMore, hasMore, cursor]);

  // ── Real-time WS ───────────────────────────────────────────────────────────
  const onChatMessage = useCallback((msg: any) => {
    setMessages((prev) => {
      // Already have this real server id — skip (handles API-before-WS case)
      if (prev.some((m) => m.id === msg.id)) return prev;

      // Our own message: the optimistic placeholder has a negative id.
      // Replace it directly so we never have two copies.
      if (msg.user_id === user?.id) {
        const optIdx = prev.findIndex((m) => m.id < 0);
        if (optIdx >= 0) {
          const next = [...prev];
          next[optIdx] = msg as ChatMessage;
          return next;
        }
      }

      return [...prev, msg as ChatMessage];
    });
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, [user?.id]);

  useWsEvents({ onChatMessage });

  // ── @mention ───────────────────────────────────────────────────────────────
  // NOTE: onSelectionChange fires AFTER onChangeText in React Native, so
  // selection.current is always stale here. Scan text directly instead.
  const handleInputChange = (text: string) => {
    setInput(text);
    const atIdx = text.lastIndexOf('@');

    if (atIdx !== -1) {
      const query = text.slice(atIdx + 1);
      // Skip if cursor is inside an already-inserted mention token
      if (
        !query.includes('[') && !query.includes(']') &&
        !query.includes('{') && !query.includes('}') &&
        query.length <= 30
      ) {
        setMentionStart(atIdx);
        setMentionQuery(query);
        return;
      }
    }
    setMentionQuery(null);
  };

  const selectUser = (u: UserItem) => {
    const mentionEnd = mentionStart + 1 + (mentionQuery?.length ?? 0);
    const before     = input.slice(0, mentionStart);
    const after      = input.slice(mentionEnd);
    const inserted   = `@[${u.name}] `;
    const newPos     = mentionStart + inserted.length;
    setInput(`${before}${inserted}${after}`);
    setMentionQuery(null);
    // Store target — applied in onFocus once TextInput has re-focused
    pendingCursor.current = { start: newPos, end: newPos };
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const selectOrder = (p: OrderItem) => {
    const mentionEnd = mentionStart + 1 + (mentionQuery?.length ?? 0);
    const before     = input.slice(0, mentionStart);
    const after      = input.slice(mentionEnd);
    const token      = `@{${p.id}:${p.product_id}} `;
    const newPos     = mentionStart + token.length;
    setInput(`${before}${token}${after}`);
    setMentionQuery(null);
    pendingCursor.current = { start: newPos, end: newPos };
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // Unified mention entries: users first, then orders
  const mentionEntries = useMemo((): MentionEntry[] => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    const users: MentionEntry[] = allUsers
      .filter((u) => u.name.toLowerCase().includes(q) && u.id !== user?.id)
      .slice(0, 5)
      .map((u) => ({ kind: 'user', item: u }));
    const orders: MentionEntry[] = orderResults
      .map((p) => ({ kind: 'order', item: p }));
    return [...users, ...orders];
  }, [mentionQuery, allUsers, orderResults, user?.id]);

  const showMentionDropdown = mentionQuery !== null &&
    (mentionEntries.length > 0 || orderLoading);

  // ── Send ───────────────────────────────────────────────────────────────────
  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setMentionQuery(null);
    setShowEmoji(false);
    setSending(true);

    const opt: ChatMessage = {
      id:         -(Date.now()),
      user_id:    user?.id || 0,
      user_name:  user?.name || 'You',
      message:    text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, opt]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);

    try {
      const res  = await chatApi.sendMessage(text);
      const real: ChatMessage = {
        id:         res.data?.id         ?? opt.id,
        user_id:    res.data?.user_id    ?? opt.user_id,
        user_name:  res.data?.user_name  ?? opt.user_name,
        message:    text,
        created_at: res.data?.created_at ?? opt.created_at,
      };
      setMessages((prev) => prev.map((m) => m.id === opt.id ? real : m));
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== opt.id));
      setInput(text);
    }
    setSending(false);
  };

  // ── Processed list ─────────────────────────────────────────────────────────
  const processed = useMemo(
    () => processMessages(messages, user?.id),
    [messages, user?.id],
  );

  // ── Render message ─────────────────────────────────────────────────────────
  const renderItem = useCallback(({ item }: { item: Processed }) => {
    const { msg, isOwn, isFirst, isLast, showDate, dateLabel } = item;
    const name  = msg.user_name || msg.user?.name || 'Unknown';
    const color = getAvatarColor(name);

    return (
      <View>
        {/* ── Date separator ─────────────────────────────────────────────── */}
        {showDate && (
          <View style={st.dateSep}>
            <View style={st.dateLine} />
            <Text style={st.dateLabel}>{dateLabel}</Text>
            <View style={st.dateLine} />
          </View>
        )}

        {/* ── Message row ────────────────────────────────────────────────── */}
        <View style={[
          st.row,
          isOwn  ? st.rowOwn   : st.rowOther,
          isLast ? st.rowLast  : st.rowTight,
        ]}>

          {/* Avatar (left side, others only) */}
          {!isOwn && (
            <View style={st.avatarSlot}>
              {isLast
                ? <View style={[st.avatar, { backgroundColor: color }]}>
                    <Text style={st.avatarInitial}>{name.charAt(0).toUpperCase()}</Text>
                  </View>
                : <View style={st.avatarEmpty} />
              }
            </View>
          )}

          {/* Bubble column */}
          <View style={[st.col, isOwn && st.colOwn]}>

            {/* Sender name (others, first in group) */}
            {!isOwn && isFirst && (
              <Text style={[st.senderName, { color }]}>{name}</Text>
            )}

            {/* Bubble */}
            <View style={[
              st.bubble,
              isOwn ? st.bubbleOwn : st.bubbleOther,
              isOwn  && isFirst && st.bubbleOwnFirst,
              !isOwn && isFirst && st.bubbleOtherFirst,
            ]}>
              <MsgText
                text={msg.message}
                isOwn={isOwn}
                onOrderPress={(id) => navigation.navigate('ProductDetail', { productId: id })}
                st={st}
              />
              <Text style={[st.timestamp, isOwn && st.timestampOwn]}>
                {formatTime(msg.created_at)}
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  }, [st]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={st.screen}>

      {/* ── Header ── */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
          <Feather name="arrow-left" size={24} color={c.textSec} style={{ marginTop: 2 }} />
        </TouchableOpacity>

        <View style={st.hashPill}>
          <Feather name="hash" size={18} color="#fff" />
        </View>

        <View style={st.headerInfo}>
          <Text style={st.headerTitle}>Team Chat</Text>
          <Text style={st.headerSub}>All members</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={st.flex}
        behavior="padding"
      >
        {/* ── Messages ── */}
        {loading ? (
          <View style={st.center}>
            <ActivityIndicator color={c.brand} size="large" />
            <Text style={st.loadingHint}>Loading messages…</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={processed}
            keyExtractor={(item) => String(item.msg.id)}
            contentContainerStyle={processed.length === 0 ? st.emptyContainer : st.listContent}
            onScrollToIndexFailed={() => {}}
            onLayout={() => {
              if (keyboardOpen.current && !userScrolled.current) {
                listRef.current?.scrollToEnd({ animated: false });
              }
            }}
            onScroll={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
              const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
              userScrolled.current = distanceFromBottom > 80;
            }}
            scrollEventThrottle={100}
            ListHeaderComponent={
              hasMore ? (
                <TouchableOpacity
                  onPress={loadMore}
                  style={st.loadMoreBtn}
                  disabled={loadingMore}
                  activeOpacity={0.7}
                >
                  {loadingMore
                    ? <ActivityIndicator size="small" color={c.brand} />
                    : <>
                        <Feather name="chevron-up" size={14} color={c.textMuted} style={{ marginRight: 4 }} />
                        <Text style={st.loadMoreText}>Load older messages</Text>
                      </>
                  }
                </TouchableOpacity>
              ) : null
            }
            ListEmptyComponent={
              <View style={st.empty}>
                <View style={st.emptyIcon}>
                  <Feather name="message-square" size={32} color={c.textMuted} />
                </View>
                <Text style={st.emptyTitle}>No messages yet</Text>
                <Text style={st.emptySub}>Start the conversation!</Text>
              </View>
            }
            renderItem={renderItem}
          />
        )}

        {/* ── @mention dropdown ── */}
        {showMentionDropdown && (
          <View style={st.mentionBox}>
            {/* Header */}
            <View style={st.mentionHeader}>
              <Text style={st.mentionHeaderText}>MENTION</Text>
            </View>

            {/* People section */}
            {mentionEntries.some((e) => e.kind === 'user') && (
              <View style={st.mentionSection}>
                <Text style={st.mentionSectionLabel}>PEOPLE</Text>
                {mentionEntries
                  .filter((e): e is MentionEntry & { kind: 'user' } => e.kind === 'user')
                  .map((e, idx, arr) => (
                    <TouchableOpacity
                      key={`u-${e.item.id}`}
                      style={[st.mentionRow, idx < arr.length - 1 && st.mentionRowBorder]}
                      onPress={() => selectUser(e.item)}
                      activeOpacity={0.75}
                    >
                      <View style={[st.mentionAvatar, { backgroundColor: getAvatarColor(e.item.name) }]}>
                        <Text style={st.mentionInitial}>{e.item.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <Text style={st.mentionName}>{e.item.name}</Text>
                    </TouchableOpacity>
                  ))
                }
              </View>
            )}

            {/* Orders section */}
            {(orderLoading || mentionEntries.some((e) => e.kind === 'order')) && (
              <View style={[
                st.mentionSection,
                mentionEntries.some((e) => e.kind === 'user') && st.mentionSectionBorder,
              ]}>
                <Text style={[st.mentionSectionLabel, st.mentionSectionLabelOrder]}>ORDERS</Text>
                {orderLoading && mentionEntries.filter((e) => e.kind === 'order').length === 0 ? (
                  <View style={st.mentionOrderLoading}>
                    <ActivityIndicator size="small" color="#F59E0B" />
                  </View>
                ) : (
                  mentionEntries
                    .filter((e): e is MentionEntry & { kind: 'order' } => e.kind === 'order')
                    .map((e, idx, arr) => (
                      <TouchableOpacity
                        key={`o-${e.item.id}`}
                        style={[st.mentionRow, idx < arr.length - 1 && st.mentionRowBorder]}
                        onPress={() => selectOrder(e.item)}
                        activeOpacity={0.75}
                      >
                        <View style={st.mentionOrderIcon}>
                          <Feather name="package" size={14} color="#F59E0B" />
                        </View>
                        <View style={st.mentionOrderInfo}>
                          <Text style={st.mentionOrderId}>{e.item.product_id}</Text>
                          <Text style={st.mentionOrderCustomer} numberOfLines={1}>
                            {e.item.customer_name}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))
                )}
              </View>
            )}
          </View>
        )}

        {/* ── Emoji picker ── */}
        {showEmoji && (
          <View style={st.emojiPanel}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={st.emojiRow}>
                {EMOJIS.map((e) => (
                  <TouchableOpacity
                    key={e}
                    style={st.emojiBtn}
                    onPress={() => {
                      setInput((prev) => prev + e);
                      setShowEmoji(false);
                      setTimeout(() => inputRef.current?.focus(), 50);
                    }}
                  >
                    <Text style={st.emojiText}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* ── Input bar ── */}
        <View style={st.inputBar}>
          {/* Emoji toggle */}
          <TouchableOpacity
            style={[st.inputIconBtn, showEmoji && st.inputIconBtnActive]}
            onPress={() => { setShowEmoji((v) => !v); setMentionQuery(null); }}
            activeOpacity={0.8}
          >
            <Feather name="smile" size={20} color={c.textSec} />
          </TouchableOpacity>

          {/* Text field */}
          <TextInput
            ref={inputRef}
            style={st.textInput}
            placeholder="Message team… (@name to mention)"
            placeholderTextColor={c.textMuted}
            value={input}
            onChangeText={handleInputChange}
            selection={forcedCursor}
            onFocus={() => {
              if (pendingCursor.current) {
                const sel = pendingCursor.current;
                pendingCursor.current = null;
                // Small delay so the TextInput fully settles before repositioning
                setTimeout(() => setForcedCursor(sel), 20);
              }
            }}
            onSelectionChange={() => setForcedCursor(undefined)}
            multiline
            maxLength={2000}
            returnKeyType="default"
            blurOnSubmit={false}
          />

          {/* Send */}
          <TouchableOpacity
            style={[st.sendBtn, (!input.trim() || sending) && st.sendBtnOff]}
            onPress={send}
            disabled={!input.trim() || sending}
            activeOpacity={0.85}
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Feather name="send" size={16} color="#fff" />
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    flex:   { flex: 1 },

    // ── Header ─────────────────────────────────────────────────────────────────
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingVertical: 13,
      borderBottomWidth: 1, borderBottomColor: c.surface2,
      backgroundColor: c.headerBg,
    },
    backBtn:    { padding: 4 },
    backArrow:  { fontSize: 22, color: c.textSec },
    hashPill: {
      width: 38, height: 38, borderRadius: 12,
      backgroundColor: '#4F46E5',
      alignItems: 'center', justifyContent: 'center',
      shadowColor: c.brand, shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.35, shadowRadius: 6, elevation: 4,
    },
    hashText:    { fontSize: 20, color: '#fff', fontWeight: '800' },
    headerInfo:  { flex: 1 },
    headerTitle: { fontSize: 16, fontWeight: '700', color: c.text },
    headerSub:   { fontSize: 11, color: c.textMuted, marginTop: 1 },

    // ── Loading / Empty ─────────────────────────────────────────────────────────
    center:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    loadingHint: { fontSize: 13, color: c.textMuted },

    emptyContainer: { flex: 1, justifyContent: 'center' },
    empty:    { alignItems: 'center', gap: 10, paddingVertical: 60 },
    emptyIcon: {
      width: 72, height: 72, borderRadius: 36,
      backgroundColor: c.card, borderWidth: 1, borderColor: c.surface2,
      alignItems: 'center', justifyContent: 'center',
    },
    emptyTitle: { fontSize: 15, fontWeight: '600', color: c.textSec },
    emptySub:   { fontSize: 12, color: c.textMuted },

    // ── List ───────────────────────────────────────────────────────────────────
    listContent: { paddingTop: 12, paddingBottom: 8, paddingHorizontal: 12 },

    // Load older
    loadMoreBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      alignSelf: 'center', marginBottom: 18,
      paddingHorizontal: 14, paddingVertical: 7,
      borderRadius: 99,
      backgroundColor: c.card,
      borderWidth: 1, borderColor: c.surface2,
    },
    loadMoreArrow: { fontSize: 12, color: c.textMuted },
    loadMoreText:  { fontSize: 12, color: c.textMuted },

    // ── Date separator ─────────────────────────────────────────────────────────
    dateSep: { flexDirection: 'row', alignItems: 'center', marginVertical: 18, gap: 8 },
    dateLine: { flex: 1, height: 1, backgroundColor: c.surface2 },
    dateLabel: {
      fontSize: 11, fontWeight: '600', color: c.textMuted,
      paddingHorizontal: 10, paddingVertical: 3,
      borderRadius: 99, backgroundColor: c.card,
      borderWidth: 1, borderColor: c.surface2,
      overflow: 'hidden',
    },

    // ── Message row ────────────────────────────────────────────────────────────
    row:       { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
    rowOwn:    { justifyContent: 'flex-end' },
    rowOther:  { justifyContent: 'flex-start' },
    rowLast:   { marginBottom: 8 },
    rowTight:  { marginBottom: 2 },

    // Avatar
    avatarSlot:    { width: 30, alignItems: 'center' },
    avatar:        { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    avatarInitial: { fontSize: 11, color: '#fff', fontWeight: '700' },
    avatarEmpty:   { width: 28, height: 28 },

    // Bubble column
    col:    { maxWidth: '78%', alignItems: 'flex-start' },
    colOwn: { alignItems: 'flex-end' },

    senderName: { fontSize: 11, fontWeight: '700', marginBottom: 3, paddingLeft: 2 },

    // Bubble
    bubble: {
      borderRadius: 18,
      paddingHorizontal: 13, paddingVertical: 9,
    },
    bubbleOwn: {
      backgroundColor: '#4F46E5',
      borderBottomRightRadius: 5,
    },
    bubbleOther: {
      backgroundColor: c.card,
      borderWidth: 1, borderColor: c.surface2,
      borderBottomLeftRadius: 5,
    },
    bubbleOwnFirst:   { borderTopRightRadius: 5 },
    bubbleOtherFirst: { borderTopLeftRadius: 5 },

    // Text
    msgText:      { fontSize: 14, color: c.textSec, lineHeight: 20 },
    msgTextOwn:   { color: '#fff' },
    mention:      { color: c.brandLight, fontWeight: '600' },
    mentionOwn:   { color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
    orderMention: { color: '#F59E0B', fontWeight: '600' },

    timestamp:    { fontSize: 10, color: c.textMuted, marginTop: 4, alignSelf: 'flex-end' },
    timestampOwn: { color: 'rgba(255,255,255,0.45)' },

    // ── @mention dropdown ──────────────────────────────────────────────────────
    mentionBox: {
      backgroundColor: c.headerBg,
      borderTopWidth: 1, borderTopColor: c.surface2,
      maxHeight: 280,
    },
    mentionHeader: {
      paddingHorizontal: 14, paddingVertical: 6,
      borderBottomWidth: 1, borderBottomColor: c.surface2,
    },
    mentionHeaderText: {
      fontSize: 9, color: c.textMuted, fontWeight: '700', letterSpacing: 1,
    },
    mentionSection:      { },
    mentionSectionBorder:{ borderTopWidth: 1, borderTopColor: c.surface2 },
    mentionSectionLabel: {
      fontSize: 9, color: c.textMuted, fontWeight: '700', letterSpacing: 1,
      paddingHorizontal: 14, paddingTop: 7, paddingBottom: 2,
    },
    mentionSectionLabelOrder: { color: '#92400E' },

    mentionRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 14, paddingVertical: 9,
    },
    mentionRowBorder: { borderBottomWidth: 1, borderBottomColor: c.border },
    mentionAvatar: {
      width: 30, height: 30, borderRadius: 15,
      alignItems: 'center', justifyContent: 'center',
    },
    mentionInitial: { fontSize: 12, color: '#fff', fontWeight: '700' },
    mentionName:    { flex: 1, fontSize: 14, color: c.text },

    // Order rows in mention dropdown
    mentionOrderLoading: { paddingVertical: 10, alignItems: 'center' },
    mentionOrderIcon: {
      width: 30, height: 30, borderRadius: 10,
      backgroundColor: 'rgba(245,158,11,0.15)',
      alignItems: 'center', justifyContent: 'center',
    },
    mentionOrderEmoji:    { fontSize: 14 },
    mentionOrderInfo:     { flex: 1 },
    mentionOrderId:       { fontSize: 13, color: '#F59E0B', fontWeight: '700', fontVariant: ['tabular-nums'] },
    mentionOrderCustomer: { fontSize: 11, color: c.textMuted, marginTop: 1 },

    // ── Emoji panel ────────────────────────────────────────────────────────────
    emojiPanel: {
      backgroundColor: c.headerBg,
      borderTopWidth: 1, borderTopColor: c.surface2,
      paddingVertical: 8,
    },
    emojiRow: { flexDirection: 'row', paddingHorizontal: 10, gap: 2 },
    emojiBtn: { padding: 7 },
    emojiText: { fontSize: 24 },

    // ── Input bar ──────────────────────────────────────────────────────────────
    inputBar: {
      flexDirection: 'row', alignItems: 'flex-end', gap: 8,
      paddingHorizontal: 12, paddingVertical: 10,
      borderTopWidth: 1, borderTopColor: c.surface2,
      backgroundColor: c.headerBg,
    },
    inputIconBtn: {
      width: 40, height: 40, borderRadius: 12,
      backgroundColor: c.card,
      alignItems: 'center', justifyContent: 'center',
    },
    inputIconBtnActive: { backgroundColor: 'rgba(99,102,241,0.15)' },

    textInput: {
      flex: 1,
      minHeight: 40, maxHeight: 120,
      backgroundColor: c.card,
      borderRadius: 20, borderWidth: 1, borderColor: c.surface2,
      paddingHorizontal: 16,
      paddingTop:    Platform.OS === 'ios' ? 10 : 8,
      paddingBottom: Platform.OS === 'ios' ? 10 : 8,
      fontSize: 14, color: c.text,
    },

    sendBtn: {
      width: 42, height: 42, borderRadius: 21,
      backgroundColor: c.brand,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: c.brand, shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.4, shadowRadius: 6, elevation: 5,
    },
    sendBtnOff: {
      backgroundColor: c.surface2,
      shadowOpacity: 0, elevation: 0,
    },
    sendArrow: { fontSize: 20, color: '#fff', fontWeight: '700' },
  });
}
