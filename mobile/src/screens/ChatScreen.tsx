import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  FlatList, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'

import Avatar from '../components/Avatar'
import { useChatStore } from '../store/chatStore'
import { useAuthStore } from '../store/authStore'
import { wsManager } from '../websocket/wsManager'
import { timeAgo } from '../utils/helpers'
import type { ChatMessage } from '../types'

export default function ChatScreen() {
  const insets  = useSafeAreaInsets()
  const { messages, isLoading, fetchMessages, sendMessage, prependMessage, pollMessages, markRead } = useChatStore()
  const { user } = useAuthStore()
  const [text, setText]   = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<FlatList>(null)

  useFocusEffect(useCallback(() => {
    fetchMessages()
    markRead()
  }, []))

  // Scroll to bottom whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
    }
  }, [messages.length])

  // Poll every 3 seconds for new messages (fallback when WS is down)
  useEffect(() => {
    const timer = setInterval(() => pollMessages(), 3000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const unsub = wsManager.subscribe(event => {
      if (event.type === 'chat_message') {
        const msg = event.payload as unknown as ChatMessage
        prependMessage(msg)
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
      }
    })
    return unsub
  }, [])

  const handleSend = async () => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setText('')
    try {
      await sendMessage(trimmed)
    } finally {
      setSending(false)
    }
  }

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isOwn = item.user_id === user?.id
    return (
      <View style={[styles.msgRow, isOwn && styles.msgRowOwn]}>
        {!isOwn && (
          <Avatar name={item.user?.name ?? '?'} size={30} />
        )}
        <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
          {!isOwn && (
            <Text style={styles.senderName}>{item.user?.name}</Text>
          )}
          <Text style={[styles.msgText, isOwn && styles.msgTextOwn]}>{item.message}</Text>
          <Text style={[styles.msgTime, isOwn && styles.msgTimeOwn]}>{timeAgo(item.created_at)}</Text>
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.onlineDot} />
          <View>
            <Text style={styles.headerTitle}>Team Chat</Text>
            <Text style={styles.headerSub}>All team members</Text>
          </View>
        </View>
      </View>

      {/* Messages */}
      {isLoading && messages.length === 0 ? (
        <ActivityIndicator color="#1A73E8" style={{ flex: 1 }} />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={i => String(i.id)}
          renderItem={renderMessage}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <Text style={styles.empty}>No messages yet. Say hello!</Text>
          }
        />
      )}

      {/* Input */}
      <View style={[styles.inputRow, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Type a message…"
          placeholderTextColor="#BDBDBD"
          multiline
          maxLength={1000}
          returnKeyType="default"
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          {sending
            ? <ActivityIndicator color="#FFF" size="small" />
            : <Ionicons name="send" size={18} color="#FFFFFF" />
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8F9FA' },

  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  onlineDot:  { width: 10, height: 10, borderRadius: 5, backgroundColor: '#43A047' },
  headerTitle:{ fontSize: 18, fontWeight: '800', color: '#212121' },
  headerSub:  { fontSize: 12, color: '#9E9E9E', marginTop: 1 },

  listContent: { paddingHorizontal: 12, paddingVertical: 12, paddingBottom: 8 },

  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 10,
    gap: 8,
  },
  msgRowOwn: { flexDirection: 'row-reverse' },

  bubble: {
    maxWidth: '75%',
    borderRadius: 16,
    padding: 10,
    paddingHorizontal: 14,
  },
  bubbleOwn: {
    backgroundColor: '#1A73E8',
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  senderName: { fontSize: 11, fontWeight: '700', color: '#1A73E8', marginBottom: 3 },
  msgText:     { fontSize: 14, color: '#212121', lineHeight: 20 },
  msgTextOwn:  { color: '#FFFFFF' },
  msgTime:     { fontSize: 10, color: '#9E9E9E', marginTop: 4, textAlign: 'right' },
  msgTimeOwn:  { color: 'rgba(255,255,255,0.7)' },

  empty: { textAlign: 'center', color: '#9E9E9E', marginTop: 60, fontSize: 14 },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#212121',
    maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: '#1A73E8',
    borderRadius: 22,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#BDBDBD' },
})
