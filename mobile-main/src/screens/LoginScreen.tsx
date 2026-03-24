import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, ActivityIndicator, Alert, ScrollView, Image,
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import { authApi } from '../api/services';
import { useThemeStore } from '../store/themeStore';
import { darkColors, lightColors, ThemeColors } from '../theme';

export default function LoginScreen() {
  const isDark = useThemeStore((s) => s.isDark);
  const c = isDark ? darkColors : lightColors;
  const styles = useMemo(() => makeStyles(c), [c]);

  const [mode, setMode]                   = useState<'login' | 'register'>('login');
  const [name, setName]                   = useState('');
  const [email, setEmail]                 = useState('');
  const [password, setPassword]           = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading]             = useState(false);
  const setAuth          = useAuthStore((s) => s.setAuth);
  const logoutReason     = useAuthStore((s) => s.logoutReason);
  const clearLogoutReason = useAuthStore((s) => s.clearLogoutReason);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Email and password are required');
      return;
    }
    if (mode === 'register') {
      if (!name.trim()) {
        Alert.alert('Error', 'Name is required');
        return;
      }
      if (password !== confirmPassword) {
        Alert.alert('Error', 'Passwords do not match');
        return;
      }
    }

    clearLogoutReason();
    setLoading(true);
    try {
      const res = mode === 'login'
        ? await authApi.login(email.trim(), password)
        : await authApi.register(name.trim(), email.trim(), password);

      const { access_token, refresh_token, user } = res.data;
      await setAuth(access_token, refresh_token, user);
    } catch (err: any) {
      let msg: string;
      if (!err.response) {
        msg = err.code === 'ECONNABORTED'
          ? 'Request timed out. Please try again.'
          : 'Unable to connect. Check your internet connection and try again.';
      } else {
        msg = err.response.data?.error || err.response.data?.message || 'Something went wrong. Please try again.';
      }
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior="padding"
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Logo */}
        <View style={styles.logoArea}>
          <Image source={require('../../assets/icon.png')} style={styles.logoImage} resizeMode="contain" />
          <Text style={styles.appName}>Gift Highway</Text>
          <Text style={styles.tagline}>Enriching Every Moment</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.heading}>
            {mode === 'login' ? 'Sign in to your account' : 'Create an account'}
          </Text>

          {logoutReason && (
            <View style={styles.sessionBanner}>
              <Text style={styles.sessionBannerText}>🔒 {logoutReason}</Text>
            </View>
          )}

          {mode === 'register' && (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Full Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor={c.textMuted}
                autoCapitalize="words"
              />
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={c.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={c.textMuted}
              secureTextEntry
            />
          </View>

          {mode === 'register' && (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Confirm Password</Text>
              <TextInput
                style={[
                  styles.input,
                  confirmPassword.length > 0 && password !== confirmPassword && styles.inputError,
                ]}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="••••••••"
                placeholderTextColor={c.textMuted}
                secureTextEntry
              />
              {confirmPassword.length > 0 && password !== confirmPassword && (
                <Text style={styles.fieldError}>Passwords do not match</Text>
              )}
            </View>
          )}

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitText}>{mode === 'login' ? 'Sign In' : 'Create Account'}</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchMode}
            onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setConfirmPassword(''); clearLogoutReason(); }}
          >
            <Text style={styles.switchText}>
              {mode === 'login'
                ? "Don't have an account? Register"
                : 'Already have an account? Sign in'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    container: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 32 },
    logoArea: { alignItems: 'center', gap: 8 },
    logoImage: {
      width: 86,
      height: 86,
      marginBottom: 4,
    },
    appName: { fontSize: 26, fontWeight: '800', color: c.text, letterSpacing: -0.5 },
    tagline: { fontSize: 13, color: c.textMuted },
    card: {
      backgroundColor: c.card,
      borderRadius: 24,
      padding: 24,
      borderWidth: 1,
      borderColor: c.surface2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.04,
      shadowRadius: 16,
      elevation: 3,
      gap: 16,
    },
    heading: { fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 4 },
    field: { gap: 6 },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: c.textSec },
    input: {
      backgroundColor: c.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border2,
      color: c.text,
      paddingHorizontal: 16,
      paddingVertical: 15,
      fontSize: 15,
    },
    submitBtn: {
      backgroundColor: c.brand,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 4,
      shadowColor: c.brand,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25,
      shadowRadius: 10,
      elevation: 4,
    },
    submitBtnDisabled: { opacity: 0.6 },
    submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    switchMode: { alignItems: 'center', paddingVertical: 4 },
    switchText: { fontSize: 13, color: c.brandLight, fontWeight: '500' },
    sessionBanner: {
      backgroundColor: '#F59E0B22',
      borderWidth: 1,
      borderColor: '#F59E0B66',
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    sessionBannerText: { fontSize: 13, color: '#F59E0B', fontWeight: '500' },
    inputError: { borderColor: '#EF4444' },
    fieldError: { fontSize: 12, color: '#EF4444', marginTop: 2 },
  });
}
