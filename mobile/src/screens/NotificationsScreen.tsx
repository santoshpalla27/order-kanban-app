import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useNotifStore } from '../store/notificationStore'
import type { Notification, RootStackParams } from '../types'

type NavProp = NativeStackNavigationProp<RootStackParams>

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const TYPE_ICON: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  comment:    'chatbubble-outline',
  attachment: 'attach-outline',
  mention:    'at-outline',
  product:    'cube-outline',
  chat:       'chatbubbles-outline',
}

const STATUS_FILTERS = [
  { value: 'all',    label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'read',   label: 'Read' },
]

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets()
  const nav    = useNavigation<NavProp>()

  const {
    notifications, isLoading, hasMore,
    fetch, loadMore, markRead, markAllRead, fetchUnread,
  } = useNotifStore()

  const [refreshing,    setRefreshing]    = useState(false)
  const [loadingMore,   setLoadingMore]   = useState(false)
  const [markingAll,    setMarkingAll]    = useState(false)
  const [searchText,    setSearchText]    = useState('')
  const [statusFilter,  setStatusFilter]  = useState<'all'|'unread'|'read'>('all')

  useEffect(() => { fetch() }, [])

  const onRefresh = async () => {
    setRefreshing(true)
    await fetch()
    await fetchUnread()
    setRefreshing(false)
  }

  const handleLoadMore = async () => {
    if (!hasMore || loadingMore) return
    setLoadingMore(true)
    await loadMore()
    setLoadingMore(false)
  }

  const handleMarkAll = async () => {
    setMarkingAll(true)
    await markAllRead()
    setMarkingAll(false)
  }

  const handleTap = useCallback(async (n: Notification) => {
    if (!n.is_read) await markRead(n.id)
    if (n.entity_type === 'product' && n.entity_id) {
      nav.navigate('ProductDetail', { id: n.entity_id })
    } else if (n.entity_type === 'chat') {
      nav.navigate('Main', { screen: 'Chat' })
    }
  }, [markRead, nav])

  const filtered = notifications.filter(n => {
    if (statusFilter === 'unread' && n.is_read)  return false
    if (statusFilter === 'read'   && !n.is_read) return false
    if (searchText && !n.message.toLowerCase().includes(searchText.toLowerCase())) return false
    return true
  })

  const unreadCount = notifications.filter(n => !n.is_read).length

  const renderItem = useCallback(({ item: n }: { item: Notification }) => {
    const icon       = TYPE_ICON[n.type] ?? 'notifications-outline'
    const isProduct  = n.entity_type === 'product' && !!n.entity_id
    const isChat     = n.entity_type === 'chat'
    const hasLink    = isProduct || isChat
    const linkLabel  = isChat ? 'Go to Team Chat →' : 'Go to product →'

    return (
      <TouchableOpacity
        style={[styles.item, !n.is_read && styles.itemUnread, hasLink && styles.itemTappable]}
        onPress={() => handleTap(n)}
        activeOpacity={hasLink ? 0.7 : 1}
      >
        {/* Icon */}
        <View style={[styles.iconBox, !n.is_read && styles.iconBoxUnread]}>
          <Ionicons name={icon} size={18} color={n.is_read ? '#94A3B8' : '#1A56D6'} />
        </View>

        {/* Content */}
        <View style={styles.itemContent}>
          <Text style={[styles.itemMessage, !n.is_read && styles.itemMessageUnread]} numberOfLines={3}>
            {n.message}
          </Text>
          {hasLink && (
            <Text style={styles.linkHint}>{linkLabel}</Text>
          )}
          <View style={styles.itemMeta}>
            {!!n.type && (
              <View style={styles.typeBadge}>
                <Text style={styles.typeBadgeText}>{n.type}</Text>
              </View>
            )}
            <Text style={styles.timeText}>{formatRelative(n.created_at)}</Text>
          </View>
        </View>

        {/* Unread dot */}
        {!n.is_read && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    )
  }, [handleTap])

  const ListFooter = () => {
    if (loadingMore) return (
      <View style={styles.footerSpinner}>
        <ActivityIndicator size="small" color="#1A56D6" />
      </View>
    )
    if (hasMore) return (
      <TouchableOpacity style={styles.loadMoreBtn} onPress={handleLoadMore}>
        <Text style={styles.loadMoreText}>Load more</Text>
      </TouchableOpacity>
    )
    if (filtered.length > 0) return (
      <View style={styles.endRow}>
        <Text style={styles.endText}>All notifications loaded</Text>
      </View>
    )
    return null
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount} unread</Text>
            </View>
          )}
        </View>
        {unreadCount > 0 ? (
          <TouchableOpacity style={styles.markAllBtn} onPress={handleMarkAll} disabled={markingAll}>
            {markingAll
              ? <ActivityIndicator size="small" color="#1A56D6" />
              : <Ionicons name="checkmark-done-outline" size={20} color="#1A56D6" />
            }
          </TouchableOpacity>
        ) : (
          <View style={{ width: 34 }} />
        )}
      </View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color="#94A3B8" style={{ marginRight: 6 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search notifications…"
            placeholderTextColor="#CBD5E1"
            value={searchText}
            onChangeText={setSearchText}
            autoCorrect={false}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText('')}>
              <Ionicons name="close-circle" size={16} color="#CBD5E1" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Status filter chips */}
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map(f => {
          const active = statusFilter === f.value
          return (
            <TouchableOpacity
              key={f.value}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setStatusFilter(f.value as any)}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1A56D6" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={n => String(n.id)}
          renderItem={renderItem}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="notifications-outline" size={44} color="#E2E8F0" />
              <Text style={styles.emptyText}>
                {searchText || statusFilter !== 'all' ? 'No matching notifications' : 'No notifications yet'}
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1A56D6" />
          }
          contentContainerStyle={[styles.listContent, filtered.length === 0 && { flex: 1 }]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#F8FAFC' },
  centered:{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  backBtn:      { padding: 4 },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 8 },
  title:        { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  unreadBadge: {
    backgroundColor: '#EF4444', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  unreadBadgeText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  markAllBtn:  { padding: 7 },

  searchRow: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0',
    paddingHorizontal: 10, paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A', padding: 0 },

  filterRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12, paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  filterChip: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 5,
    backgroundColor: '#FFFFFF',
  },
  filterChipActive:     { borderColor: '#1A56D6', backgroundColor: '#EFF6FF' },
  filterChipText:       { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
  filterChipTextActive: { color: '#1A56D6' },

  listContent: { paddingTop: 6, paddingBottom: 24 },

  item: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14, paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1, borderBottomColor: '#F8FAFC',
  },
  itemUnread:   { backgroundColor: '#F8FBFF' },
  itemTappable: { borderLeftWidth: 3, borderLeftColor: 'transparent' },
  linkHint:     { fontSize: 11, color: '#1A56D6', fontWeight: '600', marginTop: 3 },

  iconBox: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  iconBoxUnread: { backgroundColor: '#EFF6FF' },

  itemContent: { flex: 1 },
  itemMessage: {
    fontSize: 13, color: '#64748B', lineHeight: 19,
  },
  itemMessageUnread: { color: '#0F172A', fontWeight: '500' },
  itemMeta:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  typeBadge: {
    backgroundColor: '#F1F5F9', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  typeBadgeText: { fontSize: 10, fontWeight: '600', color: '#64748B', textTransform: 'capitalize' },
  timeText:      { fontSize: 11, color: '#94A3B8' },

  unreadDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#1A56D6',
    marginTop: 4, flexShrink: 0,
  },

  footerSpinner: { paddingVertical: 16, alignItems: 'center' },
  loadMoreBtn: {
    margin: 12, borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 10, paddingVertical: 12, alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadMoreText: { fontSize: 13, fontWeight: '600', color: '#1A56D6' },
  endRow:       { paddingVertical: 16, alignItems: 'center' },
  endText:      { fontSize: 12, color: '#CBD5E1' },
  emptyText:    { fontSize: 14, color: '#94A3B8', fontWeight: '500' },
})
