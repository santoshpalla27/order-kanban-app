import { useEffect } from 'react'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import { userApi } from '../api/services'

// Configure how notifications are presented when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
})

export async function registerPushToken() {
  if (!Device.isDevice) return  // simulators don't support push tokens

  const { status: existing } = await Notifications.getPermissionsAsync()
  const { status } = existing === 'granted'
    ? { status: existing }
    : await Notifications.requestPermissionsAsync()

  if (status !== 'granted') return

  // Android needs a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name:       'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1A56D6',
    })
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync()
    await userApi.savePushToken(token.data)
  } catch (e) {
    // Non-fatal: push notifications won't work but app continues
    console.warn('[PushToken] Failed to register:', e)
  }
}

export function usePushToken(loggedIn: boolean) {
  useEffect(() => {
    if (loggedIn) registerPushToken()
  }, [loggedIn])
}
