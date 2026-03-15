import React, { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthStore } from '../store/authStore'
import { userApi } from '../api/services'

const AVATAR_COLORS = ['#6366F1','#8B5CF6','#EC4899','#F59E0B','#10B981','#3B82F6','#EF4444','#14B8A6']

function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0]?.toUpperCase() ?? '').slice(0, 2).join('')
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets()
  const { user, loadUser, logout } = useAuthStore()

  const [editing,  setEditing]  = useState(false)
  const [nameVal,  setNameVal]  = useState(user?.name ?? '')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState(false)

  const color = avatarColor(user?.name ?? 'U')
  const abbr  = initials(user?.name ?? '?')

  const handleEdit = () => {
    setNameVal(user?.name ?? '')
    setError('')
    setSuccess(false)
    setEditing(true)
  }

  const handleCancel = () => {
    setEditing(false)
    setError('')
  }

  const handleSave = async () => {
    const name = nameVal.trim()
    if (!name) { setError('Name cannot be empty.'); return }
    if (name === user?.name) { setEditing(false); return }
    setSaving(true)
    setError('')
    try {
      await userApi.updateMe({ name })
      await loadUser()           // refresh user in store
      setSuccess(true)
      setEditing(false)
      setTimeout(() => setSuccess(false), 2000)
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ])
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
        {!editing ? (
          <TouchableOpacity style={styles.editBtn} onPress={handleEdit}>
            <Ionicons name="create-outline" size={18} color="#1A56D6" />
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.editBtn} onPress={handleCancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={[styles.avatarCircle, { backgroundColor: color }]}>
            <Text style={styles.avatarText}>{abbr}</Text>
          </View>
          {success && (
            <View style={styles.successBadge}>
              <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
              <Text style={styles.successText}>Saved!</Text>
            </View>
          )}
        </View>

        {/* Name card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Account</Text>

          <View style={styles.fieldRow}>
            <View style={styles.fieldLabelRow}>
              <Ionicons name="person-outline" size={15} color="#94A3B8" />
              <Text style={styles.fieldLabel}>Name</Text>
            </View>
            {editing ? (
              <TextInput
                style={styles.nameInput}
                value={nameVal}
                onChangeText={setNameVal}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSave}
                maxLength={80}
              />
            ) : (
              <Text style={styles.fieldValue}>{user?.name ?? '—'}</Text>
            )}
          </View>

          {!!error && (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle-outline" size={13} color="#EF4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {editing && (
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Text style={styles.saveBtnText}>Save Name</Text>
              }
            </TouchableOpacity>
          )}

          <View style={styles.divider} />

          <View style={styles.fieldRow}>
            <View style={styles.fieldLabelRow}>
              <Ionicons name="mail-outline" size={15} color="#94A3B8" />
              <Text style={styles.fieldLabel}>Email</Text>
            </View>
            <Text style={styles.fieldValue}>{user?.email ?? '—'}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.fieldRow}>
            <View style={styles.fieldLabelRow}>
              <Ionicons name="shield-outline" size={15} color="#94A3B8" />
              <Text style={styles.fieldLabel}>Role</Text>
            </View>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{user?.role?.name ?? '—'}</Text>
            </View>
          </View>
        </View>

        {/* App info */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>App</Text>

          <View style={styles.fieldRow}>
            <View style={styles.fieldLabelRow}>
              <Ionicons name="grid-outline" size={15} color="#94A3B8" />
              <Text style={styles.fieldLabel}>Version</Text>
            </View>
            <Text style={styles.fieldValue}>1.0.0</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.fieldRow}>
            <View style={styles.fieldLabelRow}>
              <Ionicons name="server-outline" size={15} color="#94A3B8" />
              <Text style={styles.fieldLabel}>Backend</Text>
            </View>
            <Text style={[styles.fieldValue, styles.fieldValueSmall]}>
              app.santoshdevops.cloud
            </Text>
          </View>
        </View>

        {/* Sign out */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={18} color="#EF4444" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  title:      { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  editBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  editBtnText:{ fontSize: 14, fontWeight: '600', color: '#1A56D6' },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#94A3B8' },

  scroll: { paddingHorizontal: 16, paddingTop: 24, gap: 16 },

  avatarSection: { alignItems: 'center', marginBottom: 4 },
  avatarCircle: {
    width: 88, height: 88, borderRadius: 44,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10, elevation: 6,
  },
  avatarText: { fontSize: 34, fontWeight: '800', color: '#FFFFFF' },

  successBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F0FDF4', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
    marginTop: 10,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  successText: { fontSize: 12, fontWeight: '600', color: '#16A34A' },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 4,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4, elevation: 1,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#94A3B8',
    textTransform: 'uppercase', letterSpacing: 0.6,
    marginTop: 12, marginBottom: 4,
  },
  fieldRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
  },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  fieldLabel:    { fontSize: 14, color: '#64748B', fontWeight: '500' },
  fieldValue:    { fontSize: 14, color: '#0F172A', fontWeight: '600', maxWidth: '55%', textAlign: 'right' },
  fieldValueSmall: { fontSize: 12, color: '#64748B', fontWeight: '400' },
  divider: { height: 1, backgroundColor: '#F8FAFC' },

  nameInput: {
    flex: 1, marginLeft: 16,
    fontSize: 14, fontWeight: '600', color: '#0F172A',
    textAlign: 'right',
    borderBottomWidth: 1, borderBottomColor: '#1A56D6',
    paddingBottom: 2,
  },

  errorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingBottom: 8,
  },
  errorText: { fontSize: 12, color: '#EF4444' },

  saveBtn: {
    backgroundColor: '#1A56D6', borderRadius: 10,
    paddingVertical: 11, alignItems: 'center',
    marginBottom: 10,
  },
  saveBtnDisabled: { backgroundColor: '#93C5FD' },
  saveBtnText:     { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  roleBadge: {
    backgroundColor: '#EFF6FF', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  roleBadgeText: {
    fontSize: 12, fontWeight: '700', color: '#1A56D6',
    textTransform: 'capitalize',
  },

  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14,
    backgroundColor: '#FEF2F2', borderRadius: 14,
    borderWidth: 1, borderColor: '#FECACA',
  },
  logoutText: { fontSize: 15, fontWeight: '700', color: '#EF4444' },
})
