import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Product } from '../types';
import StatusChip from './StatusChip';
import { formatDate } from '../utils/helpers';

interface Props {
  product: Product;
  onPress: () => void;
  showStatus?: boolean;
  hasBadge?: boolean;
}

export default function ProductCard({ product, onPress, showStatus = true, hasBadge = false }: Props) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      {/* Top row: order ID + badge */}
      <View style={styles.row}>
        <View style={styles.idRow}>
          <Text style={styles.productId}>{product.product_id}</Text>
          {hasBadge && <View style={styles.badge} />}
        </View>
        {showStatus && <StatusChip status={product.status} size="sm" />}
      </View>

      {/* Bottom row: assignees left, delivery date right */}
      <View style={styles.footer}>
        <Text style={styles.assignees} numberOfLines={1}>
          {product.assignees && product.assignees.length > 0
            ? '👤 ' + product.assignees.map((a) => a.name).join(', ')
            : '👤 Unassigned'}
        </Text>
        {product.delivery_at && (
          <Text style={styles.delivery}>
            📅 {formatDate(product.delivery_at)}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1C2130',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2D3748',
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  productId: {
    fontSize: 12,
    fontWeight: '700',
    color: '#818CF8',
    fontFamily: 'monospace',
  },
  badge: {
    width: 8,
    height: 8,
    borderRadius: 99,
    backgroundColor: '#EF4444',
  },
  customerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F1F5F9',
  },
  meta: {
    fontSize: 12,
    color: '#94A3B8',
    flex: 1,
  },
  description: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  assignees: {
    fontSize: 12,
    color: '#94A3B8',
    flex: 1,
  },
  delivery: {
    fontSize: 11,
    color: '#FBBF24',
  },
});
