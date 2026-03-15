import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../store/authStore'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParams } from '../types'

type Props = NativeStackScreenProps<RootStackParams, 'Login'>

export default function LoginScreen({ navigation }: Props) {
  const [email,   setEmail]   = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const { login, isLoading, error, clearError } = useAuthStore()

  const handleLogin = async () => {
    if (!email || !password) { Alert.alert('Required', 'Enter email and password'); return }
    const ok = await login(email, password)
    if (ok) navigation.replace('Main')
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Blue gradient top */}
      <View style={styles.hero}>
        <Ionicons name="grid" size={48} color="rgba(255,255,255,0.9)" />
        <Text style={styles.heroTitle}>Kanban</Text>
        <Text style={styles.heroSub}>Manage your orders efficiently</Text>
      </View>

      {/* White card */}
      <ScrollView
        style={styles.card}
        contentContainerStyle={styles.cardContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Sign In</Text>
        <Text style={styles.subtitle}>Welcome back! Please sign in.</Text>

        {/* Error */}
        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color="#E53935" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={clearError}>
              <Ionicons name="close" size={16} color="#E53935" />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Email */}
        <Text style={styles.label}>Email</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="mail-outline" size={18} color="#1A73E8" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#BDBDBD"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />
        </View>

        {/* Password */}
        <Text style={styles.label}>Password</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="lock-closed-outline" size={18} color="#1A73E8" style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#BDBDBD"
            secureTextEntry={!showPwd}
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />
          <TouchableOpacity onPress={() => setShowPwd(!showPwd)} style={styles.eyeBtn}>
            <Ionicons name={showPwd ? 'eye-off-outline' : 'eye-outline'} size={18} color="#9E9E9E" />
          </TouchableOpacity>
        </View>

        {/* Button */}
        <TouchableOpacity
          style={[styles.btn, isLoading && styles.btnDisabled]}
          onPress={handleLogin}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          {isLoading
            ? <ActivityIndicator color="#FFF" />
            : <Text style={styles.btnText}>Sign In</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1A73E8' },
  hero: {
    flex: 0.42,
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    paddingHorizontal: 32,
    paddingBottom: 32,
  },
  heroTitle: { fontSize: 38, fontWeight: '800', color: '#FFFFFF', marginTop: 8 },
  heroSub:   { fontSize: 15, color: 'rgba(255,255,255,0.8)', marginTop: 4 },

  card: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
  },
  cardContent: { paddingHorizontal: 28, paddingTop: 36, paddingBottom: 40 },

  title:    { fontSize: 24, fontWeight: '800', color: '#212121' },
  subtitle: { fontSize: 14, color: '#757575', marginTop: 4, marginBottom: 24 },

  label: { fontSize: 13, fontWeight: '600', color: '#424242', marginBottom: 6, marginTop: 14 },

  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: '#FAFAFA',
  },
  inputIcon: { marginRight: 8 },
  input: {
    flex: 1,
    height: 50,
    fontSize: 15,
    color: '#212121',
  },
  eyeBtn: { padding: 4 },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  errorText: { flex: 1, color: '#E53935', fontSize: 13 },

  btn: {
    marginTop: 28,
    backgroundColor: '#1A73E8',
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1A73E8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
})
