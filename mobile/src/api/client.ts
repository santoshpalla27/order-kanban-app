import axios from 'axios';
import { API_BASE_URL } from '../utils/config';
import { tokenManager } from '../utils/tokenManager';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// Inject access token on every request
api.interceptors.request.use(async (config) => {
  const token = await tokenManager.getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Single in-flight refresh — avoids parallel /auth/refresh races
let refreshPromise: Promise<string> | null = null;

async function doTokenRefresh(): Promise<string> {
  const refreshToken = await tokenManager.getRefreshToken();
  if (!refreshToken) throw new Error('No refresh token');

  const res = await axios.post(`${API_BASE_URL}/auth/refresh`, { refresh_token: refreshToken });
  const { access_token, refresh_token: newRefresh } = res.data;
  await tokenManager.setTokens(access_token, newRefresh);
  return access_token;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (
      error.response?.status === 401 &&
      !original._retry &&
      !original.url?.includes('/auth/refresh')
    ) {
      original._retry = true;
      if (!refreshPromise) {
        refreshPromise = doTokenRefresh().finally(() => { refreshPromise = null; });
      }
      try {
        const newToken = await refreshPromise;
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        await tokenManager.clearTokens();
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  },
);

export default api;
