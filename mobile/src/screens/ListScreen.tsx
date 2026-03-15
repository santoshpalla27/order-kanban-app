import React, { useCallback, useState } from 'react'
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  FlatList, RefreshControl, ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

import StatusChip from '../components/StatusChip'
import Avatar from '../components/Avatar'
import { productApi } from '../api/services'
import { useAuthStore } from '../store/authStore'
import { formatDate } from '../utils/helpers'
import { ALL_STATUSES, statusLabel, STATUS_HDR } from '../utils/helpers'
import type { Product, RootStackParams } from '../types'

type Nav = NativeStackNavigationProp<RootStackParams>

export default function ListScreen() {
  const insets = useSafeAreaInsets()
  const nav    = useNavigation<Nav>()
  const { role } = useAuthStore()
  const [products,     setProducts]     = useState<Product[]>([])
  const [isLoading,    setIsLoading]    = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [localSearch,  setLocalSearch]  = useState('')

  const load = useCallback(async (refreshing = false) => {
    if (refreshing) setIsRefreshing(true); else setIsLoading(true)
    try {
      const res: any = await productApi.list()
      setProducts(Array.isArray(res) ? res : (res.data ?? []))
    } catch {}
    setIsLoading(false)
    setIsRefreshing(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, []))

  const canCreate = ['admin','manager','organiser'].includes(role)

  const filtered = products.filter(p => {
    const matchStatus = activeFilter === 'all' || p.status === activeFilter
    const matchSearch = !localSearch ||
      p.customer_name.toLowerCase().includes(localSearch.toLowerCase()) ||
      p.product_id.toLowerCase().includes(localSearch.toLowerCase())
    return matchStatus && matchSearch
  })

  const renderItem = ({ item }: { item: Product }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() => nav.navigate('ProductDetail', { id: item.id })}
      activeOpacity={0.7}
    >
      <View style={[styles.statusBar, { backgroundColor: STATUS_HDR[item.status] }]} />
      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Text style={styles.rowPid}>{item.product_id}</Text>
          <StatusChip status={item.status} small />
        </View>
        <Text style={styles.rowName} numberOfLines={1}>{item.customer_name}</Text>
        <Text style={styles.rowPhone}>{item.customer_phone}</Text>
        {item.description ? (
          <Text style={styles.rowDesc} numberOfLines={1}>{item.description}</Text>
        ) : null}
        <View style={styles.rowFooter}>
          {item.creator && (
            <View style={styles.rowCreator}>
              <Avatar name={item.creator.name} size={18} />
              <Text style={styles.rowCreatorName}>{item.creator.name}</Text>
            </View>
          )}
          <Text style={styles.rowDate}>{formatDate(item.created_at)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  )

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>All Orders</Text>
        {canCreate && (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => nav.navigate('CreateEditProduct', {})}
          >
            <Ionicons name="add" size={20} color="#FFF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={16} color="#9E9E9E" />
        <TextInput
          style={styles.searchInput}
          value={localSearch}
          onChangeText={setLocalSearch}
          placeholder="Search by name or ID…"
          placeholderTextColor="#BDBDBD"
          returnKeyType="search"
        />
        {localSearch.length > 0 && (
          <TouchableOpacity onPress={() => setLocalSearch('')}>
            <Ionicons name="close-circle" size={16} color="#BDBDBD" />
          </TouchableOpacity>
        )}
      </View>

      {/* Status filter pills */}
      <View style={styles.filters}>
        {['all', ...ALL_STATUSES].map(s => (
          <TouchableOpacity
            key={s}
            style={[styles.pill, activeFilter === s && styles.pillActive]}
            onPress={() => setActiveFilter(s)}
          >
            <Text style={[styles.pillText, activeFilter === s && styles.pillTextActive]}>
              {s === 'all' ? 'All' : statusLabel(s)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Count */}
      <Text style={styles.count}>{filtered.length} orders</Text>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={i => String(i.id)}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => load(true)} colors={['#1A73E8']} />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          isLoading
            ? <ActivityIndicator color="#1A73E8" style={{ marginTop: 40 }} />
            : <Text style={styles.empty}>No orders found</Text>
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: '#F8F9FA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  title:  { fontSize: 20, fontWeight: '800', color: '#212121' },
  addBtn: {
    backgroundColor: '#1A73E8',
    borderRadius: 8,
    padding: 6,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 8,
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#212121', padding: 0 },

  filters: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 6,
    flexWrap: 'wrap',
  },
  pill: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: '#F0F0F0',
  },
  pillActive: { backgroundColor: '#1A73E8' },
  pillText:   { fontSize: 12, fontWeight: '600', color: '#757575' },
  pillTextActive: { color: '#FFF' },

  count: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
    fontSize: 12,
    color: '#9E9E9E',
    fontWeight: '500',
  },

  listContent: { paddingHorizontal: 12, paddingBottom: 24 },
  row: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginVertical: 5,
    flexDirection: 'row',
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 3,
  },
  statusBar: { width: 4 },
  rowContent: { flex: 1, padding: 12 },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  rowPid:  { fontSize: 10, color: '#9E9E9E', fontWeight: '600', textTransform: 'uppercase' },
  rowName: { fontSize: 14, fontWeight: '700', color: '#212121', marginBottom: 2 },
  rowPhone:{ fontSize: 12, color: '#757575' },
  rowDesc: { fontSize: 12, color: '#9E9E9E', marginTop: 3 },
  rowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  rowCreator: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowCreatorName: { fontSize: 11, color: '#757575' },
  rowDate: { fontSize: 11, color: '#BDBDBD' },
  empty: { textAlign: 'center', color: '#9E9E9E', marginTop: 60, fontSize: 14 },
})
