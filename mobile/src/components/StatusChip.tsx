import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { STATUS_BG, STATUS_TEXT, statusLabel } from '../utils/helpers'

interface Props { status: string; small?: boolean }

export default function StatusChip({ status, small }: Props) {
  return (
    <View style={[
      styles.chip,
      { backgroundColor: STATUS_BG[status] ?? '#F5F5F5' },
      small && styles.small,
    ]}>
      <Text style={[
        styles.text,
        { color: STATUS_TEXT[status] ?? '#555' },
        small && styles.smallText,
      ]}>
        {statusLabel(status)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
  small: { paddingHorizontal: 7, paddingVertical: 2 },
  smallText: { fontSize: 10 },
})
