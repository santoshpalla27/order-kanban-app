// ─── API Configuration ────────────────────────────────────────────────────────
// Set EXPO_PUBLIC_API_BASE_URL in mobile/.env
// For USB Android testing:  http://localhost:8080/api  (after: adb reverse tcp:8080 tcp:8080)
// For WiFi / iOS testing:   http://<your-mac-lan-ip>:8080/api
// For production:           https://app.santoshdevops.cloud/api

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8080/api';

// Push service URL — set EXPO_PUBLIC_PUSH_SERVICE_URL in mobile/.env
// For local dev:  http://localhost:4001
// For production: https://app.santoshdevops.cloud/push-api
export const PUSH_SERVICE_URL =
  process.env.EXPO_PUBLIC_PUSH_SERVICE_URL ?? 'http://localhost:4001';

// WebSocket URL — derived from API_BASE_URL
export const getWsUrl = (token: string): string => {
  const base = API_BASE_URL.replace(/^http/, 'ws').replace(/\/api$/, '');
  return `${base}/api/ws?token=${token}`;
};
