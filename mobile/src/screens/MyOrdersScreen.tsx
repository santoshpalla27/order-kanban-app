import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, ActivityIndicator, RefreshControl, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { productApi } from '../api/services'
import { useAuthStore } from '../store/authStore'
import type { Product, RootStackParams } from '../types'
import StatusChip from '../components/StatusChip'
import FilterPanel, { type FilterState } from '../components/FilterPanel'
import NotifBell from '../components/NotifBell'

type NavProp = NativeStackNavigationProp<RootStackParams>

const PAGE_SIZE = 20

const STATUS_TABS = [
  { value: '',            label: 'All'         },
  { value: 'yet_to_start', label: 'Yet to Start' },
  { value: 'working',     label: 'In Progress'  },
  { value: 'review',      label: 'In Review'    },
  { value: 'done',        label: 'Done'         },
]

const TAB_COLOR: Record<string, string> = {
  '':            '#1A56D6',
  yet_to_start:  '#94A3B8',
  working:       '#1A56D6',
  review:        '#D97706',
  done:          '#16A34A',
}

function formatDate(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

interface ListState {
  data:        Product[]
  total:       number
  nextCursor:  number | null
  hasMore:     boolean
  loading:     boolean
  loadingMore: boolean
}

const EMPTY_STATE: ListState = {
  data: [], total: 0, nextCursor: null, hasMore: false, loading: false, loadingMore: false,
}

function parseRes(res: any): { data: Product[]; total: number; hasMore: boolean; nextCursor: number | null } {
  if (Array.isArray(res)) return { data: res, total: res.length, hasMore: false, nextCursor: null }
  return {
    data:       res.data ?? [],
    total:      res.total ?? 0,
    hasMore:    !!res.has_more,
    nextCursor: res.next_cursor ?? null,
  }
}

export default function MyOrdersScreen() {
  const insets = useSafeAreaInsets()
  const nav    = useNavigation<NavProp>()
  const user   = useAuthStore(s => s.user)

  const [statusTab,     setStatusTab]     = useState('')
  const [searchText,    setSearchText]    = useState('')
  const [filterVisible, setFilterVisible] = useState(false)
  const [extraFilters,  setExtraFilters]  = useState<FilterState>({
    search: '', created_by: '', assigned_to: '',
    date_from: '', date_to: '', delivery_from: '', delivery_to: '',
  })
  const [state,      setState]     = useState<ListState>(EMPTY_STATE)
  const [refreshing, setRefreshing] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const buildParams = useCallback((search: string, status: string, f: FilterState, cursor?: number) => {
    const p: Record<string, any> = {
      limit: PAGE_SIZE,
      assigned_to: String(user?.id ?? 0),
    }
    if (search)          p.search        = search
    if (status)          p.status        = status
    if (f.created_by)    p.created_by    = f.created_by
    if (f.date_from)     p.date_from     = f.date_from
    if (f.date_to)       p.date_to       = f.date_to
    if (f.delivery_from) p.delivery_from = f.delivery_from
    if (f.delivery_to)   p.delivery_to   = f.delivery_to
    if (cursor)          p.cursor        = cursor
    return p
  }, [user?.id])

  const fetch = useCallback(async (
    search: string, status: string, f: FilterState, silent = false
  ) => {
    if (!silent) setState(s => ({ ...s, loading: true }))
    try {
      const res: any = await productApi.list(buildParams(search, status, f))
      setState({ ...parseRes(res), loading: false, loadingMore: false })
    } catch {
      setState(s => ({ ...s, loading: false }))
    }
  }, [buildParams])

  useFocusEffect(useCallback(() => {
    fetch(searchText, statusTab, extraFilters)
  }, [statusTab, extraFilters]))

  useEffect(() => {
    fetch(searchText, statusTab, extraFilters)
  }, [statusTab, extraFilters])

  const handleSearch = (text: string) => {
    setSearchText(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetch(text, statusTab, extraFilters), 350)
  }

  const clearSearch = () => {
    setSearchText('')
    fetch('', statusTab, extraFilters)
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await fetch(searchText, statusTab, extraFilters, true)
    setRefreshing(false)
  }

  const loadMore = async () => {
    if (!state.hasMore || !state.nextCursor || state.loadingMore) return
    setState(s => ({ ...s, loadingMore: true }))
    try {
      const res: any = await productApi.list(buildParams(searchText, statusTab, extraFilters, state.nextCursor))
      const { data: newData, hasMore, nextCursor } = parseRes(res)
      setState(s => ({ ...s, data: [...s.data, ...newData], hasMore, nextCursor, loadingMore: false }))
    } catch {
      setState(s => ({ ...s, loadingMore: false }))
    }
  }

  const handleFilterChange = (f: FilterState) => {
    setExtraFilters(f)
    setSearchText(f.search || searchText)
  }

  const activeFilterCount = [
    extraFilters.created_by,
    extraFilters.date_from || extraFilters.date_to,
    extraFilters.delivery_from || extraFilters.delivery_to,
  ].filter(Boolean).length

  const renderItem = ({ item }: { item: Product }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() => nav.navigate('ProductDetail', { id: item.id })}
      activeOpacity={0.75}
    >
      <View style={styles.rowMain}>
        <View style={styles.rowTop}>
          <Text style={styles.productId}>{item.product_id}</Text>
          <StatusChip status={item.status} small />
        </View>
        <Text style={styles.customerName} numberOfLines={1}>{item.customer_name}</Text>
        {!!item.customer_phone && <Text style={styles.phone}>{item.customer_phone}</Text>}
        {!!item.description && <Text style={styles.desc} numberOfLines={1}>{item.description}</Text>}
        <View style={styles.metaRow}>
          {item.delivery_at && (
            <View style={styles.metaTag}>
              <Ionicons name="calendar-outline" size={10} color="#D97706" />
              <Text style={styles.metaDelivery}>{formatDate(item.delivery_at)}</Text>
            </View>
          )}
          <Text style={styles.date}>{formatDate(item.created_at)}</Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.viewBtn}
        onPress={() => nav.navigate('ProductDetail', { id: item.id })}
      >
        <Ionicons name="eye-outline" size={18} color="#94A3B8" />
      </TouchableOpacity>
    </TouchableOpacity>
  )

  const ListFooter = () => {
    if (state.loadingMore) return <View style={styles.footerSpinner}><ActivityIndicator size="small" color="#1A56D6" /></View>
    if (state.hasMore) return (
      <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMore}>
        <Text style={styles.loadMoreText}>Load more</Text>
      </TouchableOpacity>
    )
    if (state.data.length > 0) return (
      <View style={styles.endRow}><Text style={styles.endText}>All {state.total} orders loaded</Text></View>
    )
    return null
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="person" size={20} color="#1A56D6" />
          <Text style={styles.title}>My Orders</Text>
          {state.total > 0 && (
            <View style={styles.totalBadge}>
              <Text style={styles.totalText}>{state.total}</Text>
            </View>
          )}
        </View>
        <NotifBell />
      </View>

      {/* Search + Filter */}
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
      </View>

      {/* Status Tabs */}
      <View style={styles.tabsRow}>
        <FlatList
          horizontal
          data={STATUS_TABS}
          keyExtractor={t => t.value}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsList}
          renderItem={({ item: t }) => {
            const active = statusTab === t.value
            const color  = active ? TAB_COLOR[t.value] : '#94A3B8'
            return (
              <TouchableOpacity
                style={[styles.tab, active && { borderBottomColor: color, borderBottomWidth: 2 }]}
                onPress={() => setStatusTab(t.value)}
              >
                <Text style={[styles.tabText, { color }]}>{t.label}</Text>
              </TouchableOpacity>
            )
          }}
        />
      </View>

      {/* List */}
      {state.loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color="#1A56D6" /></View>
      ) : (
        <FlatList
          data={state.data}
          keyExtractor={p => String(p.id)}
          renderItem={renderItem}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="person-outline" size={44} color="#E2E8F0" />
              <Text style={styles.emptyText}>No orders assigned to you</Text>
            </View>
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1A56D6" />}
          contentContainerStyle={[styles.listContent, state.data.length === 0 && { flex: 1 }]}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      <FilterPanel
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
        filters={extraFilters}
        onChange={handleFilterChange}
        hideAssignedTo
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#F8FAFC' },
  centered:{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title:       { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  totalBadge: {
    backgroundColor: '#EFF6FF', borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  totalText: { fontSize: 12, fontWeight: '700', color: '#1A56D6' },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0',
    paddingHorizontal: 10, paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A', padding: 0 },
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

  tabsRow: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  tabsList: { paddingHorizontal: 12 },
  tab: {
    paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabText: { fontSize: 13, fontWeight: '600' },

  listContent: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 24 },
  separator:   { height: 6 },

  row: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12,
    flexDirection: 'row', alignItems: 'flex-start',
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  rowMain:      { flex: 1, gap: 3 },
  rowTop:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  productId:    { fontSize: 12, fontWeight: '700', color: '#1A56D6' },
  customerName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  phone:        { fontSize: 12, color: '#64748B' },
  desc:         { fontSize: 12, color: '#94A3B8' },
  metaRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  metaTag:      { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaDelivery: { fontSize: 11, color: '#D97706', fontWeight: '500' },
  date:         { fontSize: 11, color: '#CBD5E1' },
  viewBtn:      { padding: 5, marginLeft: 8, paddingTop: 2 },

  footerSpinner: { paddingVertical: 16, alignItems: 'center' },
  loadMoreBtn: {
    margin: 12, borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: '#FFFFFF',
  },
  loadMoreText: { fontSize: 13, fontWeight: '600', color: '#1A56D6' },
  endRow:       { paddingVertical: 16, alignItems: 'center' },
  endText:      { fontSize: 12, color: '#CBD5E1' },
  emptyText:    { fontSize: 14, color: '#94A3B8', fontWeight: '500' },
})
