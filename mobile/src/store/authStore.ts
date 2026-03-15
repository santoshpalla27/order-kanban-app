import { create } from 'zustand'
import { authApi } from '../api/services'
import { tokenManager } from '../utils/tokenManager'
import { wsManager } from '../websocket/wsManager'
import type { User } from '../types'

interface AuthState {
  user:       User | null
  role:       string
  isLoading:  boolean
  error:      string | null
  login:      (email: string, password: string) => Promise<boolean>
  logout:     () => Promise<void>
  loadUser:   () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user:      null,
  role:      '',
  isLoading: false,
  error:     null,

  login: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      const res = await authApi.login({ email: email.trim(), password })
      await tokenManager.saveTokens(res.access_token, res.refresh_token)
      await tokenManager.saveUserInfo(res.user.id, res.user.name, res.user.role.name)
      set({ user: res.user, role: res.user.role.name, isLoading: false })
      wsManager.connect()
      return true
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? e?.message ?? 'Login failed'
      set({ isLoading: false, error: msg })
      return false
    }
  },

  logout: async () => {
    wsManager.disconnect()
    try { await authApi.logout() } catch {}
    await tokenManager.clear()
    set({ user: null, role: '' })
  },

  loadUser: async () => {
    try {
      const [user, role] = await Promise.all([authApi.me(), tokenManager.getRole()])
      set({ user, role: role ?? user.role.name })
      wsManager.connect()
    } catch {}
  },

  clearError: () => set({ error: null }),
}))
