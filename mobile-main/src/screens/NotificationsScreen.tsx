import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { notificationsApi } from '../api/services';
import { useNotificationStore } from '../store/notificationStore';
import { useBadgeStore } from '../store/badgeStore';
import { useAuthStore } from '../store/authStore';
import { useWsEvents } from '../hooks/useWsEvents';
import { Notification } from '../types';
import { RootStackParamList } from '../navigation';
import { useThemeStore } from '../store/themeStore';
import { darkColors, lightColors, ThemeColors } from '../theme';

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

const TYPE_META: Record<string, { label: string; bg: string; text: string; border: string }> = {
  comment_added:       { label: 'Comment',    bg: 'rgba(34,211,238,0.1)',  text: '#22D3EE', border: 'rgba(34,211,238,0.2)'  },
  mention:             { label: 'Mention',    bg: 'rgba(167,139,250,0.1)', text: '#A78BFA', border: 'rgba(167,139,250,0.2)' },
  attachment_uploaded: { label: 'Attachment', bg: 'rgba(251,146,60,0.1)',  text: '#FB923C', border: 'rgba(251,146,60,0.2)'  },
  status_change:       { label: 'Status',     bg: 'rgba(251,191,36,0.1)',  text: '#FBBF24', border: 'rgba(251,191,36,0.2)'  },
  chat_message:        { label: 'Chat',       bg: 'rgba(52,211,153,0.1)',  text: '#34D399', border: 'rgba(52,211,153,0.2)'  },
};

function getTypeMeta(type: string) {
  return TYPE_META[type] ?? { label: type.replace(/_/g, ' '), bg: 'rgba(99,102,241,0.1)', text: '#818CF8', border: 'rgba(99,102,241,0.2)' };
}

function humanizeType(type: string): string {
  return getTypeMeta(type).label;
}

const AVATAR_GRADIENTS = [
  ['#EC4899', '#F43F5E'], ['#FB923C', '#F59E0B'],
  ['#10B981', '#14B8A6'], ['#06B6D4', '#3B82F6'],
  ['#8B5CF6', '#A855F7'], ['#D946EF', '#EC4899'],
];

function getAvatarColors(name: string): [string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length] as [string, string];
}

