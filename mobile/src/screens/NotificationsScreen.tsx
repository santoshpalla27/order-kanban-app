import React, { useEffect } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'

import Avatar from '../components/Avatar'
import { useNotifStore } from '../store/notificationStore'
import { timeAgo } from '../utils/helpers'
import type { Notification } from '../types'

const TYPE_ICONS: Record<string, { icon: string; color: string }> = {
  comment_added:       { icon: 'chatbubble',       color: '#1A73E8' },
  attachment_uploaded: { icon: 'attach',            color: '#FB8C00' },
  product_updated:     { icon: 'create',            color: '#43A047' },
  status_changed:      { icon: 'swap-horizontal',   color: '#8E24AA' },
  mentioned:           { icon: 'at',                color: '#E53935' },
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets()
  const nav    = useNavigation()
  const { notifications, isLoading, unreadCount, fetch, markRead, markAllRead, loadMore, hasMore } = useNotifStore()

  useEffect(() => { fetch() }, [])

  const getIconInfo = (type: string) =>
    TYPE_ICONS[type] ?? { icon: 'notifications', color: '#757575' }

  const renderItem = ({ item }: { item: Notification }) => {
    const { icon, color } = getIconInfo(item.type)
    return (
      <TouchableOpacity
        style={[styles.item, !item.is_read && styles.itemUnread]}
        onPress={() => markRead(item.id)}
        activeOpacity={0.7}
      >
        {/* Icon */}
        <View style={[styles.iconWrap, { backgroundColor: color + '20' }]}>
          <Ionicons name={icon as any} size={20} color={color} />
        </View>

        {/* Content */}
        <View style={styles.itemContent}>
          <View style={styles.itemTop}>
            <Text style={styles.itemSender} numberOfLines={1}>{item.sender_name}</Text>
            <Text style={styles.itemTime}>{timeAgo(item.created_at)}</Text>
          </View>
          <Text style={styles.itemMsg} numberOfLines={2}>{item.message}</Text>
          {item.content ? (
            <Text style={styles.itemContent2} numberOfLines={1}>"{item.content}"</Text>
          ) : null}
        </View>

        {/* Unread dot */}
        {!item.is_read && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    )
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#212121" />
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllRead} style={styles.markAllBtn}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Unread count */}
      {unreadCount > 0 && (
        <View style={styles.unreadBanner}>
          <Ionicons name="mail-unread-outline" size={14} color="#1A73E8" />
          <Text style={styles.unreadBannerText}>{unreadCount} unread notification{unreadCount > 1 ? 's' : ''}</Text>
        </View>
      )}

      {/* List */}
      {isLoading && notifications.length === 0 ? (
        <ActivityIndicator color="#1A73E8" style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={i => String(i.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onEndReached={() => hasMore && loadMore()}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="notifications-off-outline" size={56} color="#E0E0E0" />
              <Text style={styles.emptyText}>No notifications yet</Text>
            </View>
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8F9FA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backBtn: { marginRight: 12 },
  title:   { fontSize: 18, fontWeight: '800', color: '#212121', flex: 1 },
  markAllBtn: {
    backgroundColor: '#EBF3FF',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  markAllText: { fontSize: 12, color: '#1A73E8', fontWeight: '600' },

  unreadBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EBF3FF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
  },
  unreadBannerText: { color: '#1A73E8', fontSize: 13, fontWeight: '500' },

  listContent: { paddingVertical: 6, paddingBottom: 24 },

  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
    gap: 12,
  },
  itemUnread: { backgroundColor: '#F8F9FF' },

  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemContent: { flex: 1 },
  itemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  itemSender:   { fontSize: 13, fontWeight: '700', color: '#212121', flex: 1 },
  itemTime:     { fontSize: 11, color: '#9E9E9E', marginLeft: 8 },
  itemMsg:      { fontSize: 13, color: '#424242', lineHeight: 18 },
  itemContent2: { fontSize: 12, color: '#9E9E9E', fontStyle: 'italic', marginTop: 3 },

  unreadDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#1A73E8',
    alignSelf: 'center', flexShrink: 0,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 80,
    gap: 12,
  },
  emptyText: { fontSize: 15, color: '#9E9E9E' },
})
