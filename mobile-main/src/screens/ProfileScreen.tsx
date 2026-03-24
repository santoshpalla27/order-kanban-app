import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Alert, ActivityIndicator, Modal, Switch, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { darkColors, lightColors, ThemeColors } from '../theme';
import { profileApi, authApi } from '../api/services';
import { Feather } from '@expo/vector-icons';

const ROLE_META: Record<string, { label: string; color: string; bg: string }> = {
  admin:     { label: 'Admin',     color: '#F87171', bg: 'rgba(239,68,68,0.15)' },
  manager:   { label: 'Manager',   color: '#FBBF24', bg: 'rgba(251,191,36,0.15)' },
  organiser: { label: 'Organiser', color: '#A78BFA', bg: 'rgba(167,139,250,0.15)' },
  employee:  { label: 'Employee',  color: '#60A5FA', bg: 'rgba(96,165,250,0.15)' },
  view_only: { label: 'View Only', color: '#94A3B8', bg: 'rgba(148,163,184,0.15)' },
};

const AVATAR_BG = [
  '#6366F1', '#8B5CF6', '#EC4899', '#F97316',
  '#10B981', '#06B6D4', '#EF4444', '#FBBF24',
];

function getAvatarBg(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_BG[Math.abs(h) % AVATAR_BG.length];
}

