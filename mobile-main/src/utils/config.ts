export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://app.santoshdevops.cloud/api';

export const PUSH_SERVICE_URL =
  process.env.EXPO_PUBLIC_PUSH_SERVICE_URL ?? 'https://app.santoshdevops.cloud/push-api';

// WebSocket URL — derived from API_BASE_URL
export const getWsUrl = (token: string): string => {
  const base = API_BASE_URL.replace(/^http/, 'ws').replace(/\/api$/, '');
  return `${base}/api/ws?token=${token}`;
};
