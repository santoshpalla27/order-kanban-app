import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { getInitials } from '../utils/helpers'

const COLORS = ['#1E88E5','#43A047','#FB8C00','#E53935','#8E24AA','#00ACC1']

interface Props { name: string; size?: number }

export default function Avatar({ name, size = 36 }: Props) {
  const color  = COLORS[name.charCodeAt(0) % COLORS.length]
  const radius = size / 2
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: radius, backgroundColor: color }]}>
      <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{getInitials(name)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  circle:   { alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#FFFFFF', fontWeight: '700' },
})
