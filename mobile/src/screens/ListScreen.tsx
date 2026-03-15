import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, ActivityIndicator, RefreshControl, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { productApi } from '../api/services'
import { useBoardStore } from '../store/boardStore'
import type { Product, RootStackParams } from '../types'
import StatusChip from '../components/StatusChip'

type NavProp = NativeStackNavigationProp<RootStackParams>

const PAGE_SIZE = 20

const STATUS_FILTERS = [
  { value: '',            label: 'All' },
  { value: 'yet_to_start', label: 'Yet to Start' },
  { value: 'working',      label: 'In Progress' },
  { value: 'review',       label: 'In Review' },
  { value: 'done',         label: 'Done' },
]

const ACCENT: Record<string, string> = {
  '':            '#1A56D6',
  yet_to_start:  '#94A3B8',
  working:       '#1A56D6',
  review:        '#D97706',
  done:          '#16A34A',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

interface ListState {
  data:       Product[]
  total:      number
  nextCursor: number | null
  hasMore:    boolean
  loading:    boolean
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

export default function ListScreen() {
  const insets = useSafeAreaInsets()
  const nav    = useNavigation<NavProp>()
  const { removeProductLocally } = useBoardStore()

  const [statusFilter, setStatusFilter] = useState('')
  const [searchText,   setSearchText]   = useState('')
  const [state,        setState]        = useState<ListState>(EMPTY_STATE)
  const [refreshing,   setRefreshing]   = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const searchRef   = useRef(searchText)
  searchRef.current = searchText

  const fetch = useCallback(async (search: string, status: string, silent = false) => {
    if (!silent) setState(s => ({ ...s, loading: true }))
    try {
      const res: any = await productApi.list({
        status:  status || undefined,
        search:  search || undefined,
        limit:   PAGE_SIZE,
      })
      const parsed = parseRes(res)
      setState({ ...parsed, loading: false, loadingMore: false })
    } catch {
      setState(s => ({ ...s, loading: false }))
    }
  }, [])

  // Reload when filter changes
  useEffect(() => {
    fetch(searchText, statusFilter)
  }, [statusFilter])

  const handleSearch = (text: string) => {
    setSearchText(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetch(text, statusFilter), 350)
  }

  const clearSearch = () => {
    setSearchText('')
    fetch('', statusFilter)
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await fetch(searchText, statusFilter, true)
    setRefreshing(false)
  }

  const loadMore = async () => {
    if (!state.hasMore || !state.nextCursor || state.loadingMore) return
    setState(s => ({ ...s, loadingMore: true }))
    try {
      const res: any = await productApi.list({
        status:  statusFilter || undefined,
        search:  searchText || undefined,
        limit:   PAGE_SIZE,
        cursor:  state.nextCursor,
      })
      const { data: newData, hasMore, nextCursor } = parseRes(res)
      setState(s => ({
        ...s,
        data:       [...s.data, ...newData],
        hasMore,
        nextCursor,
        loadingMore: false,
      }))
    } catch {
      setState(s => ({ ...s, loadingMore: false }))
    }
  }

  const deleteProduct = (product: Product) => {
    Alert.alert('Delete Order', `Delete ${product.product_id}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await productApi.delete(product.id)
            removeProductLocally(product.id)
            setState(s => ({
              ...s,
              data:  s.data.filter(p => p.id !== product.id),
              total: Math.max(0, s.total - 1),
            }))
          } catch {
            Alert.alert('Error', 'Failed to delete order.')
          }
        },
      },
    ])
  }

  const accent = ACCENT[statusFilter] ?? '#1A56D6'

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
        {!!item.customer_phone && (
          <Text style={styles.phone}>{item.customer_phone}</Text>
        )}
        {!!item.description && (
          <Text style={styles.desc} numberOfLines={1}>{item.description}</Text>
        )}
        <Text style={styles.date}>{formatDate(item.created_at)}</Text>
      </View>
      <View style={styles.rowActions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => nav.navigate('ProductDetail', { id: item.id })}
        >
          <Ionicons name="eye-outline" size={18} color="#94A3B8" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => deleteProduct(item)}
        >
          <Ionicons name="trash-outline" size={16} color="#FDA4A4" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  )

  const ListFooter = () => {
    if (state.loadingMore) {
      return (
        <View style={styles.footerSpinner}>
          <ActivityIndicator size="small" color="#1A56D6" />
        </View>
      )
    }
    if (state.hasMore) {
      return (
        <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMore}>
          <Text style={styles.loadMoreText}>Load more</Text>
        </TouchableOpacity>
      )
    }
    if (state.data.length > 0) {
      return (
        <View style={styles.endRow}>
          <Text style={styles.endText}>All {state.total} orders loaded</Text>
        </View>
      )
    }
    return null
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="list" size={22} color="#1A56D6" />
          <Text style={styles.title}>Orders</Text>
        </View>
        <View style={styles.headerRight}>
          {state.total > 0 && (
            <View style={styles.totalBadge}>
              <Text style={styles.totalText}>{state.total}</Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => nav.navigate('CreateEditProduct', {})}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
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
      </View>

      {/* Status filter chips */}
      <View style={styles.filterRow}>
        <FlatList
          horizontal
          data={STATUS_FILTERS}
          keyExtractor={f => f.value}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
          renderItem={({ item: f }) => {
            const active = statusFilter === f.value
            const color  = active ? ACCENT[f.value] : '#94A3B8'
            return (
              <TouchableOpacity
                style={[styles.filterChip, active && { borderColor: color, backgroundColor: `${color}12` }]}
                onPress={() => setStatusFilter(f.value)}
              >
                <Text style={[styles.filterChipText, { color }]}>{f.label}</Text>
              </TouchableOpacity>
            )
          }}
        />
      </View>

      {/* List */}
      {state.loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1A56D6" />
        </View>
      ) : (
        <FlatList
          data={state.data}
          keyExtractor={p => String(p.id)}
          renderItem={renderItem}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="cube-outline" size={44} color="#E2E8F0" />
              <Text style={styles.emptyText}>
                {searchText ? 'No results found' : 'No orders yet'}
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1A56D6" />
          }
          contentContainerStyle={[styles.listContent, state.data.length === 0 && { flex: 1 }]}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title:       { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  totalBadge: {
    backgroundColor: '#EFF6FF', borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  totalText: { fontSize: 12, fontWeight: '700', color: '#1A56D6' },
  addBtn: {
    backgroundColor: '#1A56D6', width: 34, height: 34,
    borderRadius: 9, alignItems: 'center', justifyContent: 'center',
  },

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
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  filterList: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  filterChip: {
    borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
    backgroundColor: '#FFFFFF',
  },
  filterChipText: { fontSize: 12, fontWeight: '600' },

  listContent: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 24 },
  separator:   { height: 6 },

  row: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12, padding: 12,
    flexDirection: 'row', alignItems: 'flex-start',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3, elevation: 1,
  },
  rowMain:    { flex: 1, gap: 3 },
  rowTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  productId:  { fontSize: 12, fontWeight: '700', color: '#1A56D6' },
  customerName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  phone:      { fontSize: 12, color: '#64748B' },
  desc:       { fontSize: 12, color: '#94A3B8' },
  date:       { fontSize: 11, color: '#CBD5E1', marginTop: 2 },
  rowActions: { flexDirection: 'row', gap: 4, marginLeft: 8, paddingTop: 2 },
  actionBtn:  { padding: 5 },

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
