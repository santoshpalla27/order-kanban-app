import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { Product } from '../types'

interface Props {
  product: Product
  onPress: () => void
}

export default function ProductCard({ product, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      {/* Product ID */}
      <Text style={styles.pid}>{product.product_id}</Text>

      {/* Customer name */}
      <Text style={styles.name} numberOfLines={1}>{product.customer_name}</Text>

      {/* Phone */}
      <Text style={styles.phone}>{product.customer_phone}</Text>

      {/* Description */}
      {product.description ? (
        <Text style={styles.desc} numberOfLines={2}>{product.description}</Text>
      ) : null}

      {/* Footer */}
      {(product.comments ?? []).length > 0 && (
        <View style={styles.footer}>
          <Ionicons name="chatbubble-outline" size={11} color="#BDBDBD" />
          <Text style={styles.footerText}>{(product.comments ?? []).length}</Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 6,
    marginVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  pid: {
    fontSize: 10,
    fontWeight: '600',
    color: '#9E9E9E',
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  name: {
    fontSize: 13,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 2,
  },
  phone: {
    fontSize: 11,
    color: '#757575',
    marginBottom: 4,
  },
  desc: {
    fontSize: 11,
    color: '#9E9E9E',
    lineHeight: 16,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 3,
  },
  footerText: {
    fontSize: 10,
    color: '#BDBDBD',
  },
})
