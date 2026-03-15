import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { tokenManager } from '../utils/tokenManager'

export const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://app.santoshdevops.cloud/api'
export const WS_URL   = process.env.EXPO_PUBLIC_WS_URL ?? 'wss://app.santoshdevops.cloud/api/ws'

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
})

// Attach token to every request
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await tokenManager.getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-refresh on 401
let isRefreshing = false
let queue: Array<(token: string) => void> = []

api.interceptors.response.use(
  res => res,
  async (err: AxiosError) => {
    const original = err.config as InternalAxiosRequestConfig & { _retry?: boolean }
    if (err.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise(resolve => {
          queue.push(token => {
            original.headers.Authorization = `Bearer ${token}`
            resolve(api(original))
          })
        })
      }
      original._retry = true
      isRefreshing = true
      try {
        const refresh = await tokenManager.getRefreshToken()
        if (!refresh) throw new Error('No refresh token')
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refresh_token: refresh })
        await tokenManager.saveTokens(data.access_token, data.refresh_token)
        queue.forEach(cb => cb(data.access_token))
        queue = []
        original.headers.Authorization = `Bearer ${data.access_token}`
        return api(original)
      } catch {
        await tokenManager.clear()
        return Promise.reject(err)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(err)
  }
)
