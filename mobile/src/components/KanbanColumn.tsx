import React from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import ProductCard from './ProductCard'
import { STATUS_HDR, STATUS_BG, statusLabel } from '../utils/helpers'
import type { ColumnState } from '../store/boardStore'
import type { Product } from '../types'

interface Props {
  status:      string
  column:      ColumnState
  onCardPress: (id: number) => void
  onLoadMore:  () => void
}

export default function KanbanColumn({ status, column, onCardPress, onLoadMore }: Props) {
  const { data, total, hasMore, isLoading, isLoadingMore } = column

  return (
    <View style={[styles.container, { backgroundColor: STATUS_BG[status] ?? '#F5F5F5' }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: STATUS_HDR[status] ?? '#888' }]}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {statusLabel(status)}
        </Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{total}</Text>
        </View>
      </View>

      {/* Cards */}
      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={STATUS_HDR[status] ?? '#888'} size="small" />
        </View>
      ) : (
        <ScrollView
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
        >
          {data.length === 0 ? (
            <Text style={styles.empty}>No items</Text>
          ) : (
            data.map((p: Product) => (
              <ProductCard key={p.id} product={p} onPress={() => onCardPress(p.id)} />
            ))
          )}

          {/* Load more */}
          {hasMore && (
            <TouchableOpacity
              style={styles.loadMoreBtn}
              onPress={onLoadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? (
                <ActivityIndicator color="#9E9E9E" size="small" />
              ) : (
                <>
                  <Ionicons name="chevron-down" size={12} color="#9E9E9E" />
                  <Text style={styles.loadMoreText}>Load more</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
    flex: 1,
  },
  countBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  countText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 11,
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  list: {
    paddingBottom: 6,
    paddingTop: 2,
  },
  empty: {
    textAlign: 'center',
    color: '#BDBDBD',
    fontSize: 12,
    paddingVertical: 12,
  },
  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    marginTop: 2,
  },
  loadMoreText: {
    fontSize: 11,
    color: '#9E9E9E',
  },
})
