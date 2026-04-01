import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import {
  NavigationContainer,
  useNavigation,
  createNavigationContainerRef,
  DarkTheme,
  DefaultTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { darkColors, lightColors } from '../theme';
import { useWsEvents } from '../hooks/useWsEvents';
import { useNotificationStore } from '../store/notificationStore';
import { usePushToken } from '../hooks/usePushToken';
import { Feather } from '@expo/vector-icons';

import LoginScreen          from '../screens/LoginScreen';
import ListScreen           from '../screens/ListScreen';
import MyOrdersScreen       from '../screens/MyOrdersScreen';
import ProductDetailScreen  from '../screens/ProductDetailScreen';
import CreateProductScreen  from '../screens/CreateProductScreen';
import NotificationsScreen  from '../screens/NotificationsScreen';
import ActivityScreen       from '../screens/ActivityScreen';
import TeamChatScreen       from '../screens/TeamChatScreen';
import ProfileScreen        from '../screens/ProfileScreen';
import { useProductBadges, useMyOrdersBadges } from '../hooks/useProductBadges';
import SharePickerModal from '../components/SharePickerModal';
import { useShareStore } from '../store/shareStore';

export type RootStackParamList = {
  Login:         undefined;
  MainTabs:      undefined;
  ProductDetail: { productId: number };
  CreateProduct: undefined;
  Notifications: undefined;
  Activity:      undefined;
  TeamChat:      undefined;
};

export type TabParamList = {
  List:     undefined;
  MyOrders: undefined;
  Profile:  undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab   = createBottomTabNavigator<TabParamList>();

// Navigation ref — allows navigating from outside React tree (e.g. push tap handler)
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// ── Header right: bell + activity icons ──────────────────────────────────────
function HeaderIcons() {
  const navigation  = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const isDark = useThemeStore((s) => s.isDark);
  const c = isDark ? darkColors : lightColors;

  return (
    <View style={h.row}>
      <TouchableOpacity style={h.btn} onPress={() => navigation.navigate('TeamChat')}>
        <Feather name="message-square" size={20} color={c.text} />
      </TouchableOpacity>
      <TouchableOpacity style={h.btn} onPress={() => navigation.navigate('Activity')}>
        <Feather name="zap" size={20} color={c.text} />
      </TouchableOpacity>
      <TouchableOpacity style={h.btn} onPress={() => navigation.navigate('Notifications')}>
        <Feather name="bell" size={20} color={c.text} />
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
  const { badges: allBadges } = useProductBadges();
  const { count: myOrdersBadgeCount, productIds: myOrdersProductIds } = useMyOrdersBadges();
  const isDark = useThemeStore((s) => s.isDark);
  const c      = isDark ? darkColors : lightColors;

  const unreadProductCount = Object.keys(allBadges)
    .filter((id) => !myOrdersProductIds.has(Number(id))).length;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: c.headerBg },
        headerTintColor: c.text,
        headerTitleStyle: { fontWeight: '700', color: c.text },
        headerRight: () => <HeaderIcons />,
        tabBarStyle: {
          backgroundColor: c.tabBarBg,
          borderTopColor: c.border,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: c.brand,
        tabBarInactiveTintColor: c.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="List"
        component={ListScreen}
        options={{
          title: 'Products',
          tabBarLabel: 'Products',
          tabBarIcon: ({ color }) => <Feather name="package" size={20} color={color} />,
          tabBarBadge: unreadProductCount > 0 ? unreadProductCount : undefined,
        }}
      />
      <Tab.Screen
        name="MyOrders"
        component={MyOrdersScreen}
        options={{
          title: 'My Orders',
          tabBarLabel: 'My Orders',
          tabBarIcon: ({ color }) => <Feather name="clipboard" size={20} color={color} />,
          tabBarBadge: myOrdersBadgeCount > 0 ? myOrdersBadgeCount : undefined,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color }) => <Feather name="user" size={20} color={color} />,
          headerShown: true,
        }}
      />
    </Tab.Navigator>
  );
}

// ── Push notification tap handler (native only) ───────────────────────────────
function PushTapHandler({ token }: { token: string }) {
  const lastNotifResponse = Notifications.useLastNotificationResponse();
  const handledResponseId = useRef<string | null>(null);

  useEffect(() => {
    if (!lastNotifResponse) return;
    const responseId = lastNotifResponse.notification.request.identifier;
    if (handledResponseId.current === responseId) return;
    handledResponseId.current = responseId;
    const data = lastNotifResponse.notification.request.content.data as Record<string, any>;
    if (!navigationRef.isReady()) return;
    if (data?.entityType === 'product' && data?.entityId) {
      navigationRef.navigate('ProductDetail', { productId: Number(data.entityId) });
    } else if (data?.entityType === 'chat') {
      navigationRef.navigate('TeamChat');
    }
  }, [lastNotifResponse]);

  return null;
}

// ── App navigator ─────────────────────────────────────────────────────────────
function AppNavigator() {
  const token   = useAuthStore((s) => s.token);
  const isDark  = useThemeStore((s) => s.isDark);
  const c       = isDark ? darkColors : lightColors;
  const { refreshUnreadCount } = useNotificationStore();
  const pendingFiles    = useShareStore((s) => s.pendingFiles);
  const clearPendingFiles = useShareStore((s) => s.clearPendingFiles);

  useWsEvents();
  usePushToken();

  useEffect(() => {
    if (!token) return;
    refreshUnreadCount();
  }, [token]);

  return (
    <>
      {Platform.OS !== 'web' && token ? <PushTapHandler token={token} /> : null}
      <SharePickerModal
        visible={!!token && pendingFiles.length > 0}
        files={pendingFiles}
        onDone={clearPendingFiles}
      />
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.bg },
          animation: 'slide_from_right',
        }}
      >
        {!token ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="MainTabs"      component={MainTabs} />
            <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
            <Stack.Screen name="CreateProduct" component={CreateProductScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="Activity"      component={ActivityScreen} />
            <Stack.Screen name="TeamChat"      component={TeamChatScreen} />
          </>
        )}
      </Stack.Navigator>
    </>
  );
}

export default function Navigation() {
  const isDark = useThemeStore((s) => s.isDark);

  // Use React Navigation's built-in theme so modals/overlays also respect theme
  const navTheme = isDark
    ? { ...DarkTheme,    colors: { ...DarkTheme.colors,    background: darkColors.bg,  card: darkColors.headerBg,  text: darkColors.text,  border: darkColors.border } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: lightColors.bg, card: lightColors.headerBg, text: lightColors.text, border: lightColors.border } };

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <AppNavigator />
    </NavigationContainer>
  );
}
