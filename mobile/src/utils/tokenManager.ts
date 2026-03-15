import AsyncStorage from '@react-native-async-storage/async-storage'

const KEYS = {
  ACCESS:  'access_token',
  REFRESH: 'refresh_token',
  ROLE:    'user_role',
  NAME:    'user_name',
  ID:      'user_id',
} as const

export const tokenManager = {
  async saveTokens(access: string, refresh: string) {
    await AsyncStorage.multiSet([[KEYS.ACCESS, access], [KEYS.REFRESH, refresh]])
  },
  async saveUserInfo(id: number, name: string, role: string) {
    await AsyncStorage.multiSet([
      [KEYS.ID,   String(id)],
      [KEYS.NAME, name],
      [KEYS.ROLE, role],
    ])
  },
  async getAccessToken():  Promise<string | null> { return AsyncStorage.getItem(KEYS.ACCESS) },
  async getRefreshToken(): Promise<string | null> { return AsyncStorage.getItem(KEYS.REFRESH) },
  async getRole():  Promise<string | null> { return AsyncStorage.getItem(KEYS.ROLE) },
  async getName():  Promise<string | null> { return AsyncStorage.getItem(KEYS.NAME) },
  async getId():    Promise<number | null> {
    const v = await AsyncStorage.getItem(KEYS.ID)
    return v ? Number(v) : null
  },
  async isLoggedIn(): Promise<boolean> { return !!(await AsyncStorage.getItem(KEYS.ACCESS)) },
  async clear() { await AsyncStorage.multiRemove(Object.values(KEYS)) },
}
