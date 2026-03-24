import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Product } from '../types';
import StatusChip from './StatusChip';
import { formatDate } from '../utils/helpers';
import { useThemeStore } from '../store/themeStore';
import { darkColors, lightColors, ThemeColors } from '../theme';
import { Feather } from '@expo/vector-icons';

interface Props {
  product: Product;
  onPress: () => void;
  showStatus?: boolean;
  hasBadge?: boolean;
}

export default function ProductCard({ product, onPress, showStatus = true, hasBadge = false }: Props) {
  const isDark = useThemeStore((s) => s.isDark);
  const c = isDark ? darkColors : lightColors;
  const styles = useMemo(() => makeStyles(c), [c]);

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
        <View style={styles.assigneeWrap}>
          <Feather name="user" size={12} color={c.textSec} style={{ marginTop: 1 }} />
          <Text style={styles.assignees} numberOfLines={1}>
            {product.assignees && product.assignees.length > 0
              ? product.assignees.map((a) => a.name).join(', ')
              : 'Unassigned'}
          </Text>
        </View>
        {product.delivery_at && (
          <View style={styles.deliveryWrap}>
            <Feather name="calendar" size={12} color="#FBBF24" style={{ marginTop: 1 }} />
            <Text style={styles.delivery}>
              {formatDate(product.delivery_at)}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderRadius: 20,
      padding: 18,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: c.border2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: c.isDark ? 0.3 : 0.05,
      shadowRadius: 12,
      elevation: 3,
      gap: 12,
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
      color: c.brandLight,
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
      color: c.text,
    },
    meta: {
      fontSize: 12,
      color: c.textSec,
      flex: 1,
    },
    description: {
      fontSize: 12,
      color: c.textMuted,
      lineHeight: 17,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 6,
    },
    assigneeWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    assignees: {
      fontSize: 12,
      color: c.textSec,
      flexShrink: 1,
    },
    deliveryWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    delivery: {
      fontSize: 11,
      color: '#FBBF24',
      fontWeight: '600',
    },
  });
}