export default function NotificationsScreen() {
  const isDark = useThemeStore((s) => s.isDark);
  const c = isDark ? darkColors : lightColors;
  const s = useMemo(() => makeStyles(c), [c]);

  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { setUnreadCount } = useNotificationStore();
  const userId = useAuthStore((s) => s.user?.id);
  const { refreshAll, refreshMyOrders } = useBadgeStore();

  const refreshBadges = useCallback(() => {
    refreshAll();
    if (userId) refreshMyOrders(userId);
  }, [refreshAll, refreshMyOrders, userId]);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter]     = useState('all');
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);

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

  const markRead = async (n: Notification) => {
    try {
      if (n.entity_type === 'product' && n.entity_id) {
        await notificationsApi.markReadByEntityAndTypes('product', n.entity_id, [n.type]);
        setNotifications((prev) => prev.map((nn) =>
          nn.entity_type === 'product' && nn.entity_id === n.entity_id && nn.type === n.type
            ? { ...nn, is_read: true } : nn
        ));
      } else {
        await notificationsApi.markAsRead(n.id);
        setNotifications((prev) => prev.map((nn) => nn.id === n.id ? { ...nn, is_read: true } : nn));
      }
      const countRes = await notificationsApi.getUnreadCount();
      setUnreadCount(countRes.data?.count ?? 0);
      refreshBadges();
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await notificationsApi.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      refreshBadges();
    } catch {}
  };

  const handlePress = (n: Notification) => {
    if (!n.is_read) markRead(n);
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
          placeholderTextColor={c.textMuted}
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

      {/* ── Type filter dropdown ── */}
      <View style={s.dropdownRow}>
        <TouchableOpacity
          style={s.dropdownBtn}
          onPress={() => setTypeDropdownOpen(true)}
          activeOpacity={0.8}
        >
          <Text style={s.dropdownLabel}>
            {typeFilter === 'all' ? 'All types' : humanizeType(typeFilter)}
          </Text>
          <Text style={s.dropdownChevron}>▾</Text>
        </TouchableOpacity>

        <Modal
          transparent
          visible={typeDropdownOpen}
          animationType="fade"
          onRequestClose={() => setTypeDropdownOpen(false)}
        >
          <TouchableOpacity
            style={s.modalOverlay}
            activeOpacity={1}
            onPress={() => setTypeDropdownOpen(false)}
          >
            <View style={s.dropdownMenu}>
              {(['all', ...uniqueTypes] as string[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[s.dropdownOption, typeFilter === t && s.dropdownOptionActive]}
                  onPress={() => { setTypeFilter(t); setTypeDropdownOpen(false); }}
                >
                  <Text style={[s.dropdownOptionText, typeFilter === t && s.dropdownOptionTextActive]}>
                    {t === 'all' ? 'All types' : humanizeType(t)}
                  </Text>
                  {typeFilter === t && <Text style={s.dropdownCheck}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      </View>

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
          <ActivityIndicator color={c.brand} />
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
          renderItem={({ item: n }) => {
            const meta = getTypeMeta(n.type);
            const senderName = n.sender_name || '';
            const initial = senderName ? senderName.charAt(0).toUpperCase() : '?';
            const [avatarFrom] = getAvatarColors(senderName || n.type);
            return (
              <TouchableOpacity
                style={[s.item, !n.is_read && s.itemUnread]}
                onPress={() => handlePress(n)}
                activeOpacity={0.75}
              >
                {/* Avatar */}
                <View style={[s.avatar, { backgroundColor: avatarFrom }]}>
                  <Text style={s.avatarText}>{initial}</Text>
                </View>

                {/* Content */}
                <View style={s.content}>
                  <View style={s.topRow}>
                    {!!senderName && (
                      <Text style={s.senderName}>{senderName}</Text>
                    )}
                    {!!n.type && (
                      <View style={[s.typeBadge, { backgroundColor: meta.bg, borderColor: meta.border }]}>
                        <Text style={[s.typeBadgeText, { color: meta.text }]}>{meta.label}</Text>
                      </View>
                    )}
                    {!n.is_read && <View style={s.unreadDot} />}
                  </View>
                  <Text style={[s.message, n.is_read && s.messageRead]}>
                    {n.message}
                  </Text>
                </View>

                {/* Right: time + eye */}
                <View style={s.rightCol}>
                  <Text style={s.time}>{formatRelative(n.created_at)}</Text>
                  <Text style={s.timeFull}>{formatFull(n.created_at)}</Text>
                  {!n.is_read && (
                    <TouchableOpacity
                      style={s.eyeBtn}
                      onPress={(e) => { e.stopPropagation?.(); markRead(n); }}
                      hitSlop={8}
                    >
                      <Text style={s.eyeIcon}>👁</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },

    // Header
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: c.surface2,
    },
    backBtn:  { padding: 4 },
    backIcon: { fontSize: 22, color: c.textSec },
    title:    { flex: 1, fontSize: 16, fontWeight: '700', color: c.text },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    iconBtn:     { padding: 6 },
    iconBtnText: { fontSize: 20, color: c.textSec, fontWeight: '600' },
    markAllBtn: {
      paddingHorizontal: 10, paddingVertical: 6,
      borderRadius: 8, backgroundColor: c.brand,
    },
    markAllText: { fontSize: 11, color: '#fff', fontWeight: '600' },

    // Search
    searchRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 16, paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: c.surface2,
    },
    searchInput: {
      flex: 1,
      height: 38,
      backgroundColor: c.inputBg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.surface2,
      paddingHorizontal: 12,
      fontSize: 14,
      color: c.text,
    },
    clearBtn:  { paddingHorizontal: 8, paddingVertical: 6 },
    clearText: { fontSize: 13, color: '#EF4444' },

    // Status filter tabs
    tabRow: {
      flexDirection: 'row',
      paddingHorizontal: 16, paddingVertical: 10, gap: 8,
      borderBottomWidth: 1, borderBottomColor: c.surface2,
    },
    tab: {
      flex: 1, alignItems: 'center',
      paddingVertical: 7,
      borderRadius: 8,
      backgroundColor: c.inputBg,
      borderWidth: 1, borderColor: c.surface2,
    },
    tabActive: { backgroundColor: c.brand, borderColor: c.brand },
    tabText:   { fontSize: 13, color: c.textMuted, fontWeight: '600' },
    tabTextActive: { color: '#fff' },

    // Type dropdown
    dropdownRow: {
      paddingHorizontal: 16, paddingVertical: 8,
      borderBottomWidth: 1, borderBottomColor: c.surface2,
    },
    dropdownBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      height: 38,
      backgroundColor: c.inputBg,
      borderRadius: 10,
      borderWidth: 1, borderColor: c.surface2,
      paddingHorizontal: 12,
    },
    dropdownLabel:   { fontSize: 14, color: c.text, flex: 1 },
    dropdownChevron: { fontSize: 14, color: c.textMuted, marginLeft: 6 },

    // Dropdown modal
    modalOverlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center', paddingHorizontal: 32,
    },
    dropdownMenu: {
      backgroundColor: c.inputBg,
      borderRadius: 12,
      borderWidth: 1, borderColor: c.surface2,
      overflow: 'hidden',
    },
    dropdownOption: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 13,
      borderBottomWidth: 1, borderBottomColor: c.surface2,
    },
    dropdownOptionActive:     { backgroundColor: 'rgba(99,102,241,0.12)' },
    dropdownOptionText:       { fontSize: 14, color: c.textSec },
    dropdownOptionTextActive: { color: c.brand, fontWeight: '600' },
    dropdownCheck:            { fontSize: 14, color: c.brand, fontWeight: '700' },

    // Count row
    countRow: { paddingHorizontal: 16, paddingVertical: 6 },
    countText: { fontSize: 11, color: c.textMuted },

    // Center / empty
    center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 8 },
    emptyText: { fontSize: 14, color: c.textMuted },
    emptyClrBtn: {
      marginTop: 4, paddingHorizontal: 14, paddingVertical: 7,
      borderRadius: 8, borderWidth: 1, borderColor: '#EF4444',
    },
    emptyClrText: { fontSize: 13, color: '#EF4444' },

    // Notification items
    item: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
      paddingHorizontal: 16, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.surface2,
    },
    itemUnread:  { backgroundColor: 'rgba(99,102,241,0.05)' },

    // Avatar
    avatar: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, marginTop: 2,
    },
    avatarText: { fontSize: 14, fontWeight: '700', color: '#fff' },

    content:     { flex: 1 },
    topRow:      { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginBottom: 3 },
    senderName:  { fontSize: 13, fontWeight: '700', color: c.text },
    unreadDot:   { width: 7, height: 7, borderRadius: 99, backgroundColor: c.brand },
    message:     { fontSize: 13, color: c.text, lineHeight: 19 },
    messageRead: { color: c.textMuted },

    typeBadge: {
      paddingHorizontal: 7, paddingVertical: 2,
      borderRadius: 6, borderWidth: 1,
    },
    typeBadgeText: { fontSize: 10, fontWeight: '600' },

    // Right column
    rightCol:  { alignItems: 'flex-end', gap: 2, flexShrink: 0 },
    time:      { fontSize: 11, color: c.textMuted, textAlign: 'right' },
    timeFull:  { fontSize: 10, color: c.textDim, textAlign: 'right' },

    eyeBtn:  { padding: 4, marginTop: 2 },
    eyeIcon: { fontSize: 15 },
  });
}
