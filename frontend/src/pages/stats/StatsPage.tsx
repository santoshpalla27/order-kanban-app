import { useQuery } from '@tanstack/react-query';
import { statsApi } from '../../api/client';
import { useThemeStore } from '../../store/themeStore';
import {
  Package,
  CheckCircle2,
  AlertTriangle,
  CalendarClock,
  TrendingUp,
  Users,
  BarChart3,
} from 'lucide-react';

interface StatusBreakdown {
  yet_to_start: number;
  working: number;
  review: number;
  done: number;
}

interface PeriodCounts {
  today: number;
  week: number;
  month: number;
}

interface UserStat {
  user_id: number;
  user_name: string;
  assigned: number;
  yet_to_start: number;
  working: number;
  review: number;
  done: number;
  done_rate: number;
}

interface StatsData {
  total_active: number;
  status_breakdown: StatusBreakdown;
  created: PeriodCounts;
  completed: PeriodCounts;
  overdue: number;
  due_soon: number;
  user_stats: UserStat[];
}

const STATUS_LABELS: Record<string, string> = {
  yet_to_start: 'Yet to Start',
  working: 'In Progress',
  review: 'In Review',
  done: 'Done',
};

const STATUS_COLORS: Record<string, string> = {
  yet_to_start: 'bg-surface-400',
  working: 'bg-blue-500',
  review: 'bg-amber-500',
  done: 'bg-emerald-500',
};

const STATUS_TEXT: Record<string, string> = {
  yet_to_start: 'text-surface-500',
  working: 'text-blue-500',
  review: 'text-amber-500',
  done: 'text-emerald-500',
};

