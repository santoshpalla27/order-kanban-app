import React, { useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { darkColors, lightColors, ThemeColors } from '../theme';
import { authApi } from '../api/services';

export default function PendingScreen() {
  const { user, updateUser, logout } = useAuthStore();
  const isDark = useThemeStore((s) => s.isDark);
  const c = isDark ? darkColors : lightColors;
  const s = useMemo(() => makeStyles(c), [c]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll /auth/me every 5 s — when approved, updateUser triggers navigation re-render
  useEffect(() => {
    intervalRef.current = setInterval(async () => {
      try {
        const res = await authApi.getMe();
        const fresh = res.data?.user ?? res.data;
        if (fresh?.role?.name && fresh.role.name !== 'pending') {
          // Refresh token pair so the new role is encoded in the JWT
          await authApi.refreshTokens();
          updateUser(fresh);
          // AppNavigator re-evaluates isPending automatically — no explicit navigate needed
        }
      } catch {
        // server unreachable — keep waiting
      }
    }, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const handleLogout = async () => {
    try { await authApi.logout(); } catch {}
    await logout();
  };

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.container}>

        {/* Spinner icon */}
        <View style={s.iconWrap}>
          <ActivityIndicator size="large" color={c.brand} />
          <View style={s.clockIcon}>
            <Feather name="clock" size={28} color={c.brand} />
          </View>
        </View>

        {/* Heading */}
        <Text style={s.title}>Awaiting Approval</Text>
        <Text style={s.subtitle}>
          Your account has been created successfully. An administrator needs to
          approve your access before you can use the app.
        </Text>

        {/* User info card */}
        {user && (
          <View style={s.card}>
            <Text style={s.cardLabel}>Signed in as</Text>
            <Text style={s.cardName}>{user.name}</Text>
            <Text style={s.cardEmail}>{user.email}</Text>
          </View>
        )}

        {/* Polling indicator */}
        <View style={s.pollingRow}>
          <View style={s.dot} />
          <Text style={s.pollingText}>Checking for approval every 5 seconds…</Text>
        </View>

        {/* Logout */}
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Feather name="log-out" size={16} color={c.textSec} style={{ marginRight: 6 }} />
          <Text style={s.logoutText}>Sign out</Text>
        </TouchableOpacity>

      </View>
    </SafeAreaView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    container: {
      flex: 1, alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: 28, gap: 20,
    },

    iconWrap: {
      width: 80, height: 80,
      alignItems: 'center', justifyContent: 'center', marginBottom: 8,
    },
    clockIcon: { position: 'absolute' },

    title: { fontSize: 22, fontWeight: '700', color: c.text, textAlign: 'center' },
    subtitle: {
      fontSize: 14, color: c.textSec, textAlign: 'center', lineHeight: 20,
    },

    card: {
      width: '100%', backgroundColor: c.surface,
      borderRadius: 14, borderWidth: 1, borderColor: c.border2,
      paddingHorizontal: 16, paddingVertical: 14, gap: 2,
    },
    cardLabel: { fontSize: 10, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    cardName:  { fontSize: 15, fontWeight: '700', color: c.text, marginTop: 4 },
    cardEmail: { fontSize: 13, color: c.textSec },

    pollingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dot: { width: 7, height: 7, borderRadius: 99, backgroundColor: c.brand, opacity: 0.8 },
    pollingText: { fontSize: 12, color: c.textMuted },

    logoutBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      marginTop: 8, paddingVertical: 12, paddingHorizontal: 24,
      borderRadius: 12, borderWidth: 1, borderColor: c.border2,
      backgroundColor: c.surface,
    },
    logoutText: { fontSize: 14, fontWeight: '600', color: c.textSec },
  });
}
