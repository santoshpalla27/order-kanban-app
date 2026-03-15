import React, { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'

import LoginScreen         from '../screens/LoginScreen'
import BoardScreen         from '../screens/BoardScreen'
import ListScreen          from '../screens/ListScreen'
import ChatScreen          from '../screens/ChatScreen'
import ProfileScreen       from '../screens/ProfileScreen'
import NotificationsScreen from '../screens/NotificationsScreen'
import ProductDetailScreen    from '../screens/ProductDetailScreen'
import CreateEditProductScreen from '../screens/CreateEditProductScreen'

import { tokenManager }  from '../utils/tokenManager'
import { useNotifStore } from '../store/notificationStore'
import { useChatStore }  from '../store/chatStore'
import type { RootStackParams, MainTabParams } from '../types'

const Stack = createNativeStackNavigator<RootStackParams>()
const Tab   = createBottomTabNavigator<MainTabParams>()

function MainTabs() {
  const unreadNotif = useNotifStore(s => s.unreadCount)
  const unreadChat  = useChatStore(s => s.unreadCount)

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
          height: 60,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, size, focused }) => {
          const icons: Record<string, [string, string]> = {
            Board:   ['grid',         'grid-outline'],
            List:    ['list',         'list-outline'],
            Chat:    ['chatbubbles',  'chatbubbles-outline'],
            Profile: ['person',       'person-outline'],
          }
          const [filled, outline] = icons[route.name] ?? ['ellipse','ellipse-outline']
          return (
            <Ionicons
              name={(focused ? filled : outline) as any}
              size={size}
              color={color}
            />
          )
        },
        tabBarBadge: route.name === 'Chat' && unreadChat > 0
          ? unreadChat > 99 ? '99+' : unreadChat
          : undefined,
      })}
    >
      <Tab.Screen name="Board"   component={BoardScreen} />
      <Tab.Screen name="List"    component={ListScreen} />
      <Tab.Screen name="Chat"    component={ChatScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  )
}

export default function AppNavigation() {
  const [ready,     setReady]     = useState(false)
  const [loggedIn,  setLoggedIn]  = useState(false)

  useEffect(() => {
    tokenManager.isLoggedIn().then(ok => {
      setLoggedIn(ok)
      setReady(true)
    })
  }, [])

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1A73E8' }}>
        <Ionicons name="grid" size={60} color="rgba(255,255,255,0.9)" />
        <ActivityIndicator color="#FFFFFF" style={{ marginTop: 24 }} />
      </View>
    )
  }

  return (
    <NavigationContainer>
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
