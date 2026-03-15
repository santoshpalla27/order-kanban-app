import React from 'react'
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { ColumnState } from '../store/boardStore'
import type { Product, RootStackParams } from '../types'
import ProductCard from './ProductCard'

const COLUMN_CONFIG: Record<string, { label: string; color: string; accent: string }> = {
  yet_to_start: { label: 'Yet to Start', color: '#F1F5F9', accent: '#94A3B8' },
  working:      { label: 'In Progress',  color: '#EFF6FF', accent: '#1A56D6' },
  review:       { label: 'In Review',    color: '#FFFBEB', accent: '#D97706' },
  done:         { label: 'Done',         color: '#F0FDF4', accent: '#16A34A' },
}

interface Props {
  status:   string
  column:   ColumnState
  onLoadMore: () => void
}

export default function KanbanColumn({ status, column, onLoadMore }: Props) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParams>>()
  const cfg = COLUMN_CONFIG[status] ?? COLUMN_CONFIG.yet_to_start

  const renderItem = ({ item }: { item: Product }) => (
    <ProductCard
      product={item}
      onPress={() => nav.navigate('ProductDetail', { id: item.id })}
    />
  )

  const footer = () => {
    if (column.isLoadingMore) {
      return (
        <View style={styles.footerSpinner}>
          <ActivityIndicator size="small" color={cfg.accent} />
        </View>
      )
    }
    if (column.hasMore) {
      return (
        <TouchableOpacity style={[styles.loadMoreBtn, { borderColor: cfg.accent }]} onPress={onLoadMore}>
          <Text style={[styles.loadMoreText, { color: cfg.accent }]}>Load more</Text>
        </TouchableOpacity>
      )
    }
    return null
  }

  return (
    <View style={styles.column}>
      {/* Column header */}
      <View style={[styles.header, { backgroundColor: cfg.color }]}>
        <View style={[styles.dot, { backgroundColor: cfg.accent }]} />
        <Text style={[styles.label, { color: cfg.accent }]}>{cfg.label}</Text>
        <View style={[styles.countBadge, { backgroundColor: cfg.accent }]}>
          <Text style={styles.countText}>
            {column.isLoading ? '…' : column.total}
          </Text>
        </View>
      </View>

      {/* Card list */}
      {column.isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={cfg.accent} />
        </View>
      ) : (
        <FlatList
          data={column.data}
          keyExtractor={item => String(item.id)}
          renderItem={renderItem}
          ListFooterComponent={footer}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No orders</Text>
            </View>
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  column: {
    width: 260,
    marginRight: 12,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 8,
    gap: 6,
  },
  dot:   { width: 8, height: 8, borderRadius: 4 },
  label: { flex: 1, fontSize: 13, fontWeight: '700' },
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countText:  { fontSize: 11, color: '#FFFFFF', fontWeight: '700' },
  list:       { paddingBottom: 8 },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 120 },
  empty:      { alignItems: 'center', paddingVertical: 32 },
  emptyText:  { fontSize: 13, color: '#CBD5E1', fontWeight: '500' },
  footerSpinner: { paddingVertical: 12, alignItems: 'center' },
  loadMoreBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  loadMoreText: { fontSize: 12, fontWeight: '600' },
})
