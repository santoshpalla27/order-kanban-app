export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://app.santoshdevops.cloud/api';

export const PUSH_SERVICE_URL =
  process.env.EXPO_PUBLIC_PUSH_SERVICE_URL ?? 'https://app.santoshdevops.cloud/push-api';

// Portal base URL — the web frontend that serves the customer portal pages.
// In production this matches the API origin (same domain, different path).
// In local dev, the frontend runs on a different port than the API, so set
// EXPO_PUBLIC_PORTAL_BASE_URL=http://localhost:3000 in your .env.local.
export const PORTAL_BASE_URL =
  process.env.EXPO_PUBLIC_PORTAL_BASE_URL ?? API_BASE_URL.replace(/\/api$/, '');

// WebSocket URL — derived from API_BASE_URL
export const getWsUrl = (token: string): string => {
  const base = API_BASE_URL.replace(/^http/, 'ws').replace(/\/api$/, '');
  return `${base}/api/ws?token=${token}`;
};
