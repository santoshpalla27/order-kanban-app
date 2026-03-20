import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/authStore';
import { useWsEvents } from '../hooks/useWsEvents';
import { useNotificationStore } from '../store/notificationStore';
import { notificationsApi } from '../api/services';
import { usePushToken } from '../hooks/usePushToken';

import LoginScreen          from '../screens/LoginScreen';
import ListScreen           from '../screens/ListScreen';
import ProductDetailScreen  from '../screens/ProductDetailScreen';
import CreateProductScreen  from '../screens/CreateProductScreen';
import NotificationsScreen  from '../screens/NotificationsScreen';
import ActivityScreen       from '../screens/ActivityScreen';

export type RootStackParamList = {
  Login:         undefined;
  List:          undefined;
  ProductDetail: { productId: number };
  CreateProduct: undefined;
  Notifications: undefined;
  Activity:      undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// ── Header right: bell + activity icons ──────────────────────────────────────
function HeaderIcons() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  return (
    <View style={h.row}>
      {/* Activity */}
      <TouchableOpacity style={h.btn} onPress={() => navigation.navigate('Activity')}>
        <Text style={h.icon}>⚡</Text>
      </TouchableOpacity>

      {/* Notifications bell */}
      <TouchableOpacity style={h.btn} onPress={() => navigation.navigate('Notifications')}>
        <Text style={h.icon}>🔔</Text>
        {unreadCount > 0 && (
          <View style={h.badge}>
            <Text style={h.badgeText}>{unreadCount > 99 ? '99+' : String(unreadCount)}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const h = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 4 },
  btn:       { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  icon:      { fontSize: 18 },
  badge: {
    position: 'absolute', top: 2, right: 2,
    minWidth: 16, height: 16, borderRadius: 99,
    backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { fontSize: 9, color: '#fff', fontWeight: '700' },
});

// ── App navigator ─────────────────────────────────────────────────────────────
function AppNavigator() {
  const token = useAuthStore((s) => s.token);
  const { setUnreadCount } = useNotificationStore();

  // WS connection at top level
  useWsEvents();

  // Register device for push notifications (no-op on logout)
  usePushToken();

  // Load initial unread count when logged in
  useEffect(() => {
    if (!token) return;
    notificationsApi.getUnreadCount()
      .then((res) => setUnreadCount(res.data?.count ?? 0))
      .catch(() => {});
  }, [token]);

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0A0D14' },
        animation: 'slide_from_right',
      }}
    >
      {!token ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <>
          <Stack.Screen
            name="List"
            component={ListScreen}
            options={{
              headerShown: true,
              title: 'Products',
              headerStyle: { backgroundColor: '#0F1117' },
              headerTintColor: '#F1F5F9',
              headerTitleStyle: { fontWeight: '700' },
              headerRight: () => <HeaderIcons />,
            }}
          />
          <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
          <Stack.Screen name="CreateProduct"  component={CreateProductScreen} options={{ presentation: 'modal' }} />
          <Stack.Screen name="Notifications"  component={NotificationsScreen} />
          <Stack.Screen name="Activity"       component={ActivityScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function Navigation() {
  return (
    <NavigationContainer>
      <AppNavigator />
    </NavigationContainer>
  );
}
