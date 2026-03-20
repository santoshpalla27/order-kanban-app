import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { notificationsApi } from '../api/services';
import { useNotificationStore } from '../store/notificationStore';
import { useWsEvents } from '../hooks/useWsEvents';
import { Notification } from '../types';
import { RootStackParamList } from '../navigation';

function formatTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function NotificationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { setUnreadCount } = useNotificationStore();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await notificationsApi.getAll();
      setNotifications(res.data?.data || []);
      const countRes = await notificationsApi.getUnreadCount();
      setUnreadCount(countRes.data?.count ?? 0);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useWsEvents({ onNotification: load });

  const markRead = async (id: number) => {
    try {
      await notificationsApi.markAsRead(id);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
      const countRes = await notificationsApi.getUnreadCount();
      setUnreadCount(countRes.data?.count ?? 0);
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await notificationsApi.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {}
  };

  const handlePress = (n: Notification) => {
    if (!n.is_read) markRead(n.id);
    if (n.entity_type === 'product' && n.entity_id) {
      navigation.navigate('ProductDetail', { productId: n.entity_id });
    }
  };

  const unread = notifications.filter((n) => !n.is_read).length;

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={s.title}>
          🔔  Notifications{unread > 0 ? ` (${unread})` : ''}
        </Text>
        {unread > 0 && (
          <TouchableOpacity onPress={markAllRead} style={s.markAllBtn}>
            <Text style={s.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color="#6366F1" />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(n) => String(n.id)}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Text style={{ fontSize: 40 }}>🔔</Text>
              <Text style={s.emptyText}>No notifications yet</Text>
            </View>
          }
          renderItem={({ item: n }) => (
            <TouchableOpacity
              style={[s.item, !n.is_read && s.itemUnread]}
              onPress={() => handlePress(n)}
              activeOpacity={0.75}
            >
              {/* Unread dot */}
              <View style={s.dotWrap}>
                {!n.is_read && <View style={s.dot} />}
              </View>

              {/* Content */}
              <View style={s.content}>
                <Text style={s.message}>{n.message}</Text>
                {n.entity_type === 'product' && !!n.entity_id && (
                  <Text style={s.link}>Go to product →</Text>
                )}
                {n.entity_type === 'chat' && (
                  <Text style={s.link}>Go to Team Chat →</Text>
                )}
                <Text style={s.time}>{formatTime(n.created_at)}</Text>
              </View>

              {/* Mark-as-read eye */}
              {!n.is_read && (
                <TouchableOpacity
                  style={s.eyeBtn}
                  onPress={() => markRead(n.id)}
                  hitSlop={8}
                >
                  <Text style={s.eyeIcon}>👁</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0D14' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1E2535',
  },
  backBtn: { padding: 4 },
  backIcon: { fontSize: 22, color: '#94A3B8' },
  title: { flex: 1, fontSize: 17, fontWeight: '700', color: '#F1F5F9' },
  markAllBtn: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: '#2D3748',
  },
  markAllText: { fontSize: 12, color: '#94A3B8' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyText: { fontSize: 14, color: '#64748B' },

  item: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1E2535',
  },
  itemUnread: { backgroundColor: 'rgba(99,102,241,0.05)' },
  dotWrap: { width: 10, marginTop: 5, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 99, backgroundColor: '#6366F1' },
  content: { flex: 1 },
  message: { fontSize: 14, color: '#E2E8F0', lineHeight: 20 },
  link: { fontSize: 11, color: '#818CF8', marginTop: 3 },
  time: { fontSize: 11, color: '#64748B', marginTop: 3 },
  eyeBtn: { padding: 4, marginTop: 2 },
  eyeIcon: { fontSize: 14 },
});
