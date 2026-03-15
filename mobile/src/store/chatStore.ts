import { create } from 'zustand'
import { chatApi } from '../api/services'
import type { ChatMessage, User } from '../types'

interface ChatState {
  messages:    ChatMessage[]
  isLoading:   boolean
  hasMore:     boolean
  nextCursor:  number | null
  unreadCount: number
  users:       User[]
  fetchMessages:   () => Promise<void>
  loadMore:        () => Promise<void>
  sendMessage:     (text: string) => Promise<void>
  prependMessage:  (msg: ChatMessage) => void
  pollMessages:    () => Promise<void>
  markRead:        () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages:    [],
  isLoading:   false,
  hasMore:     false,
  nextCursor:  null,
  unreadCount: 0,
  users:       [],

  fetchMessages: async () => {
    set({ isLoading: true })
    try {
      const res = await chatApi.getMessages()
      set({
        messages:   [...(res.data ?? [])],
        hasMore:    res.has_more,
        nextCursor: res.next_cursor,
        isLoading:  false,
      })
    } catch { set({ isLoading: false }) }
  },

  loadMore: async () => {
    const { nextCursor, messages, hasMore } = get()
    if (!hasMore || !nextCursor) return
    try {
      const res = await chatApi.getMessages(nextCursor)
      set({
        messages:   [...(res.data ?? []), ...messages],
        hasMore:    res.has_more,
        nextCursor: res.next_cursor,
      })
    } catch {}
  },

  sendMessage: async (text) => {
    const msg = await chatApi.sendMessage(text)
    // Optimistically add to end so it appears immediately
    set(s => ({
      messages: s.messages.some(m => m.id === msg.id)
        ? s.messages
        : [...s.messages, msg],
    }))
  },

  prependMessage: (msg) =>
    set(s => ({
      messages: s.messages.some(m => m.id === msg.id)
        ? s.messages
        : [...s.messages, msg],
    })),

  // Poll for new messages without full reload
  pollMessages: async () => {
    try {
      const res = await chatApi.getMessages()
      const incoming = res.data ?? []
      set(s => {
        const existingIds = new Set(s.messages.map(m => m.id))
        const newMsgs = incoming.filter(m => !existingIds.has(m.id))
        if (newMsgs.length === 0) return s
        return { messages: [...s.messages, ...newMsgs] }
      })
    } catch {}
  },

  markRead: () => set({ unreadCount: 0 }),
}))