function UserAvatarSmall({ name }: { name: string }) {
  const colors = [
    'from-violet-500 to-purple-500',
    'from-blue-500 to-cyan-500',
    'from-emerald-500 to-teal-500',
    'from-amber-500 to-orange-500',
    'from-rose-500 to-pink-500',
    'from-fuchsia-500 to-purple-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const gradient = colors[Math.abs(hash) % colors.length];
  return (
    <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  sub,
  isDark,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  sub?: string;
  isDark: boolean;
}) {
  return (
    <div className={`rounded-2xl p-5 border ${isDark ? 'bg-surface-900 border-surface-700/50' : 'bg-white border-surface-200'}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className={`text-xs font-medium uppercase tracking-wide ${isDark ? 'text-surface-500' : 'text-surface-400'}`}>{label}</p>
          <p className="text-3xl font-bold mt-1">{value.toLocaleString()}</p>
          {sub && <p className={`text-xs mt-1 ${isDark ? 'text-surface-500' : 'text-surface-400'}`}>{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center flex-shrink-0`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </div>
  );
}

function PeriodCard({
  label,
  counts,
  icon: Icon,
  color,
  isDark,
}: {
  label: string;
  counts: PeriodCounts;
  icon: React.ElementType;
  color: string;
  isDark: boolean;
}) {
  return (
    <div className={`rounded-2xl p-5 border ${isDark ? 'bg-surface-900 border-surface-700/50' : 'bg-white border-surface-200'}`}>
      <div className="flex items-center gap-2 mb-4">
        <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center flex-shrink-0`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <p className="text-sm font-semibold">{label}</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {([['Today', counts.today], ['This Week', counts.week], ['This Month', counts.month]] as [string, number][]).map(([period, val]) => (
          <div key={period} className={`rounded-xl p-3 text-center ${isDark ? 'bg-surface-800' : 'bg-surface-50'}`}>
            <p className="text-xl font-bold">{val}</p>
            <p className={`text-[10px] mt-0.5 ${isDark ? 'text-surface-500' : 'text-surface-400'}`}>{period}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressBar({ value, max, colorClass }: { value: number; max: number; colorClass: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="h-1.5 w-full bg-surface-200 dark:bg-surface-700 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${colorClass} transition-all duration-500`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function StatsPage() {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['stats'],
    queryFn: () => statsApi.getStats(),
    staleTime: 0,
    refetchOnMount: true,
    refetchInterval: 30_000,
  });

  const stats: StatsData | undefined = data?.data;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <div className="flex items-center justify-center py-24 text-red-500">
        Failed to load statistics.
      </div>
    );
  }

  const { total_active, status_breakdown, created, completed, overdue, due_soon, user_stats } = stats;
  const totalStatus = status_breakdown.yet_to_start + status_breakdown.working + status_breakdown.review + status_breakdown.done;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-brand-500" />
          Statistics
        </h1>
        <p className={`text-sm mt-1 ${isDark ? 'text-surface-500' : 'text-surface-400'}`}>
          Overview of all orders and team performance
        </p>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Active Orders" value={total_active} icon={Package} color="bg-brand-500" isDark={isDark} />
        <StatCard label="Completed" value={status_breakdown.done} icon={CheckCircle2} color="bg-emerald-500" sub={`${totalStatus > 0 ? Math.round((status_breakdown.done / totalStatus) * 100) : 0}% of total`} isDark={isDark} />
        <StatCard label="Overdue" value={overdue} icon={AlertTriangle} color="bg-red-500" sub="Past delivery date" isDark={isDark} />
        <StatCard label="Due Soon" value={due_soon} icon={CalendarClock} color="bg-amber-500" sub="Next 7 days" isDark={isDark} />
      </div>

      {/* Status breakdown + Period cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Status breakdown */}
        <div className={`rounded-2xl p-5 border lg:col-span-1 ${isDark ? 'bg-surface-900 border-surface-700/50' : 'bg-white border-surface-200'}`}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
              <Package className="w-4 h-4 text-white" />
            </div>
            <p className="text-sm font-semibold">Status Breakdown</p>
          </div>
          <div className="space-y-3">
            {(['yet_to_start', 'working', 'review', 'done'] as const).map((s) => {
              const count = status_breakdown[s];
              const pct = totalStatus > 0 ? Math.round((count / totalStatus) * 100) : 0;
              return (
                <div key={s}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-medium ${STATUS_TEXT[s]}`}>{STATUS_LABELS[s]}</span>
                    <span className="text-xs font-bold">{count} <span className={`font-normal ${isDark ? 'text-surface-500' : 'text-surface-400'}`}>({pct}%)</span></span>
                  </div>
                  <ProgressBar value={count} max={totalStatus} colorClass={STATUS_COLORS[s]} />
                </div>
              );
            })}
          </div>
          {/* Inline mini-bar */}
          <div className="mt-4 h-3 rounded-full overflow-hidden flex">
            {(['yet_to_start', 'working', 'review', 'done'] as const).map((s) => {
              const pct = totalStatus > 0 ? (status_breakdown[s] / totalStatus) * 100 : 0;
              return pct > 0 ? (
                <div key={s} className={`${STATUS_COLORS[s]} h-full`} style={{ width: `${pct}%` }} title={`${STATUS_LABELS[s]}: ${status_breakdown[s]}`} />
              ) : null;
            })}
          </div>
        </div>

        {/* Period cards */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PeriodCard label="Orders Created" counts={created} icon={TrendingUp} color="bg-blue-500" isDark={isDark} />
          <PeriodCard label="Orders Completed" counts={completed} icon={CheckCircle2} color="bg-emerald-500" isDark={isDark} />
        </div>
      </div>

      {/* User performance table */}
      {user_stats.length > 0 && (
        <div className={`rounded-2xl border ${isDark ? 'bg-surface-900 border-surface-700/50' : 'bg-white border-surface-200'}`}>
          <div className="px-6 py-4 border-b flex items-center gap-2" style={{ borderColor: isDark ? 'rgba(255,255,255,0.07)' : '#e2e8f0' }}>
            <Users className="w-4 h-4 text-brand-500" />
            <h2 className="text-sm font-semibold">Team Performance</h2>
            <span className={`ml-auto text-xs ${isDark ? 'text-surface-500' : 'text-surface-400'}`}>{user_stats.length} members</span>
          </div>

          {/* Table header */}
          <div className={`hidden sm:grid grid-cols-[minmax(160px,1fr)_80px_80px_80px_80px_80px_120px] gap-4 px-6 py-2 text-[11px] font-medium uppercase tracking-wide ${isDark ? 'text-surface-500' : 'text-surface-400'}`}>
            <span>Member</span>
            <span className="text-center">Assigned</span>
            <span className="text-center text-surface-400">Not Started</span>
            <span className="text-center text-blue-500">In Progress</span>
            <span className="text-center text-amber-500">In Review</span>
            <span className="text-center text-emerald-500">Done</span>
            <span className="text-center">Completion</span>
          </div>

          <div className="divide-y" style={{ borderColor: isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9' }}>
            {user_stats.map((u) => (
              <div
                key={u.user_id}
                className={`px-6 py-3 grid grid-cols-1 sm:grid-cols-[minmax(160px,1fr)_80px_80px_80px_80px_80px_120px] gap-4 items-center transition-colors ${isDark ? 'hover:bg-surface-800/50' : 'hover:bg-surface-50'}`}
              >
                {/* Name */}
                <div className="flex items-center gap-3">
                  <UserAvatarSmall name={u.user_name} />
                  <span className="text-sm font-medium truncate">{u.user_name}</span>
                </div>

                {/* Counts — on mobile show inline labels */}
                <div className="text-center">
                  <span className="text-sm font-bold">{u.assigned}</span>
                  <span className="sm:hidden text-xs text-surface-400 ml-1">total</span>
                </div>
                <div className="text-center">
                  <span className={`text-sm font-medium ${isDark ? 'text-surface-400' : 'text-surface-500'}`}>{u.yet_to_start}</span>
                </div>
                <div className="text-center">
                  <span className="text-sm font-medium text-blue-500">{u.working}</span>
                </div>
                <div className="text-center">
                  <span className="text-sm font-medium text-amber-500">{u.review}</span>
                </div>
                <div className="text-center">
                  <span className="text-sm font-medium text-emerald-500">{u.done}</span>
                </div>

                {/* Completion rate */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-surface-200 dark:bg-surface-700 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${u.done_rate}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold w-9 text-right">{Math.round(u.done_rate)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {user_stats.length === 0 && (
        <div className={`rounded-2xl border p-10 text-center ${isDark ? 'bg-surface-900 border-surface-700/50 text-surface-500' : 'bg-white border-surface-200 text-surface-400'}`}>
          <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No assigned orders yet.</p>
        </div>
      )}
    </div>
  );
}
