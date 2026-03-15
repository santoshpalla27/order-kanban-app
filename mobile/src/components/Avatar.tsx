import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

interface Props {
  name: string
  size?: number
  color?: string
}

export default function Avatar({ name, size = 32, color = '#1A56D6' }: Props) {
  const initials = name
    .split(' ')
    .map(w => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('')

  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
      ]}
    >
      <Text style={[styles.text, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  text:   { color: '#FFFFFF', fontWeight: '700' },
})
