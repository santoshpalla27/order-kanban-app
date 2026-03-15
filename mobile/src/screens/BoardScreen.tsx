import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, RefreshControl, Platform, StatusBar,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

import KanbanColumn from '../components/KanbanColumn'
import { useBoardStore } from '../store/boardStore'
import { useNotifStore } from '../store/notificationStore'
import { useAuthStore } from '../store/authStore'
import { wsManager } from '../websocket/wsManager'
import type { RootStackParams } from '../types'

type Nav = NativeStackNavigationProp<RootStackParams>

export default function BoardScreen() {
  const insets   = useSafeAreaInsets()
  const nav      = useNavigation<Nav>()
  const { columns, isRefreshing, error, fetchAll, loadMore, refresh, setSearch, search } = useBoardStore()
  const { unreadCount, fetchUnread, incrementUnread } = useNotifStore()
  const { role } = useAuthStore()
  const [localSearch, setLocalSearch] = useState(search)
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()

  const canCreate = ['admin', 'manager', 'organiser'].includes(role)

  useEffect(() => { fetchAll(); fetchUnread() }, [])

  useFocusEffect(useCallback(() => {
    fetchAll()
    fetchUnread()
  }, []))

  // Live updates via WebSocket
  useEffect(() => {
    const unsub = wsManager.subscribe(event => {
      if (['product_created', 'product_update', 'product_deleted'].includes(event.type)) {
        refresh()
      }
      if (event.type === 'notification') {
        incrementUnread()
      }
    })
    return unsub
  }, [])

  const handleSearch = (text: string) => {
    setLocalSearch(text)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setSearch(text), 400)
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={styles.title}>Kanban Board</Text>
        <View style={styles.topActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => nav.navigate('Notifications')}>
            <Ionicons name="notifications-outline" size={22} color="#212121" />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          {canCreate && (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => nav.navigate('CreateEditProduct', {})}
            >
              <Ionicons name="add" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color="#9E9E9E" />
          <TextInput
            style={styles.searchInput}
            value={localSearch}
            onChangeText={handleSearch}
            placeholder="Search products..."
            placeholderTextColor="#BDBDBD"
            returnKeyType="search"
          />
          {localSearch.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')}>
              <Ionicons name="close-circle" size={17} color="#BDBDBD" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Error banner */}
      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={16} color="#E53935" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => fetchAll()}>
            <Text style={styles.errorRetry}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Board — fills remaining space, pull-to-refresh on outer scroll */}
      <ScrollView
        style={styles.board}
        contentContainerStyle={styles.boardContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            colors={['#1A73E8']}
            tintColor="#1A73E8"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {/* Left column: Yet to Start + Review */}
          <View style={styles.col}>
            <KanbanColumn
              status="yet_to_start"
              column={columns['yet_to_start']}
              onCardPress={id => nav.navigate('ProductDetail', { id })}
              onLoadMore={() => loadMore('yet_to_start')}
            />
            <KanbanColumn
              status="review"
              column={columns['review']}
              onCardPress={id => nav.navigate('ProductDetail', { id })}
              onLoadMore={() => loadMore('review')}
            />
          </View>

          {/* Right column: Working + Done */}
          <View style={styles.col}>
            <KanbanColumn
              status="working"
              column={columns['working']}
              onCardPress={id => nav.navigate('ProductDetail', { id })}
              onLoadMore={() => loadMore('working')}
            />
            <KanbanColumn
              status="done"
              column={columns['done']}
              onCardPress={id => nav.navigate('ProductDetail', { id })}
              onLoadMore={() => loadMore('done')}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: '#F8F9FA' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  title: { fontSize: 20, fontWeight: '800', color: '#212121' },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { position: 'relative', padding: 4 },
  badge: {
    position: 'absolute', top: 0, right: 0,
    backgroundColor: '#E53935', borderRadius: 8,
    minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  badgeText: { color: '#FFF', fontSize: 9, fontWeight: '700' },
  addBtn: {
    backgroundColor: '#1A73E8', borderRadius: 8, padding: 6, marginLeft: 4,
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 8,
    ...Platform.select({
      android: { elevation: 2 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
    }),
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#212121', padding: 0 },

  board:        { flex: 1 },
  boardContent: { flex: 1, padding: 10, paddingBottom: 24 },
  grid: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  col: { flex: 1, flexDirection: 'column', gap: 0 },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFEBEE', paddingHorizontal: 16, paddingVertical: 10,
  },
  errorText:  { flex: 1, color: '#E53935', fontSize: 13 },
  errorRetry: { color: '#E53935', fontWeight: '700', fontSize: 13 },
})
