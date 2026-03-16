import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  TextInput, TouchableOpacity, RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useBoardStore, STATUSES } from '../store/boardStore'
import { useNotifStore } from '../store/notificationStore'
import KanbanColumn from '../components/KanbanColumn'
import FilterPanel from '../components/FilterPanel'
import type { RootStackParams } from '../types'

export default function BoardScreen() {
  const insets = useSafeAreaInsets()
  const nav    = useNavigation<NativeStackNavigationProp<RootStackParams>>()

  const { columns, filters, isRefreshing, fetchAll, loadMore, refresh, setSearch, setFilters, resetFilters } = useBoardStore()
  const unreadNotif = useNotifStore(s => s.unreadCount)

  const [searchText,    setSearchText]    = useState('')
  const [filterVisible, setFilterVisible] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const activeFilterCount = [
    filters.created_by, filters.assigned_to,
    filters.date_from || filters.date_to,
    filters.delivery_from || filters.delivery_to,
  ].filter(Boolean).length

  useEffect(() => {
    fetchAll()
  }, [])

  const handleSearch = useCallback((text: string) => {
    setSearchText(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearch(text), 350)
  }, [setSearch])

  const clearSearch = () => {
    setSearchText('')
    setSearch('')
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="grid" size={22} color="#1A56D6" />
          <Text style={styles.title}>Board</Text>
        </View>
        <TouchableOpacity
          style={styles.notifBtn}
          onPress={() => nav.navigate('Notifications')}
        >
          <Ionicons name="notifications-outline" size={22} color="#0F172A" />
          {unreadNotif > 0 && (
            <View style={styles.notifBadge}>
              <Text style={styles.notifBadgeText}>
                {unreadNotif > 99 ? '99+' : unreadNotif}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Search + Filter + Add */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color="#94A3B8" style={{ marginRight: 6 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search orders…"
            placeholderTextColor="#CBD5E1"
            value={searchText}
            onChangeText={handleSearch}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={clearSearch}>
              <Ionicons name="close-circle" size={16} color="#CBD5E1" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]}
          onPress={() => setFilterVisible(true)}
        >
          <Ionicons name="options-outline" size={18} color={activeFilterCount > 0 ? '#1A56D6' : '#64748B'} />
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => nav.navigate('CreateEditProduct', {})}
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Horizontal kanban columns */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.columnsContainer}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor="#1A56D6"
          />
        }
      >
        {STATUSES.map(status => (
          <KanbanColumn
            key={status}
            status={status}
            column={
              columns[status] ?? {
                data: [], total: 0, nextCursor: null,
                hasMore: false, isLoading: true, isLoadingMore: false,
              }
            }
            onLoadMore={() => loadMore(status)}
          />
        ))}
      </ScrollView>

      <FilterPanel
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
        filters={{ ...filters, search: searchText }}
        onChange={(f) => {
          setFilters({ ...f, search: searchText })
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerLeft:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title:          { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  notifBtn:       { padding: 4 },
  notifBadge: {
    position: 'absolute', top: 0, right: 0,
    backgroundColor: '#EF4444', borderRadius: 8,
    minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  notifBadgeText: { fontSize: 9, color: '#FFFFFF', fontWeight: '700' },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  filterBtn: {
    width: 38, height: 38, borderRadius: 10,
    borderWidth: 1, borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center', justifyContent: 'center',
  },
  filterBtnActive: { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' },
  filterBadge: {
    position: 'absolute', top: -4, right: -4,
    backgroundColor: '#1A56D6', borderRadius: 8,
    minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  filterBadgeText: { fontSize: 9, color: '#FFFFFF', fontWeight: '700' },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A', padding: 0 },
  addBtn: {
    backgroundColor: '#1A56D6',
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  columnsContainer: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 24,
    flexGrow: 1,
  },
})
