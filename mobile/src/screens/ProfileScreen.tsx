import React, { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, FlatList, ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import Avatar from '../components/Avatar'
import { useAuthStore } from '../store/authStore'
import { userApi, productApi } from '../api/services'
import { formatDate, statusLabel } from '../utils/helpers'
import type { User, ActivityLog } from '../types'

const ROLE_COLOR: Record<string, string> = {
  admin:     '#E53935',
  manager:   '#1A73E8',
  organiser: '#FB8C00',
  employee:  '#43A047',
  view_only: '#757575',
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets()
  const { user, role, logout, loadUser } = useAuthStore()
  const [users,    setUsers]    = useState<User[]>([])
  const [activity, setActivity] = useState<ActivityLog[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [tab, setTab] = useState<'info' | 'activity' | 'users'>('info')
  const isAdmin = role === 'admin'

  useEffect(() => {
    loadUser()
    productApi.getActivity(30).then(setActivity).catch(() => {})
    if (isAdmin) {
      setLoadingUsers(true)
      userApi.all().then(setUsers).finally(() => setLoadingUsers(false))
    }
  }, [])

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ])
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={20} color="#E53935" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Profile card */}
      {user && (
        <View style={styles.profileCard}>
          <Avatar name={user.name} size={64} />
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user.name}</Text>
            <Text style={styles.profileEmail}>{user.email}</Text>
            <View style={[styles.roleBadge, { backgroundColor: (ROLE_COLOR[role] ?? '#757575') + '20' }]}>
              <Text style={[styles.roleText, { color: ROLE_COLOR[role] ?? '#757575' }]}>
                {role.charAt(0).toUpperCase() + role.slice(1).replace('_', ' ')}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['info', 'activity', isAdmin ? 'users' : null] as const)
          .filter(Boolean).map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.tab, tab === t && styles.tabActive]}
              onPress={() => setTab(t!)}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === 'info' ? 'Info' : t === 'activity' ? 'Activity' : 'Users'}
              </Text>
            </TouchableOpacity>
          ))}
      </View>

      {/* Content */}
      <ScrollView contentContainerStyle={styles.content}>
        {tab === 'info' && user && (
          <View style={styles.card}>
            <InfoRow icon="mail-outline"          label="Email"    value={user.email} />
            <InfoRow icon="shield-checkmark-outline" label="Role"  value={role} />
            <InfoRow icon="calendar-outline"      label="Joined"   value={formatDate(user.created_at ?? '')} />
          </View>
        )}

        {tab === 'activity' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            {activity.length === 0
              ? <Text style={styles.empty}>No recent activity</Text>
              : activity.slice(0, 20).map(a => (
                  <View key={a.id} style={styles.activityRow}>
                    <View style={styles.activityDot} />
                    <View style={styles.activityContent}>
                      <Text style={styles.activityDetails}>{a.details}</Text>
                      <Text style={styles.activityTime}>{formatDate(a.created_at)}</Text>
                    </View>
                  </View>
                ))
            }
          </View>
        )}

        {tab === 'users' && isAdmin && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Team Members ({users.length})</Text>
            {loadingUsers
              ? <ActivityIndicator color="#1A73E8" />
              : users.map(u => (
                  <View key={u.id} style={styles.userRow}>
                    <Avatar name={u.name} size={36} />
                    <View style={styles.userInfo}>
                      <Text style={styles.userName}>{u.name}</Text>
                      <Text style={styles.userEmail}>{u.email}</Text>
                    </View>
                    <View style={[
                      styles.userRoleBadge,
                      { backgroundColor: (ROLE_COLOR[u.role.name] ?? '#757575') + '18' }
                    ]}>
                      <Text style={[
                        styles.userRoleText,
                        { color: ROLE_COLOR[u.role.name] ?? '#757575' }
                      ]}>
                        {u.role.name}
                      </Text>
                    </View>
                  </View>
                ))
            }
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  )
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon as any} size={18} color="#9E9E9E" style={{ width: 26 }} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: '#F8F9FA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#212121' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  logoutText: { color: '#E53935', fontSize: 14, fontWeight: '600' },

  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  profileInfo: { flex: 1 },
  profileName:  { fontSize: 18, fontWeight: '800', color: '#212121' },
  profileEmail: { fontSize: 13, color: '#757575', marginTop: 2 },
  roleBadge: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, marginTop: 6 },
  roleText: { fontSize: 12, fontWeight: '700' },

  tabs: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#1A73E8' },
  tabText:      { fontSize: 13, color: '#9E9E9E', fontWeight: '600' },
  tabTextActive:{ color: '#1A73E8' },

  content: { padding: 12 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#212121', marginBottom: 12 },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
    gap: 6,
  },
  infoLabel: { fontSize: 13, color: '#9E9E9E', width: 70 },
  infoValue: { flex: 1, fontSize: 13, color: '#212121', fontWeight: '500' },

  activityRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
    alignItems: 'flex-start',
  },
  activityDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#1A73E8', marginTop: 4,
  },
  activityContent: { flex: 1 },
  activityDetails: { fontSize: 13, color: '#424242' },
  activityTime:    { fontSize: 11, color: '#9E9E9E', marginTop: 2 },

  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
    gap: 10,
  },
  userInfo:     { flex: 1 },
  userName:     { fontSize: 14, fontWeight: '700', color: '#212121' },
  userEmail:    { fontSize: 12, color: '#757575' },
  userRoleBadge:{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  userRoleText: { fontSize: 11, fontWeight: '700' },

  empty: { color: '#9E9E9E', textAlign: 'center', paddingVertical: 20, fontSize: 13 },
})