function formatSince(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function ProfileScreen() {
  const { user, updateUser, logout } = useAuthStore();
  const { isDark, toggle: toggleTheme } = useThemeStore();
  const c = isDark ? darkColors : lightColors;
  const s = useMemo(() => makeStyles(c), [c]);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput]     = useState(user?.name ?? '');
  const [savingName, setSavingName]   = useState(false);
  const [showLogout, setShowLogout]   = useState(false);

  const roleName = user?.role?.name ?? 'employee';
  const meta     = ROLE_META[roleName] ?? ROLE_META.employee;
  const avatarBg = getAvatarBg(user?.name ?? '');
  const initials = (user?.name ?? '?').slice(0, 2).toUpperCase();

  // ── Save name ──────────────────────────────────────────────────────────────
  const saveName = async () => {
    if (!nameInput.trim()) { Alert.alert('Error', 'Name cannot be empty'); return; }
    if (nameInput.trim() === user?.name) { setEditingName(false); return; }
    setSavingName(true);
    try {
      const res = await profileApi.update({ name: nameInput.trim() });
      updateUser(res.data);
      setEditingName(false);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error || 'Failed to update name');
      setNameInput(user?.name ?? '');
    }
    setSavingName(false);
  };

  // ── Logout ─────────────────────────────────────────────────────────────────
  const doLogout = async () => {
    setShowLogout(false);
    try { await authApi.logout(); } catch {}
    await logout();
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ── Avatar + name header ─────────────────────────────────── */}
        <View style={s.header}>
          <View style={[s.avatar, s.avatarFallback, { backgroundColor: avatarBg }]}>
            <Text style={s.initials}>{initials}</Text>
          </View>

          <Text style={s.displayName}>{user?.name ?? 'Unknown'}</Text>
          <View style={[s.rolePill, { backgroundColor: meta.bg }]}>
            <Text style={[s.rolePillText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>

        {/* ── Info card ────────────────────────────────────────────── */}
        <View style={s.card}>

          {/* Full Name */}
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={s.rowIcon}><Feather name="user" size={20} color={c.textSec} /></View>
              <View>
                <Text style={s.rowLabel}>Full Name</Text>
                {editingName ? (
                  <TextInput
                    style={s.nameInput}
                    value={nameInput}
                    onChangeText={setNameInput}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={saveName}
                    selectTextOnFocus
                    placeholderTextColor={c.textMuted}
                  />
                ) : (
                  <Text style={s.rowValue}>{user?.name ?? '—'}</Text>
                )}
              </View>
            </View>
            {editingName ? (
              <View style={s.editActions}>
                <TouchableOpacity style={s.saveBtn} onPress={saveName} disabled={savingName}>
                  {savingName
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.saveBtnTxt}>Save</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setEditingName(false); setNameInput(user?.name ?? ''); }}>
                  <Text style={s.cancelTxt}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={s.editChip}
                onPress={() => { setEditingName(true); setNameInput(user?.name ?? ''); }}
              >
                <Text style={s.editChipTxt}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={s.divider} />

          {/* Email */}
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={s.rowIcon}><Feather name="mail" size={20} color={c.textSec} /></View>
              <View>
                <Text style={s.rowLabel}>Email</Text>
                <Text style={s.rowValue}>{user?.email ?? '—'}</Text>
              </View>
            </View>
          </View>

          <View style={s.divider} />

          {/* Role */}
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={s.rowIcon}><Feather name="award" size={20} color={c.textSec} /></View>
              <View>
                <Text style={s.rowLabel}>Role</Text>
                <Text style={[s.rowValue, { color: meta.color }]}>{meta.label}</Text>
              </View>
            </View>
          </View>

          <View style={s.divider} />

          {/* Theme toggle */}
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={s.rowIcon}><Feather name={isDark ? 'moon' : 'sun'} size={20} color={c.textSec} /></View>
              <View>
                <Text style={s.rowLabel}>Appearance</Text>
                <Text style={s.rowValue}>{isDark ? 'Dark Mode' : 'Light Mode'}</Text>
              </View>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: '#CBD5E1', true: '#6366F1' }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* ── Logout ──────────────────────────────────────────────── */}
        <TouchableOpacity style={s.logoutBtn} onPress={() => setShowLogout(true)}>
          <Feather name="log-out" size={20} color="#EF4444" style={s.logoutIcon} />
          <Text style={s.logoutTxt}>Sign Out</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* ── Logout confirm ───────────────────────────────────────────── */}
      <Modal visible={showLogout} transparent animationType="fade" onRequestClose={() => setShowLogout(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowLogout(false)}>
          <View style={s.logoutModal}>
            <Feather name="log-out" size={44} color="#EF4444" style={{ marginBottom: 16 }} />
            <Text style={s.logoutTitle}>Sign Out?</Text>
            <Text style={s.logoutSub}>You'll need to log in again to access the app.</Text>
            <TouchableOpacity style={s.logoutConfirm} onPress={doLogout}>
              <Text style={s.logoutConfirmTxt}>Yes, Sign Out</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.logoutCancel} onPress={() => setShowLogout(false)}>
              <Text style={s.logoutCancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    safe:    { flex: 1, backgroundColor: c.bg },
    content: { paddingHorizontal: 20, paddingTop: 32, paddingBottom: 48, gap: 14 },

    // ── Header
    header: { alignItems: 'center', marginBottom: 8, gap: 12 },

    avatarWrap: { position: 'relative' },
    avatar: { 
      width: 110, height: 110, borderRadius: 55, 
      borderWidth: 2, borderColor: c.brand,
      shadowColor: c.brand, shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.2, shadowRadius: 12, elevation: 6
    },
    avatarFallback: { alignItems: 'center', justifyContent: 'center' },
    initials: { fontSize: 38, fontWeight: '800', color: '#fff', letterSpacing: 1 },

    cameraOverlay: {
      position: 'absolute', bottom: 2, right: 2,
      width: 34, height: 34, borderRadius: 17,
      backgroundColor: c.brand, borderWidth: 2, borderColor: c.bg,
      alignItems: 'center', justifyContent: 'center',
    },
    progressBadge: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      borderRadius: 55, backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center', justifyContent: 'center',
    },
    progressText: { fontSize: 14, fontWeight: '800', color: '#fff' },

    displayName: { fontSize: 24, fontWeight: '800', color: c.text, letterSpacing: -0.4 },

    rolePill: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 99 },
    rolePillText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },

    // ── Card
    card: {
      backgroundColor: c.card, borderRadius: 24,
      borderWidth: 1, borderColor: c.border,
      overflow: 'hidden',
      shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
      shadowOpacity: c.isDark ? 0.25 : 0.04, shadowRadius: 16, elevation: 4,
    },
    divider: { height: 1, backgroundColor: c.border, marginHorizontal: 16 },

    row: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18, paddingVertical: 18,
    },
    rowLeft:  { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
    rowIcon:  { width: 28, alignItems: 'center' },
    rowLabel: { fontSize: 11, color: c.textMuted, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 3 },
    rowValue: { fontSize: 15, color: c.text, fontWeight: '600' },

    // Name edit
    nameInput: {
      backgroundColor: c.surface, borderRadius: 12, borderWidth: 1,
      borderColor: c.brand, color: c.text, paddingHorizontal: 10,
      paddingVertical: 6, fontSize: 15, fontWeight: '600', minWidth: 140,
    },
    editActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    saveBtn: {
      backgroundColor: c.brand, paddingHorizontal: 14, paddingVertical: 7,
      borderRadius: 12, minWidth: 52, alignItems: 'center',
    },
    saveBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
    cancelTxt:  { color: c.textMuted, fontWeight: '700', fontSize: 17, paddingHorizontal: 4 },

    editChip: {
      backgroundColor: 'rgba(99,102,241,0.12)', paddingHorizontal: 12,
      paddingVertical: 6, borderRadius: 99, borderWidth: 1, borderColor: 'rgba(99,102,241,0.25)',
    },
    editChipTxt: { fontSize: 12, fontWeight: '700', color: c.brandLight },

    // ── Logout button
    logoutBtn: {
      backgroundColor: 'rgba(239,68,68,0.07)', borderRadius: 24, borderWidth: 1,
      borderColor: 'rgba(239,68,68,0.18)', flexDirection: 'row',
      alignItems: 'center', justifyContent: 'center',
      paddingVertical: 15, gap: 10,
    },
    logoutIcon: {},
    logoutTxt:  { fontSize: 15, fontWeight: '700', color: '#EF4444' },

    // ── Logout modal
    overlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.72)',
      alignItems: 'center', justifyContent: 'center', padding: 28,
    },
    logoutModal: {
      backgroundColor: c.card, borderRadius: 28, borderWidth: 1,
      borderColor: c.border, padding: 30, width: '100%', alignItems: 'center',
      shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.4, shadowRadius: 24, elevation: 14,
    },
    logoutTitle: { fontSize: 22, fontWeight: '800', color: c.text, marginBottom: 8 },
    logoutSub:   { fontSize: 14, color: c.textMuted, textAlign: 'center', marginBottom: 28, lineHeight: 20 },
    logoutConfirm: {
      backgroundColor: '#EF4444', width: '100%', paddingVertical: 15,
      borderRadius: 16, alignItems: 'center', marginBottom: 10,
    },
    logoutConfirmTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },
    logoutCancel: {
      backgroundColor: c.surface, width: '100%', paddingVertical: 15,
      borderRadius: 16, alignItems: 'center',
    },
    logoutCancelTxt: { fontSize: 15, fontWeight: '600', color: c.textMuted },
  });
}
