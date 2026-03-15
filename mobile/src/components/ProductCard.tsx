import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { Product } from '../types'

const STATUS_COLORS: Record<string, { dot: string; bg: string; text: string }> = {
  yet_to_start: { dot: '#94A3B8', bg: '#F1F5F9', text: '#475569' },
  working:      { dot: '#3B82F6', bg: '#EFF6FF', text: '#1D4ED8' },
  review:       { dot: '#F59E0B', bg: '#FFFBEB', text: '#B45309' },
  done:         { dot: '#22C55E', bg: '#F0FDF4', text: '#15803D' },
}

const STATUS_LABEL: Record<string, string> = {
  yet_to_start: 'Yet to Start',
  working:      'In Progress',
  review:       'In Review',
  done:         'Done',
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

interface Props {
  product: Product
  onPress: () => void
}

export default function ProductCard({ product, onPress }: Props) {
  const cfg = STATUS_COLORS[product.status] ?? STATUS_COLORS.yet_to_start
  const commentCount    = (product.comments    ?? []).length
  const attachmentCount = (product.attachments ?? []).length

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.82}>
      {/* Top row: product_id + status badge */}
      <View style={styles.topRow}>
        <Text style={styles.productId}>{product.product_id}</Text>
        <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
          <View style={[styles.dot, { backgroundColor: cfg.dot }]} />
          <Text style={[styles.badgeText, { color: cfg.text }]}>
            {STATUS_LABEL[product.status] ?? product.status}
          </Text>
        </View>
      </View>

      {/* Customer name */}
      <Text style={styles.customerName} numberOfLines={1}>{product.customer_name}</Text>

      {/* Description preview */}
      {!!product.description && (
        <Text style={styles.desc} numberOfLines={2}>{product.description}</Text>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          {commentCount > 0 && (
            <View style={styles.meta}>
              <Ionicons name="chatbubble-outline" size={11} color="#94A3B8" />
              <Text style={styles.metaText}>{commentCount}</Text>
            </View>
          )}
          {attachmentCount > 0 && (
            <View style={styles.meta}>
              <Ionicons name="attach-outline" size={11} color="#94A3B8" />
              <Text style={styles.metaText}>{attachmentCount}</Text>
            </View>
          )}
        </View>
        <Text style={styles.date}>{formatDate(product.created_at)}</Text>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  productId: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1A56D6',
    letterSpacing: 0.3,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 20,
  },
  dot:       { width: 5, height: 5, borderRadius: 3 },
  badgeText: { fontSize: 10, fontWeight: '600' },
  customerName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  desc: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
    marginBottom: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  footerLeft: { flexDirection: 'row', gap: 10 },
  meta:       { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText:   { fontSize: 10, color: '#94A3B8', fontWeight: '500' },
  date:       { fontSize: 10, color: '#CBD5E1', fontWeight: '500' },
})
