import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { activityApi } from '../api/services';
import { useWsEvents } from '../hooks/useWsEvents';
import { ActivityLog } from '../types';

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const ACTION_META: Record<string, { emoji: string; color: string; bg: string; label: string }> = {
  created:        { emoji: '➕', color: '#34D399', bg: 'rgba(52,211,153,0.12)',  label: 'Created'  },
  updated:        { emoji: '✏️', color: '#60A5FA', bg: 'rgba(96,165,250,0.12)',  label: 'Updated'  },
  deleted:        { emoji: '🗑',  color: '#EF4444', bg: 'rgba(239,68,68,0.12)',   label: 'Deleted'  },
  status_changed: { emoji: '🔄', color: '#FBBF24', bg: 'rgba(251,191,36,0.12)',  label: 'Moved'    },
  role_changed:   { emoji: '🛡',  color: '#A78BFA', bg: 'rgba(167,139,250,0.12)', label: 'Role'     },
};

const AVATAR_COLORS = ['#EC4899', '#F97316', '#10B981', '#06B6D4', '#8B5CF6', '#D946EF'];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

type ListItem = { type: 'header'; date: string } | { type: 'log'; log: ActivityLog };

export default function ActivityScreen() {
  const navigation = useNavigation();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await activityApi.getRecent(100);
      setLogs(res.data || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useWsEvents({ onActivityChanged: load });

  // Build grouped flat list
  const grouped: ListItem[] = [];
  let lastDate = '';
  for (const log of logs) {
    const d = new Date(log.created_at);
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const label =
      d.toDateString() === today.toDateString()     ? 'Today'
    : d.toDateString() === yesterday.toDateString() ? 'Yesterday'
    : d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
    if (label !== lastDate) { grouped.push({ type: 'header', date: label }); lastDate = label; }
    grouped.push({ type: 'log', log });
  }

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={s.title}>⚡  Activity</Text>
        {logs.length > 0 && (
          <View style={s.countBadge}>
            <Text style={s.countText}>{logs.length}</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color="#6366F1" />
        </View>
      ) : grouped.length === 0 ? (
        <View style={s.center}>
          <Text style={{ fontSize: 40 }}>⚡</Text>
          <Text style={s.emptyText}>No activity yet</Text>
        </View>
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={(item, i) =>
            item.type === 'header' ? `h-${item.date}` : `l-${(item as { type: 'log'; log: ActivityLog }).log.id}`
          }
          renderItem={({ item }) => {
            if (item.type === 'header') {
              return (
                <View style={s.dateHeader}>
                  <Text style={s.dateLabel}>{item.date}</Text>
                </View>
              );
            }

            const { log } = item as { type: 'log'; log: ActivityLog };
            const meta = ACTION_META[log.action] ?? {
              emoji: '⚡', color: '#94A3B8', bg: 'rgba(148,163,184,0.1)', label: log.action,
            };
            const name = log.user?.name || 'Unknown';

            return (
              <View style={s.row}>
                {/* Avatar */}
                <View style={[s.avatar, { backgroundColor: avatarColor(name) }]}>
                  <Text style={s.avatarText}>{name.charAt(0).toUpperCase()}</Text>
                </View>

                {/* Content */}
                <View style={s.content}>
                  <View style={s.topLine}>
                    <Text style={s.name}>{name}</Text>
                    <View style={[s.badge, { backgroundColor: meta.bg }]}>
                      <Text style={s.badgeEmoji}>{meta.emoji}</Text>
                      <Text style={[s.badgeLabel, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    <Text style={s.entity}>{log.entity}</Text>
                  </View>
                  <Text style={s.details} numberOfLines={2}>{log.details}</Text>
                </View>

                <Text style={s.time}>{formatRelative(log.created_at)}</Text>
              </View>
            );
          }}
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
  countBadge: {
    backgroundColor: '#1E2535', borderRadius: 99,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  countText: { fontSize: 12, color: '#64748B', fontWeight: '600' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { fontSize: 14, color: '#64748B' },

  dateHeader: {
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: '#0F1117',
    borderBottomWidth: 1, borderBottomColor: '#1E2535',
  },
  dateLabel: {
    fontSize: 11, fontWeight: '700', color: '#64748B',
    textTransform: 'uppercase', letterSpacing: 0.6,
  },

  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1E2535',
  },
  avatar: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  avatarText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  content: { flex: 1 },
  topLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { fontSize: 12, fontWeight: '700', color: '#E2E8F0' },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  badgeEmoji: { fontSize: 10 },
  badgeLabel: { fontSize: 10, fontWeight: '600' },
  entity: { fontSize: 10, color: '#64748B', textTransform: 'capitalize' },
  details: { fontSize: 12, color: '#64748B', marginTop: 3 },

  time: { fontSize: 10, color: '#475569', marginTop: 2 },
});
