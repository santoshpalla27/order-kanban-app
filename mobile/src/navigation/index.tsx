import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { NavigationContainer, useNavigationState, createNavigationContainerRef } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import * as Notifications from 'expo-notifications'

import LoginScreen            from '../screens/LoginScreen'
import ListScreen             from '../screens/ListScreen'
import MyOrdersScreen         from '../screens/MyOrdersScreen'
import ChatScreen             from '../screens/ChatScreen'
import ProfileScreen          from '../screens/ProfileScreen'
import NotificationsScreen    from '../screens/NotificationsScreen'
import ProductDetailScreen    from '../screens/ProductDetailScreen'
import CreateEditProductScreen from '../screens/CreateEditProductScreen'

import { tokenManager }  from '../utils/tokenManager'
import { useChatStore }  from '../store/chatStore'
import { useWsEvents }   from '../hooks/useWsEvents'
import { useNotifStore } from '../store/notificationStore'
import { useAuthStore }  from '../store/authStore'
import { usePushToken }  from '../hooks/usePushToken'
import type { RootStackParams, MainTabParams } from '../types'

export const navigationRef = createNavigationContainerRef<RootStackParams>()

const Stack = createNativeStackNavigator<RootStackParams>()
const Tab   = createBottomTabNavigator<MainTabParams>()

function MainTabs() {
  const unreadChat  = useChatStore(s => s.unreadCount)
  const insets      = useSafeAreaInsets()

  // Track whether the Chat tab is currently focused
  const activeName = useNavigationState(state => state?.routes[state.index]?.name)
  const activeNameRef = useRef(activeName)
  activeNameRef.current = activeName

  const isChatActive = useCallback(() => activeNameRef.current === 'Chat', [])

  // Wire up WebSocket event dispatching
  useWsEvents(isChatActive)

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor:   '#1A73E8',
        tabBarInactiveTintColor: '#9E9E9E',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#F0F0F0',
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 6,
          height: 60 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, size, focused }) => {
          const icons: Record<string, [string, string]> = {
            List:     ['list',        'list-outline'],
            MyOrders: ['person',      'person-outline'],
            Chat:     ['chatbubbles', 'chatbubbles-outline'],
            Profile:  ['settings',    'settings-outline'],
          }
          const [filled, outline] = icons[route.name] ?? ['ellipse', 'ellipse-outline']
          return <Ionicons name={(focused ? filled : outline) as any} size={size} color={color} />
        },
        tabBarBadge: route.name === 'Chat' && unreadChat > 0
          ? (unreadChat > 99 ? '99+' : unreadChat)
          : undefined,
      })}
    >
      <Tab.Screen name="List"     component={ListScreen} />
      <Tab.Screen name="MyOrders" component={MyOrdersScreen} options={{ tabBarLabel: 'My Orders' }} />
      <Tab.Screen name="Chat"     component={ChatScreen} />
      <Tab.Screen name="Profile"  component={ProfileScreen} />
    </Tab.Navigator>
  )
}

export default function AppNavigation() {
  const user     = useAuthStore(s => s.user)
  const [ready, setReady] = useState(false)
  const loggedIn = !!user

  useEffect(() => {
    tokenManager.isLoggedIn().then(async ok => {
      if (ok) {
        await useAuthStore.getState().loadUser()
        useNotifStore.getState().fetchUnread()
      }
      setReady(true)
    })
  }, [])

  // Register push token when user logs in
  usePushToken(loggedIn)

  // Handle taps on push notifications (background / killed state)
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as any
      if (!navigationRef.isReady()) return
      if (data?.entity_type === 'product' && data?.entity_id) {
        navigationRef.navigate('ProductDetail', { id: Number(data.entity_id) })
      } else if (data?.entity_type === 'chat') {
        navigationRef.navigate('Main', { screen: 'Chat' })
      }
    })
    return () => sub.remove()
  }, [])

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1A73E8' }}>
        <Ionicons name="list" size={60} color="rgba(255,255,255,0.9)" />
        <ActivityIndicator color="#FFFFFF" style={{ marginTop: 24 }} />
      </View>
    )
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        initialRouteName={loggedIn ? 'Main' : 'Login'}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Login"  component={LoginScreen} />
        <Stack.Screen name="Main"   component={MainTabs} />
        <Stack.Screen
          name="Notifications"
          component={NotificationsScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="ProductDetail"
          component={ProductDetailScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="CreateEditProduct"
          component={CreateEditProductScreen}
          options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  )
}
