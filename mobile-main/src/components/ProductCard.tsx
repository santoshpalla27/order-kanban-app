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
      <View style={styles.row}>
        <View style={styles.idRow}>
          <Text style={styles.productId}>{product.product_id}</Text>
          {hasBadge && <View style={styles.badge} />}
        </View>
        {showStatus && <StatusChip status={product.status} size="sm" />}
      </View>

      <Text style={styles.customerName} numberOfLines={1}>{product.customer_name}</Text>

      {!!product.customer_phone && (
        <Text style={styles.meta}>{product.customer_phone}</Text>
      )}

      {!!product.description && (
        <Text style={styles.description} numberOfLines={2}>{product.description}</Text>
      )}

      <View style={styles.footer}>
        {product.assignees && product.assignees.length > 0 && (
          <Text style={styles.meta} numberOfLines={1}>
            👤 {product.assignees.map((a) => a.name).join(', ')}
          </Text>
        )}
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
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2D3748',
    gap: 5,
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
    marginTop: 2,
  },
  delivery: {
    fontSize: 11,
    color: '#FBBF24',
  },
});
