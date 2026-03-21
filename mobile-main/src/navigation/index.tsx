import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuthStore } from '../store/authStore';
import { useWsEvents } from '../hooks/useWsEvents';
import { useNotificationStore } from '../store/notificationStore';
import { usePushToken } from '../hooks/usePushToken';

import LoginScreen          from '../screens/LoginScreen';
import ListScreen           from '../screens/ListScreen';
import MyOrdersScreen       from '../screens/MyOrdersScreen';
import ProductDetailScreen  from '../screens/ProductDetailScreen';
import CreateProductScreen  from '../screens/CreateProductScreen';
import NotificationsScreen  from '../screens/NotificationsScreen';
import ActivityScreen       from '../screens/ActivityScreen';
import { useProductBadges, useMyOrdersBadges } from '../hooks/useProductBadges';

export type RootStackParamList = {
  Login:         undefined;
  MainTabs:      undefined;
  ProductDetail: { productId: number };
  CreateProduct: undefined;
  Notifications: undefined;
  Activity:      undefined;
};

export type TabParamList = {
  List:     undefined;
  MyOrders: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab   = createBottomTabNavigator<TabParamList>();

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

// ── Bottom tab navigator ───────────────────────────────────────────────────────
function MainTabs() {
  // Trigger WS subscriptions and initial fetches via hooks
  const { badges: allBadges } = useProductBadges();
  const { count: myOrdersBadgeCount, productIds: myOrdersProductIds } = useMyOrdersBadges();

  // Products tab: only products with badges NOT assigned to the current user
  const unreadProductCount = Object.keys(allBadges)
    .filter((id) => !myOrdersProductIds.has(Number(id))).length;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: '#0F1117' },
        headerTintColor: '#F1F5F9',
        headerTitleStyle: { fontWeight: '700' },
        headerRight: () => <HeaderIcons />,
        tabBarStyle: {
          backgroundColor: '#0F1117',
          borderTopColor: '#1E2535',
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: '#6366F1',
        tabBarInactiveTintColor: '#64748B',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="List"
        component={ListScreen}
        options={{
          title: 'Products',
          tabBarLabel: 'Products',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>📦</Text>,
          tabBarBadge: unreadProductCount > 0 ? unreadProductCount : undefined,
        }}
      />
      <Tab.Screen
        name="MyOrders"
        component={MyOrdersScreen}
        options={{
          title: 'My Orders',
          tabBarLabel: 'My Orders',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>📋</Text>,
          tabBarBadge: myOrdersBadgeCount > 0 ? myOrdersBadgeCount : undefined,
        }}
      />
    </Tab.Navigator>
  );
}

// ── App navigator ─────────────────────────────────────────────────────────────
function AppNavigator() {
  const token = useAuthStore((s) => s.token);
  const { refreshUnreadCount } = useNotificationStore();

  useWsEvents();
  usePushToken();

  // Fetch accurate unread count from API on login
  useEffect(() => {
    if (!token) return;
    refreshUnreadCount();
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
          <Stack.Screen name="MainTabs" component={MainTabs} />
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
