import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, SafeAreaView, TextInput, ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { notificationsApi } from '../api/services';
import { useNotificationStore } from '../store/notificationStore';
import { useWsEvents } from '../hooks/useWsEvents';
import { Notification } from '../types';
import { RootStackParamList } from '../navigation';

type StatusFilter = 'all' | 'unread' | 'read';

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatFull(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    + ' · '
    + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function humanizeType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function NotificationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { setUnreadCount } = useNotificationStore();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const res = await notificationsApi.getAll();
      setNotifications(res.data?.data || []);
      const countRes = await notificationsApi.getUnreadCount();
      setUnreadCount(countRes.data?.count ?? 0);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useWsEvents({ onNotification: () => load() });

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

  // Unique types for the type filter pills
  const uniqueTypes = useMemo(
    () => [...new Set(notifications.map((n) => n.type).filter(Boolean))],
    [notifications],
  );

  // Filtered list
  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      if (statusFilter === 'unread' && n.is_read) return false;
      if (statusFilter === 'read' && !n.is_read) return false;
      if (typeFilter !== 'all' && n.type !== typeFilter) return false;
      if (search && !n.message.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [notifications, statusFilter, typeFilter, search]);

  const unread = notifications.filter((n) => !n.is_read).length;
  const hasFilters = statusFilter !== 'all' || typeFilter !== 'all' || search !== '';

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setTypeFilter('all');
  };

  const STATUS_TABS: { key: StatusFilter; label: string }[] = [
    { key: 'all',    label: 'All' },
    { key: 'unread', label: 'Unread' },
    { key: 'read',   label: 'Read' },
  ];

  return (
    <SafeAreaView style={s.screen}>
      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>
          🔔  Notifications{unread > 0 ? ` (${unread})` : ''}
        </Text>
        <View style={s.headerActions}>
          {/* Refresh */}
          <TouchableOpacity
            onPress={() => load(true)}
            style={s.iconBtn}
            disabled={refreshing}
          >
            <Text style={[s.iconBtnText, refreshing && { opacity: 0.4 }]}>↻</Text>
          </TouchableOpacity>
          {/* Mark all read */}
          {unread > 0 && (
            <TouchableOpacity onPress={markAllRead} style={s.markAllBtn}>
              <Text style={s.markAllText}>✓✓ All read</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Search ── */}
      <View style={s.searchRow}>
        <TextInput
          style={s.searchInput}
          placeholder="Search notifications…"
          placeholderTextColor="#4B5563"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {hasFilters && (
          <TouchableOpacity onPress={clearFilters} style={s.clearBtn}>
            <Text style={s.clearText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Status filter tabs ── */}
      <View style={s.tabRow}>
        {STATUS_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[s.tab, statusFilter === tab.key && s.tabActive]}
            onPress={() => setStatusFilter(tab.key)}
          >
            <Text style={[s.tabText, statusFilter === tab.key && s.tabTextActive]}>
              {tab.label}
              {tab.key === 'unread' && unread > 0 ? ` (${unread})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Type filter pills ── */}
      {uniqueTypes.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.typeRow}
        >
          <TouchableOpacity
            style={[s.typePill, typeFilter === 'all' && s.typePillActive]}
            onPress={() => setTypeFilter('all')}
          >
            <Text style={[s.typePillText, typeFilter === 'all' && s.typePillTextActive]}>
              All types
            </Text>
          </TouchableOpacity>
          {uniqueTypes.map((t) => (
            <TouchableOpacity
              key={t}
              style={[s.typePill, typeFilter === t && s.typePillActive]}
              onPress={() => setTypeFilter(t)}
            >
              <Text style={[s.typePillText, typeFilter === t && s.typePillTextActive]}>
                {humanizeType(t)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* ── Results count ── */}
      <View style={s.countRow}>
        <Text style={s.countText}>
          {filtered.length} {filtered.length === 1 ? 'notification' : 'notifications'}
          {hasFilters ? ' matching filters' : ''}
        </Text>
      </View>

      {/* ── List ── */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color="#6366F1" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(n) => String(n.id)}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Text style={{ fontSize: 40 }}>🔔</Text>
              <Text style={s.emptyText}>
                {hasFilters ? 'No notifications match your filters' : 'No notifications yet'}
              </Text>
              {hasFilters && (
                <TouchableOpacity onPress={clearFilters} style={s.emptyClrBtn}>
                  <Text style={s.emptyClrText}>Clear filters</Text>
                </TouchableOpacity>
              )}
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
                <Text style={[s.message, n.is_read && s.messageRead]}>
                  {n.message}
                </Text>

                {/* Meta row: type pill + time */}
                <View style={s.metaRow}>
                  {!!n.type && (
                    <View style={s.typeBadge}>
                      <Text style={s.typeBadgeText}>{humanizeType(n.type)}</Text>
                    </View>
                  )}
                  <Text style={s.time}>{formatRelative(n.created_at)}</Text>
                  <Text style={s.timeFull}>{formatFull(n.created_at)}</Text>
                </View>

                {/* Navigation hint */}
                {n.entity_type === 'product' && !!n.entity_id && (
                  <Text style={s.link}>Go to product →</Text>
                )}
              </View>

              {/* Eye / mark-as-read button */}
              {!n.is_read && (
                <TouchableOpacity
                  style={s.eyeBtn}
                  onPress={(e) => { e.stopPropagation?.(); markRead(n.id); }}
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

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1E2535',
  },
  backBtn:  { padding: 4 },
  backIcon: { fontSize: 22, color: '#94A3B8' },
  title:    { flex: 1, fontSize: 16, fontWeight: '700', color: '#F1F5F9' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn:     { padding: 6 },
  iconBtnText: { fontSize: 20, color: '#94A3B8', fontWeight: '600' },
  markAllBtn: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, backgroundColor: '#6366F1',
  },
  markAllText: { fontSize: 11, color: '#fff', fontWeight: '600' },

  // Search
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#1E2535',
  },
  searchInput: {
    flex: 1,
    height: 38,
    backgroundColor: '#141824',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E2535',
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#E2E8F0',
  },
  clearBtn:  { paddingHorizontal: 8, paddingVertical: 6 },
  clearText: { fontSize: 13, color: '#EF4444' },

  // Status filter tabs
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16, paddingVertical: 10, gap: 8,
    borderBottomWidth: 1, borderBottomColor: '#1E2535',
  },
  tab: {
    flex: 1, alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#141824',
    borderWidth: 1, borderColor: '#1E2535',
  },
  tabActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  tabText:   { fontSize: 13, color: '#64748B', fontWeight: '600' },
  tabTextActive: { color: '#fff' },

  // Type pills
  typeRow: {
    paddingHorizontal: 16, paddingVertical: 10, gap: 8,
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: '#1E2535',
  },
  typePill: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 99,
    backgroundColor: '#141824',
    borderWidth: 1, borderColor: '#1E2535',
  },
  typePillActive: { backgroundColor: 'rgba(99,102,241,0.15)', borderColor: '#6366F1' },
  typePillText:   { fontSize: 12, color: '#64748B', fontWeight: '500' },
  typePillTextActive: { color: '#818CF8' },

  // Count row
  countRow: { paddingHorizontal: 16, paddingVertical: 6 },
  countText: { fontSize: 11, color: '#4B5563' },

  // Center / empty
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyText: { fontSize: 14, color: '#64748B' },
  emptyClrBtn: {
    marginTop: 4, paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 8, borderWidth: 1, borderColor: '#EF4444',
  },
  emptyClrText: { fontSize: 13, color: '#EF4444' },

  // Notification items
  item: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1E2535',
  },
  itemUnread:  { backgroundColor: 'rgba(99,102,241,0.05)' },
  dotWrap:     { width: 10, marginTop: 6, alignItems: 'center' },
  dot:         { width: 8, height: 8, borderRadius: 99, backgroundColor: '#6366F1' },
  content:     { flex: 1 },
  message:     { fontSize: 14, color: '#E2E8F0', lineHeight: 20 },
  messageRead: { color: '#64748B' },

  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 5 },
  typeBadge: {
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 6, backgroundColor: '#1E2535',
  },
  typeBadgeText: { fontSize: 10, color: '#94A3B8', fontWeight: '500' },
  time:          { fontSize: 11, color: '#64748B' },
  timeFull:      { fontSize: 10, color: '#374151' },

  link:    { fontSize: 11, color: '#818CF8', marginTop: 4 },
  eyeBtn:  { padding: 6, marginTop: 1 },
  eyeIcon: { fontSize: 16 },
});
