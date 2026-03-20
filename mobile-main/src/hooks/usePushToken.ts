import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { PUSH_SERVICE_URL } from '../utils/config';

async function registerDeviceToken(userId: number, token: string) {
  try {
    await fetch(`${PUSH_SERVICE_URL}/push/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        token,
        platform: Platform.OS,
      }),
    });
  } catch {
    // Non-fatal — push won't work but app continues
  }
}

async function unregisterDeviceToken(token: string) {
  try {
    await fetch(`${PUSH_SERVICE_URL}/push/unregister`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  } catch {}
}

async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null; // Expo push doesn't work in simulator

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  // Android requires a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6366F1',
    });
  }

  const tokenData = await Notifications.getExpoPushTokenAsync();
  console.log('[PushToken]', tokenData.data); // copy this from Metro logs
  return tokenData.data;
}

export function usePushToken() {
  const user  = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);

  // Keep a ref to the push token so we can unregister it on logout
  const pushTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token || !user) {
      // Logged out — unregister if we have a push token
      if (pushTokenRef.current) {
        unregisterDeviceToken(pushTokenRef.current);
        pushTokenRef.current = null;
      }
      return;
    }

    getExpoPushToken().then((pushToken) => {
      if (!pushToken) return;
      pushTokenRef.current = pushToken;
      registerDeviceToken(user.id, pushToken);
    });
  }, [token, user?.id]);
}
