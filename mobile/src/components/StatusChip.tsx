import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  yet_to_start: { label: 'Yet to Start', bg: '#F1F5F9', text: '#64748B' },
  in_progress:  { label: 'In Progress',  bg: '#EFF6FF', text: '#1A56D6' },
  completed:    { label: 'Completed',    bg: '#F0FDF4', text: '#16A34A' },
  hold:         { label: 'On Hold',      bg: '#FFF7ED', text: '#EA580C' },
}

interface Props {
  status: string
  small?: boolean
}

export default function StatusChip({ status, small = false }: Props) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, bg: '#F1F5F9', text: '#64748B' }
  return (
    <View style={[styles.chip, { backgroundColor: cfg.bg }, small && styles.small]}>
      <Text style={[styles.text, { color: cfg.text }, small && styles.smallText]}>
        {cfg.label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  chip:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  text:      { fontSize: 12, fontWeight: '600' },
  small:     { paddingHorizontal: 7, paddingVertical: 2 },
  smallText: { fontSize: 10 },
})
