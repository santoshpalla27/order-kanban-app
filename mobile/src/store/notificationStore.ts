import { create } from 'zustand'
import { notifApi } from '../api/services'
import type { Notification } from '../types'

interface NotifState {
  notifications: Notification[]
  unreadCount:   number
  isLoading:     boolean
  hasMore:       boolean
  nextCursor:    number | null
  fetch:          () => Promise<void>
  loadMore:       () => Promise<void>
  markRead:       (id: number) => Promise<void>
  markAllRead:    () => Promise<void>
  fetchUnread:    () => Promise<void>
  incrementUnread: () => void
}

export const useNotifStore = create<NotifState>((set, get) => ({
  notifications: [],
  unreadCount:   0,
  isLoading:     false,
  hasMore:       false,
  nextCursor:    null,

  fetch: async () => {
    set({ isLoading: true })
    try {
      const res = await notifApi.list()
      set({
        notifications: res.data ?? [],
        hasMore:       res.has_more,
        nextCursor:    res.next_cursor,
        isLoading:     false,
      })
    } catch { set({ isLoading: false }) }
  },

  loadMore: async () => {
    const { nextCursor, notifications, hasMore } = get()
    if (!hasMore || !nextCursor) return
    try {
      const res = await notifApi.list(nextCursor)
      set({
        notifications: [...notifications, ...(res.data ?? [])],
        hasMore:       res.has_more,
        nextCursor:    res.next_cursor,
      })
    } catch {}
  },

  markRead: async (id) => {
    await notifApi.markRead(id)
    set(s => ({
      notifications: s.notifications.map(n => n.id === id ? { ...n, is_read: true } : n),
      unreadCount:   Math.max(0, s.unreadCount - 1),
    }))
  },

  markAllRead: async () => {
    await notifApi.markAllRead()
    set(s => ({
      notifications: s.notifications.map(n => ({ ...n, is_read: true })),
      unreadCount:   0,
    }))
  },

  fetchUnread: async () => {
    try { set({ unreadCount: await notifApi.unreadCount() }) } catch {}
  },

  incrementUnread: () => set(s => ({ unreadCount: s.unreadCount + 1 })),
}))
