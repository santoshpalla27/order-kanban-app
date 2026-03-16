import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { activityApi } from '../../api/client';
import { formatDate, formatDateTime } from '../../utils/date';
import { useThemeStore } from '../../store/themeStore';
import {
  Plus, Trash2, RefreshCw, Edit3, ShieldCheck, Activity,
  Search, Filter, X, ChevronDown, Paperclip, MessageSquare,
} from 'lucide-react';

interface ActivityLog {
  id: number;
  user_id: number;
  user?: { id: number; name: string; email: string };
  action: string;
  entity: string;
  entity_id: number;
  details: string;
  created_at: string;
}

const ACTION_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  created:        { icon: Plus,          color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', label: 'Created'  },
  updated:        { icon: Edit3,         color: 'text-blue-400 bg-blue-400/10 border-blue-400/20',          label: 'Updated'  },
  deleted:        { icon: Trash2,        color: 'text-red-400 bg-red-400/10 border-red-400/20',              label: 'Deleted'  },
  restored:       { icon: RefreshCw,     color: 'text-teal-400 bg-teal-400/10 border-teal-400/20',          label: 'Restored' },
  status_changed: { icon: RefreshCw,     color: 'text-amber-400 bg-amber-400/10 border-amber-400/20',       label: 'Moved'    },
  role_changed:   { icon: ShieldCheck,   color: 'text-purple-400 bg-purple-400/10 border-purple-400/20',    label: 'Role'     },
  uploaded:       { icon: Paperclip,     color: 'text-orange-400 bg-orange-400/10 border-orange-400/20',    label: 'Uploaded' },
  commented:      { icon: MessageSquare, color: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',           label: 'Commented'},
  edited:         { icon: Edit3,         color: 'text-sky-400 bg-sky-400/10 border-sky-400/20',              label: 'Edited'   },
};

const ENTITY_LABELS: Record<string, string> = {
  product:    'Product',
  user:       'User',
  attachment: 'Attachment',
  comment:    'Comment',
};

function getAvatarColor(name: string) {
  const colors = [
    'from-pink-500 to-rose-500', 'from-orange-400 to-amber-500',
    'from-emerald-500 to-teal-500', 'from-cyan-500 to-blue-500',
    'from-violet-500 to-purple-500', 'from-fuchsia-500 to-pink-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function formatRelative(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
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

export default function ActivityPage() {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';

  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['activity-full'],
    queryFn: () => activityApi.getRecent(500),
  });

  const logs: ActivityLog[] = data?.data || [];

  // Collect unique users and actions for filter dropdowns
  const uniqueUsers = useMemo(() => {
    const seen = new Map<number, string>();
    logs.forEach(l => { if (l.user) seen.set(l.user.id, l.user.name); });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [logs]);

  const uniqueActions = useMemo(() => [...new Set(logs.map(l => l.action))], [logs]);
  const uniqueEntities = useMemo(() => [...new Set(logs.map(l => l.entity))], [logs]);

  const filtered = useMemo(() => {
    return logs.filter(log => {
      if (actionFilter !== 'all' && log.action !== actionFilter) return false;
      if (entityFilter !== 'all' && log.entity !== entityFilter) return false;
      if (userFilter && log.user?.name.toLowerCase().includes(userFilter.toLowerCase()) === false) return false;
      if (search) {
        const q = search.toLowerCase();
        const matches = log.details.toLowerCase().includes(q)
          || log.action.toLowerCase().includes(q)
          || log.entity.toLowerCase().includes(q)
          || (log.user?.name.toLowerCase().includes(q) ?? false);
        if (!matches) return false;
      }
      if (dateFrom) {
        const from = new Date(dateFrom).getTime();
        if (new Date(log.created_at).getTime() < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(log.created_at).getTime() > to.getTime()) return false;
      }
      return true;
    });
  }, [logs, actionFilter, entityFilter, userFilter, search, dateFrom, dateTo]);

  const hasFilters = actionFilter !== 'all' || entityFilter !== 'all' || userFilter || search || dateFrom || dateTo;

  const clearFilters = () => {
    setSearch('');
    setActionFilter('all');
    setEntityFilter('all');
    setUserFilter('');
    setDateFrom('');
    setDateTo('');
  };

  const inputCls = `px-3 py-2 rounded-lg text-sm border outline-none transition-colors ${
    isDark
      ? 'bg-surface-800 border-surface-700 text-surface-200 placeholder-surface-500 focus:border-brand-500'
      : 'bg-white border-surface-300 text-surface-800 placeholder-surface-400 focus:border-brand-500'
  }`;

  const selectCls = `${inputCls} cursor-pointer`;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-brand-400" />
            Activity Log
          </h1>
          <p className={`text-sm mt-1 ${isDark ? 'text-surface-400' : 'text-surface-500'}`}>
            {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
            {hasFilters ? ' matching filters' : ' total'}
          </p>
        </div>
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

      {/* Filter bar */}
      <div className={`rounded-xl border p-4 space-y-3 ${
        isDark ? 'bg-surface-900 border-surface-700/50' : 'bg-white border-surface-200'
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              type="text"
              placeholder="Search details..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={`${inputCls} pl-9 w-full`}
            />
          </div>

          {/* Action filter */}
          <div className="relative">
            <select
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value)}
              className={`${selectCls} w-full appearance-none pr-8`}
            >
              <option value="all">All actions</option>
              {uniqueActions.map(a => (
                <option key={a} value={a}>
                  {ACTION_META[a]?.label || a}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" />
          </div>

          {/* Entity filter */}
          <div className="relative">
            <select
              value={entityFilter}
              onChange={e => setEntityFilter(e.target.value)}
              className={`${selectCls} w-full appearance-none pr-8`}
            >
              <option value="all">All types</option>
              {uniqueEntities.map(e => (
                <option key={e} value={e}>
                  {ENTITY_LABELS[e] || e}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" />
          </div>

          {/* User filter */}
          <input
            type="text"
            placeholder="Filter by user..."
            value={userFilter}
            onChange={e => setUserFilter(e.target.value)}
            className={`${inputCls} w-full`}
          />

          {/* Date from */}
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className={`${inputCls} w-full`}
            placeholder="From date"
          />

          {/* Date to */}
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className={`${inputCls} w-full`}
            placeholder="To date"
          />
        </div>
      </div>

      {/* Log list */}
      <div className={`rounded-xl border overflow-hidden ${
        isDark ? 'bg-surface-900 border-surface-700/50' : 'bg-white border-surface-200'
      }`}>
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Activity className={`w-12 h-12 ${isDark ? 'text-surface-700' : 'text-surface-300'}`} />
            <p className={`text-sm ${isDark ? 'text-surface-500' : 'text-surface-400'}`}>
              {hasFilters ? 'No entries match your filters' : 'No activity yet'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-surface-700/20">
            {filtered.map(log => {
              const actionMeta = ACTION_META[log.action] || {
                icon: Activity,
                color: 'text-surface-400 bg-surface-400/10 border-surface-400/20',
                label: log.action,
              };
              const ActionIcon = actionMeta.icon;
              const name = log.user?.name || 'Unknown';
              const entityLabel = ENTITY_LABELS[log.entity] || log.entity;

              return (
                <div
                  key={log.id}
                  className={`flex items-start gap-4 px-5 py-4 transition-colors ${
                    isDark ? 'hover:bg-surface-800/50' : 'hover:bg-surface-50'
                  }`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-9 h-9 rounded-full bg-gradient-to-br ${getAvatarColor(name)} flex items-center justify-center text-sm font-bold text-white flex-shrink-0 mt-0.5`}
                  >
                    {name.charAt(0).toUpperCase()}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-semibold ${isDark ? 'text-surface-200' : 'text-surface-800'}`}>
                        {name}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md border ${actionMeta.color}`}
                      >
                        <ActionIcon className="w-3 h-3" />
                        {actionMeta.label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-md capitalize ${
                        isDark ? 'bg-surface-800 text-surface-400' : 'bg-surface-100 text-surface-500'
                      }`}>
                        {entityLabel}
                      </span>
                    </div>
                    <p className={`text-sm mt-1 ${isDark ? 'text-surface-400' : 'text-surface-600'}`}>
                      {log.details}
                    </p>
                    {log.user?.email && (
                      <p className={`text-xs mt-0.5 ${isDark ? 'text-surface-600' : 'text-surface-400'}`}>
                        {log.user.email}
                      </p>
                    )}
                  </div>

                  {/* Time */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span
                      className={`text-xs ${isDark ? 'text-surface-500' : 'text-surface-400'}`}
                      title={formatFull(log.created_at)}
                    >
                      {formatRelative(log.created_at)}
                    </span>
                    <span className={`text-[10px] ${isDark ? 'text-surface-600' : 'text-surface-300'}`}>
                      {formatFull(log.created_at)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
