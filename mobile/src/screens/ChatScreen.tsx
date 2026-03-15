import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, ActivityIndicator, KeyboardAvoidingView,
  Platform, Keyboard,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useChatStore } from '../store/chatStore'
import { useAuthStore } from '../store/authStore'
import { userApi, productApi } from '../api/services'
import type { User, Product, ChatMessage } from '../types'
import Avatar from '../components/Avatar'


// ─── Token rendering ──────────────────────────────────────────────────────────
const TOKEN_RE = /(@\[[^\]]+\]|@\{id:[^}]+\})/g

function renderMessage(
  text: string,
  currentUserName: string | undefined,
  onOrderTap: (productId: string) => void,
): React.ReactNode {
  const parts = text.split(TOKEN_RE)
  return parts.map((part, i) => {
    const userMatch  = part.match(/^@\[([^\]]+)\]$/)
    const orderMatch = part.match(/^@\{id:([^}]+)\}$/)
    if (userMatch) {
      const name = userMatch[1]
      return (
        <Text key={i} style={currentUserName === name ? styles.mentionMe : styles.mentionUser}>
          @{name}
        </Text>
      )
    }
    if (orderMatch) {
      const productId = orderMatch[1]
      return (
        <Text key={i} style={styles.mentionOrder} onPress={() => onOrderTap(productId)}>
          @{productId}
        </Text>
      )
    }
    return <Text key={i}>{part}</Text>
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
function formatDateSep(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'Today'
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

const AVATAR_COLORS = ['#6366F1','#8B5CF6','#EC4899','#F59E0B','#10B981','#3B82F6','#EF4444','#14B8A6']
function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

type MentionItem = { kind: 'user'; user: User } | { kind: 'order'; product: Product }
const EMOJIS = ['👍','👎','😄','🎉','🔥','❤️','🚀','✅','💡','😂','🙏','⭐']

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function ChatScreen() {
  const insets      = useSafeAreaInsets()
  const { messages, isLoading, hasMore, fetchMessages, loadMore, sendMessage, markRead } = useChatStore()
  const currentUser = useAuthStore(s => s.user)

  const [text,         setText]         = useState('')
  const [sending,      setSending]      = useState(false)
  const [loadingMore,  setLoadingMore]  = useState(false)
  const [showEmoji,    setShowEmoji]    = useState(false)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionItems, setMentionItems] = useState<MentionItem[]>([])
  const [allUsers,     setAllUsers]     = useState<User[]>([])

  const flatRef  = useRef<FlatList>(null)
  const inputRef = useRef<TextInput>(null)
  const debRef   = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    markRead()
    fetchMessages().then(() => {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 150)
    })
    userApi.list().then(setAllUsers).catch(() => {})
    // No polling — new messages arrive via WebSocket (useWsEvents in AppNavigator)
  }, [])

  const msgCount = messages.length
  useEffect(() => {
    if (msgCount > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80)
    }
  }, [msgCount])

  // ── Mention logic ─────────────────────────────────────────────────────────
  const handleTextChange = useCallback((val: string) => {
    setText(val)
    const atIdx = val.lastIndexOf('@')
    if (atIdx === -1) { setMentionQuery(null); return }
    const after = val.slice(atIdx + 1)
    if (/[\s\[\]{]/.test(after)) { setMentionQuery(null); return }
    setMentionQuery(after)

    if (debRef.current) clearTimeout(debRef.current)
    debRef.current = setTimeout(async () => {
      const q = after.toLowerCase()
      const userResults: MentionItem[] = allUsers
        .filter(u => u.name.toLowerCase().includes(q))
        .slice(0, 4)
        .map(u => ({ kind: 'user', user: u }))
      let orderResults: MentionItem[] = []
      if (q.length >= 1) {
        try {
          const res: any = await productApi.list({ search: q, limit: 5 })
          const data: Product[] = Array.isArray(res) ? res : (res.data ?? [])
          orderResults = data.slice(0, 4).map(p => ({ kind: 'order', product: p }))
        } catch {}
      }
      setMentionItems([...userResults, ...orderResults])
    }, 200)
  }, [allUsers])

  const selectMention = (item: MentionItem) => {
    const atIdx = text.lastIndexOf('@')
    const before = text.slice(0, atIdx)
    const token  = item.kind === 'user'
      ? `@[${item.user.name}] `
      : `@{id:${item.product.product_id}} `
    setText(before + token)
    setMentionQuery(null)
    setMentionItems([])
    inputRef.current?.focus()
  }

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    const msg = text.trim()
    if (!msg || sending) return
    setSending(true)
    setText('')
    setMentionQuery(null)
    try {
      await sendMessage(msg)
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100)
    } catch {}
    setSending(false)
  }

  const handleLoadMore = async () => {
    if (!hasMore || loadingMore) return
    setLoadingMore(true)
    await loadMore()
    setLoadingMore(false)
  }

  // ── Render bubble ─────────────────────────────────────────────────────────
  const renderItem = useCallback(({ item, index }: { item: ChatMessage; index: number }) => {
    const isOwn  = item.user_id === currentUser?.id
    const name   = item.user?.name ?? 'Unknown'
    const prev   = messages[index - 1]
    const next   = messages[index + 1]
    const isSameDayAs = (a: ChatMessage, b: ChatMessage) =>
      formatDateSep(a.created_at) === formatDateSep(b.created_at)
    const isFirst  = !prev || prev.user_id !== item.user_id || !isSameDayAs(prev, item)
    const isLast   = !next || next.user_id !== item.user_id || !isSameDayAs(next, item)
    const showDate = !prev || formatDateSep(prev.created_at) !== formatDateSep(item.created_at)

    return (
      <View>
        {showDate && (
          <View style={styles.dateSep}>
            <View style={styles.dateLine} />
            <Text style={styles.dateLabel}>{formatDateSep(item.created_at)}</Text>
            <View style={styles.dateLine} />
          </View>
        )}
        <View style={[styles.msgRow, isOwn && styles.msgRowOwn, isLast && { marginBottom: 6 }]}>
          {!isOwn && (
            <View style={styles.avatarSlot}>
              {isLast
                ? <Avatar name={name} size={28} color={avatarColor(name)} />
                : <View style={{ width: 28 }} />
              }
            </View>
          )}
          <View style={[styles.bubbleCol, isOwn && styles.bubbleColOwn]}>
            {!isOwn && isFirst && (
              <Text style={styles.senderName}>{name}</Text>
            )}
            <View style={[
              styles.bubble,
              isOwn ? styles.bubbleOwn : styles.bubbleOther,
              isFirst && isOwn  && styles.bubbleFirstOwn,
              isFirst && !isOwn && styles.bubbleFirstOther,
            ]}>
              <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>
                {renderMessage(item.message, currentUser?.name, () => {})}
                <Text style={[styles.timeInline, isOwn && styles.timeInlineOwn]}>
                  {'  '}{formatTime(item.created_at)}
                </Text>
              </Text>
            </View>
          </View>
        </View>
      </View>
    )
  }, [messages, currentUser])

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="chatbubbles" size={16} color="#FFFFFF" />
        </View>
        <Text style={styles.headerTitle}>Team Chat</Text>
      </View>

      {/* Messages */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1A56D6" />
        </View>
      ) : (
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={m => String(m.id)}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.msgList,
            messages.length === 0 && { flex: 1, justifyContent: 'center' },
          ]}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={() => { setShowEmoji(false); setMentionQuery(null) }}
          ListHeaderComponent={
            hasMore ? (
              <TouchableOpacity style={styles.loadOlderBtn} onPress={handleLoadMore} disabled={loadingMore}>
                {loadingMore
                  ? <ActivityIndicator size="small" color="#94A3B8" />
                  : <>
                      <Ionicons name="chevron-up" size={13} color="#94A3B8" />
                      <Text style={styles.loadOlderText}>Load older messages</Text>
                    </>
                }
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="chatbubbles-outline" size={48} color="#E2E8F0" />
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptySubtitle}>Start the conversation!</Text>
            </View>
          }
        />
      )}

      {/* Mention dropdown */}
      {mentionQuery !== null && mentionItems.length > 0 && (
        <View style={styles.mentionDropdown}>
          {mentionItems.map((item, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.mentionOption, i < mentionItems.length - 1 && styles.mentionOptionBorder]}
              onPress={() => selectMention(item)}
            >
              {item.kind === 'user' ? (
                <>
                  <Avatar name={item.user.name} size={26} color={avatarColor(item.user.name)} />
                  <View style={styles.mentionInfo}>
                    <Text style={styles.mentionName}>{item.user.name}</Text>
                    <Text style={styles.mentionSub}>Mention user</Text>
                  </View>
                  <View style={styles.mentionBadge}>
                    <Text style={styles.mentionBadgeText}>User</Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.orderIcon}>
                    <Ionicons name="cube-outline" size={14} color="#D97706" />
                  </View>
                  <View style={styles.mentionInfo}>
                    <Text style={styles.mentionName}>{item.product.product_id}</Text>
                    <Text style={styles.mentionSub} numberOfLines={1}>{item.product.customer_name}</Text>
                  </View>
                  <View style={[styles.mentionBadge, styles.mentionBadgeOrder]}>
                    <Text style={[styles.mentionBadgeText, { color: '#D97706' }]}>Order</Text>
                  </View>
                </>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Emoji tray */}
      {showEmoji && (
        <View style={styles.emojiTray}>
          {EMOJIS.map(e => (
            <TouchableOpacity
              key={e}
              style={styles.emojiBtn}
              onPress={() => { setText(t => t + e); setShowEmoji(false) }}
            >
              <Text style={styles.emojiText}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Input bar */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity
          style={[styles.inputIconBtn, showEmoji && styles.inputIconBtnActive]}
          onPress={() => { setShowEmoji(s => !s); Keyboard.dismiss() }}
        >
          <Ionicons name="happy-outline" size={22} color={showEmoji ? '#1A56D6' : '#94A3B8'} />
        </TouchableOpacity>
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="Message… (@ to mention)"
          placeholderTextColor="#CBD5E1"
          value={text}
          onChangeText={handleTextChange}
          multiline
          maxLength={2000}
          onFocus={() => setShowEmoji(false)}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          {sending
            ? <ActivityIndicator size="small" color="#FFFFFF" />
            : <Ionicons name="send" size={16} color="#FFFFFF" />
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#F8FAFC' },
  centered:{ flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    gap: 10,
  },
  headerIcon: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: '#1A56D6',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },

  msgList: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 },

  dateSep:  { flexDirection: 'row', alignItems: 'center', marginVertical: 14, gap: 10 },
  dateLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dateLabel:{ fontSize: 11, color: '#94A3B8', fontWeight: '600', paddingHorizontal: 4 },

  msgRow:    { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 2 },
  msgRowOwn: { justifyContent: 'flex-end' },
  avatarSlot:{ width: 34, marginRight: 6 },

  bubbleCol:    { maxWidth: '78%', alignItems: 'flex-start' },
  bubbleColOwn: { alignItems: 'flex-end' },
  senderName:   { fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 3, marginLeft: 2 },

  bubble:          { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18 },
  bubbleOwn:       { backgroundColor: '#1A56D6' },
  bubbleOther:     { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' },
  bubbleFirstOwn:  { borderTopRightRadius: 6 },
  bubbleFirstOther:{ borderTopLeftRadius: 6 },
  bubbleText:      { fontSize: 14, color: '#1E293B', lineHeight: 20 },
  bubbleTextOwn:   { color: '#FFFFFF' },
  timeInline:      { fontSize: 10, color: '#94A3B8' },
  timeInlineOwn:   { color: 'rgba(255,255,255,0.55)' },

  mentionUser:  { color: '#1A56D6', fontWeight: '700' },
  mentionMe:    { color: '#7C3AED', fontWeight: '700' },
  mentionOrder: { color: '#D97706', fontWeight: '700' },

  emptyBox:      { alignItems: 'center', gap: 8 },
  emptyTitle:    { fontSize: 15, fontWeight: '700', color: '#94A3B8' },
  emptySubtitle: { fontSize: 13, color: '#CBD5E1' },

  loadOlderBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 8, marginBottom: 8,
  },
  loadOlderText: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },

  mentionDropdown: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1, borderTopColor: '#E2E8F0',
    maxHeight: 210,
  },
  mentionOption: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10, gap: 10,
  },
  mentionOptionBorder: { borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  mentionInfo:  { flex: 1 },
  mentionName:  { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  mentionSub:   { fontSize: 11, color: '#94A3B8' },
  mentionBadge: {
    backgroundColor: '#EFF6FF', borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  mentionBadgeOrder: { backgroundColor: '#FFFBEB' },
  mentionBadgeText:  { fontSize: 10, fontWeight: '700', color: '#1A56D6' },
  orderIcon: {
    width: 26, height: 26, borderRadius: 6,
    backgroundColor: '#FFFBEB',
    alignItems: 'center', justifyContent: 'center',
  },

  emojiTray: {
    flexDirection: 'row', flexWrap: 'wrap',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1, borderTopColor: '#E2E8F0',
    paddingHorizontal: 12, paddingVertical: 10, gap: 4,
  },
  emojiBtn:  { padding: 6 },
  emojiText: { fontSize: 22 },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
    paddingHorizontal: 10, paddingTop: 10, gap: 8,
  },
  inputIconBtn:       { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  inputIconBtnActive: { backgroundColor: '#EFF6FF' },
  input: {
    flex: 1, minHeight: 38, maxHeight: 110,
    backgroundColor: '#F8FAFC',
    borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0',
    paddingHorizontal: 14, paddingVertical: 8,
    fontSize: 14, color: '#0F172A',
  },
  sendBtn:         { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1A56D6', alignItems: 'center', justifyContent: 'center', marginBottom: 1 },
  sendBtnDisabled: { backgroundColor: '#93C5FD' },
})
