import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { activityApi } from '../api/client';
import { formatDate } from '../utils/date';
import {
  Plus, Trash2, RefreshCw, Edit3, ShieldCheck, X, Activity, ArrowRight,
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
  created:      { icon: Plus,        color: 'text-emerald-400 bg-emerald-400/10', label: 'Created' },
  updated:      { icon: Edit3,       color: 'text-blue-400 bg-blue-400/10',      label: 'Updated' },
  deleted:      { icon: Trash2,      color: 'text-red-400 bg-red-400/10',        label: 'Deleted' },
  status_changed: { icon: RefreshCw, color: 'text-amber-400 bg-amber-400/10',   label: 'Moved'   },
  role_changed: { icon: ShieldCheck, color: 'text-purple-400 bg-purple-400/10', label: 'Role'    },
};

const ENTITY_META: Record<string, { label: string }> = {
  product: { label: 'Product' },
  user:    { label: 'User'    },
};

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

function getAvatarColor(name: string) {
  const colors = ['from-pink-500 to-rose-500', 'from-orange-400 to-amber-500', 'from-emerald-500 to-teal-500',
    'from-cyan-500 to-blue-500', 'from-violet-500 to-purple-500', 'from-fuchsia-500 to-pink-500'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export default function ActivityPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['activity'],
    queryFn: () => activityApi.getRecent(100),
    refetchInterval: 15000,
  });

  const logs: ActivityLog[] = data?.data || [];

  // Group by date
  const grouped: { date: string; items: ActivityLog[] }[] = [];
  let lastDate = '';
  for (const log of logs) {
    const d = new Date(log.created_at);
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    let label = d.toDateString() === today.toDateString()     ? 'Today'
              : d.toDateString() === yesterday.toDateString() ? 'Yesterday'
              : d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
    if (label !== lastDate) { grouped.push({ date: label, items: [] }); lastDate = label; }
    grouped[grouped.length - 1].items.push(log);
  }

  return (
    <div className="absolute right-0 top-full mt-2 w-[380px] glass-opaque border border-surface-700/50 rounded-2xl shadow-2xl animate-scale-in z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700/40">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-brand-400" />
          <span className="text-sm font-semibold">Activity</span>
          {logs.length > 0 && (
            <span className="text-[10px] bg-surface-700/60 text-surface-400 px-2 py-0.5 rounded-full">
              {logs.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { onClose(); navigate('/activity'); }}
            className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 px-2 py-1 rounded-lg transition-colors"
          >
            View all <ArrowRight className="w-3 h-3" />
          </button>
          <button onClick={onClose} className="btn-ghost p-1 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="max-h-[480px] overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-surface-500 gap-2">
            <Activity className="w-8 h-8 opacity-30" />
            <p className="text-sm">No activity yet</p>
          </div>
        ) : (
          grouped.map(({ date, items }) => (
            <div key={date}>
              <div className="px-4 py-2 bg-surface-800/40 border-b border-surface-700/30 sticky top-0">
                <span className="text-[11px] font-medium text-surface-400 uppercase tracking-wider">{date}</span>
              </div>
              {items.map((log) => {
                const actionMeta = ACTION_META[log.action] || { icon: Activity, color: 'text-surface-400 bg-surface-400/10', label: log.action };
                const entityMeta = ENTITY_META[log.entity] || { label: log.entity };
                const ActionIcon = actionMeta.icon;
                const name = log.user?.name || 'Unknown';

                return (
                  <div key={log.id} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-700/20 transition-colors border-b border-surface-700/20 last:border-0">
                    {/* Avatar */}
                    <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${getAvatarColor(name)} flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mt-0.5`}>
                      {name.charAt(0).toUpperCase()}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-surface-200">{name}</span>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md ${actionMeta.color}`}>
                          <ActionIcon className="w-2.5 h-2.5" />
                          {actionMeta.label}
                        </span>
                        <span className="text-[10px] text-surface-500 capitalize">{entityMeta.label}</span>
                      </div>
                      <p className="text-xs text-surface-400 mt-0.5 truncate">{log.details}</p>
                    </div>

                    {/* Time */}
                    <span className="text-[10px] text-surface-600 flex-shrink-0 mt-0.5">{formatRelative(log.created_at)}</span>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
