import React from 'react'
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useNotifStore } from '../store/notificationStore'
import type { RootStackParams } from '../types'

type NavProp = NativeStackNavigationProp<RootStackParams>

export default function NotifBell() {
  const nav         = useNavigation<NavProp>()
  const unreadCount = useNotifStore(s => s.unreadCount)
  const badge       = unreadCount > 0 ? (unreadCount > 99 ? '99+' : String(unreadCount)) : null

  return (
    <TouchableOpacity style={styles.btn} onPress={() => nav.navigate('Notifications')}>
      <Ionicons name={badge ? 'notifications' : 'notifications-outline'} size={22} color="#1A56D6" />
      {badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  btn: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center', justifyContent: 'center',
  },
  badge: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: '#EF4444', borderRadius: 8,
    minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: '#EFF6FF',
  },
  badgeText: { fontSize: 9, color: '#FFFFFF', fontWeight: '800' },
})
