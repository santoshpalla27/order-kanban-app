import { useState, useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../../api/client';
import { formatDate, formatDateTime } from '../../utils/date';
import { Notification } from '../../types';
import { useThemeStore } from '../../store/themeStore';
import {
  Bell, CheckCheck, Search, Filter, X, ChevronDown, RefreshCw, Eye,
} from 'lucide-react';

const NOTIF_META: Record<string, { color: string; label: string }> = {
  comment_added:       { color: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',       label: 'Comment'    },
  mention:             { color: 'text-purple-400 bg-purple-400/10 border-purple-400/20', label: 'Mention'    },
  attachment_uploaded: { color: 'text-orange-400 bg-orange-400/10 border-orange-400/20', label: 'Attachment' },
  status_change:       { color: 'text-amber-400 bg-amber-400/10 border-amber-400/20',    label: 'Status'     },
  chat_message:        { color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', label: 'Chat'   },
};

function getTypeMeta(type: string) {
  return NOTIF_META[type] || { color: 'text-brand-400 bg-brand-400/10 border-brand-400/20', label: type.replace(/_/g, ' ') };
}

function getAvatarGradient(name: string) {
  const colors = [
    'from-pink-500 to-rose-500', 'from-orange-400 to-amber-500',
    'from-emerald-500 to-teal-500', 'from-cyan-500 to-blue-500',
    'from-violet-500 to-purple-500', 'from-fuchsia-500 to-pink-500',
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}

function formatRelative(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return formatDate(dateStr);
}

function formatFull(dateStr: string) {
  return formatDateTime(dateStr);
}

const PAGE_SIZE = 50;

export default function NotificationsPage() {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['notifications-full'],
    queryFn: ({ pageParam }) =>
      notificationsApi.getAll(PAGE_SIZE, pageParam as number | undefined),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.data.has_more ? lastPage.data.next_cursor ?? undefined : undefined,
  });

  const notifications: Notification[] = useMemo(
    () => data?.pages.flatMap(p => p.data.data) ?? [],
    [data],
  );

  const markRead = useMutation({
    mutationFn: (n: Notification) =>
      n.entity_type === 'product' && n.entity_id
        ? notificationsApi.markReadByEntityAndTypes('product', n.entity_id, [n.type])
        : notificationsApi.markAsRead(n.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-full'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['unread-summary'] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => notificationsApi.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-full'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['unread-summary'] });
    },
  });

  const uniqueTypes = useMemo(
    () => [...new Set(notifications.map(n => n.type).filter(Boolean))],
    [notifications],
  );

  const filtered = useMemo(() => {
    return notifications.filter(n => {
      if (statusFilter === 'read' && !n.is_read) return false;
      if (statusFilter === 'unread' && n.is_read) return false;
      if (typeFilter !== 'all' && n.type !== typeFilter) return false;
      if (search && !n.message.toLowerCase().includes(search.toLowerCase())) return false;
      if (dateFrom && new Date(n.created_at).getTime() < new Date(dateFrom).getTime()) return false;
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(n.created_at).getTime() > to.getTime()) return false;
      }
      return true;
    });
  }, [notifications, statusFilter, typeFilter, search, dateFrom, dateTo]);

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const hasFilters = statusFilter !== 'all' || typeFilter !== 'all' || search || dateFrom || dateTo;

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setTypeFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  const inputCls = `px-3 py-2 rounded-lg text-sm border outline-none transition-colors ${
    isDark
      ? 'bg-surface-800 border-surface-700 text-white placeholder-surface-500 focus:border-brand-500'
      : 'bg-white border-surface-300 text-black placeholder-surface-400 focus:border-brand-500'
  }`;

  const selectCls = `${inputCls} cursor-pointer`;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-brand-400 to-indigo-400 flex items-center gap-2">
            <Bell className="w-6 h-6 text-brand-400" />
            Notifications
            {unreadCount > 0 && (
              <span className="text-sm font-semibold px-2 py-0.5 rounded-full bg-red-500 text-white">
                {unreadCount} unread
              </span>
            )}
          </h1>
          <p className={`text-sm mt-1 ${isDark ? 'text-surface-400' : 'text-surface-500'}`}>
            {filtered.length} {filtered.length === 1 ? 'notification' : 'notifications'}
            {hasFilters ? ' matching filters' : ' loaded'}
            {hasNextPage && ' · more available'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-brand-600 hover:bg-brand-500 text-white transition-colors disabled:opacity-50"
            >
              <CheckCheck className="w-4 h-4" /> Mark all read
            </button>
          )}
          <button
            onClick={() => refetch()}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${
              isDark
                ? 'border-surface-700 hover:bg-surface-800 text-surface-300'
                : 'border-surface-300 hover:bg-surface-100 text-surface-600'
            }`}
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className={`rounded-xl border p-4 space-y-3 relative overflow-hidden shadow-sm ${
        isDark ? 'bg-surface-900/60 backdrop-blur-md border-surface-700/50 before:absolute before:inset-0 before:border-t before:border-white/5 before:pointer-events-none' : 'bg-white/80 backdrop-blur-md border-surface-200'
      }`}>
        <div className="flex items-center gap-2 mb-1">
          <Filter className="w-4 h-4 text-brand-400" />
          <span className="text-sm font-medium">Filters</span>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="ml-auto flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              <X className="w-3 h-3" /> Clear all
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              type="text"
              placeholder="Search notifications..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={`${inputCls} !pl-9 w-full`}
            />
          </div>

          {/* Status filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as 'all' | 'unread' | 'read')}
              className={`${selectCls} w-full appearance-none pr-8`}
            >
              <option value="all">All</option>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" />
          </div>

          {/* Type filter */}
          {uniqueTypes.length > 0 && (
            <div className="relative">
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className={`${selectCls} w-full appearance-none pr-8`}
              >
                <option value="all">All types</option>
                {uniqueTypes.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" />
            </div>
          )}

          {/* Date from */}
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className={`${inputCls} w-full`}
          />

          {/* Date to */}
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className={`${inputCls} w-full`}
          />
        </div>
      </div>

      {/* Notification list */}
      <div className={`rounded-xl border overflow-hidden shadow-sm relative ${
        isDark ? 'bg-surface-900/60 backdrop-blur-md border-surface-700/50 before:absolute before:inset-0 before:border-t before:border-white/5 before:pointer-events-none' : 'bg-white/80 backdrop-blur-md border-surface-200'
      }`}>
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Bell className={`w-12 h-12 ${isDark ? 'text-surface-700' : 'text-surface-300'}`} />
            <p className={`text-sm ${isDark ? 'text-surface-500' : 'text-surface-400'}`}>
              {hasFilters ? 'No notifications match your filters' : 'No notifications'}
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-surface-700/20">
              {filtered.map(n => {
                const meta = getTypeMeta(n.type);
                const senderName = n.sender_name || '';
                const initial = senderName ? senderName.charAt(0).toUpperCase() : '?';
                return (
                  <div
                    key={n.id}
                    className={`flex items-start gap-4 px-5 py-4 transition-all duration-300 ${
                      !n.is_read
                        ? isDark ? 'bg-brand-600/5 hover:bg-brand-600/10' : 'bg-brand-50 hover:bg-brand-100/50'
                        : isDark ? 'hover:bg-surface-800/50' : 'hover:bg-surface-50'
                    }`}
                  >
                    {/* Avatar */}
                    <div
                      className={`w-9 h-9 rounded-full bg-gradient-to-br ${getAvatarGradient(senderName || n.type)} flex items-center justify-center text-sm font-bold text-white flex-shrink-0 mt-0.5`}
                    >
                      {initial}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {senderName && (
                          <span className={`text-sm font-semibold ${isDark ? 'text-surface-200' : 'text-surface-800'}`}>
                            {senderName}
                          </span>
                        )}
                        {n.type && (
                          <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-md border ${meta.color}`}>
                            {meta.label}
                          </span>
                        )}
                        {!n.is_read && (
                          <span className="w-2 h-2 rounded-full bg-brand-500 shadow-[0_0_6px_theme(colors.brand.500)] flex-shrink-0" />
                        )}
                      </div>
                      <p className={`text-sm mt-1 ${
                        isDark
                          ? n.is_read ? 'text-surface-400' : 'text-surface-200'
                          : n.is_read ? 'text-surface-500' : 'text-surface-700'
                      }`}>
                        {n.message}
                      </p>
                    </div>

                    {/* Right: time + eye */}
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span
                        className={`text-xs ${isDark ? 'text-surface-500' : 'text-surface-400'}`}
                        title={formatFull(n.created_at)}
                      >
                        {formatRelative(n.created_at)}
                      </span>
                      <span className={`text-[10px] ${isDark ? 'text-surface-600' : 'text-surface-300'}`}>
                        {formatFull(n.created_at)}
                      </span>
                      {!n.is_read && (
                        <button
                          onClick={() => markRead.mutate(n)}
                          disabled={markRead.isPending}
                          title="Mark as read"
                          className={`p-1 rounded-md transition-colors disabled:opacity-50 ${
                            isDark ? 'text-surface-500 hover:text-brand-400' : 'text-surface-400 hover:text-brand-600'
                          }`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Load more */}
            {hasNextPage && (
              <div className={`flex justify-center py-4 border-t ${isDark ? 'border-surface-700/50' : 'border-surface-200'}`}>
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm border transition-colors ${
                    isDark
                      ? 'border-surface-700 hover:bg-surface-800 text-surface-300'
                      : 'border-surface-300 hover:bg-surface-100 text-surface-600'
                  } disabled:opacity-50`}
                >
                  {isFetchingNextPage ? (
                    <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                  {isFetchingNextPage ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
