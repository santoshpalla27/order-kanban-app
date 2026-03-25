import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { purgeApi } from '../../api/client';
import { useThemeStore } from '../../store/themeStore';
import {
  Trash2,
  Bell,
  Activity,
  MessageSquare,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';

interface PurgeSummaryItem {
  job_name: string;
  rows_deleted: number;
  ran_at: string | null;
  next_run_at: string | null;
  status: string;
  error_msg: string;
}

interface PurgeLog {
  id: number;
  job_name: string;
  rows_deleted: number;
  ran_at: string;
  status: string;
  error_msg: string;
}

interface PurgeStatusData {
  summary: PurgeSummaryItem[];
  history: PurgeLog[];
}

const JOB_META: Record<string, { label: string; icon: React.ElementType; color: string; interval: string }> = {
  trash:        { label: 'Trash',          icon: Trash2,       color: 'bg-red-500',     interval: 'Every 6 hours' },
  notification: { label: 'Notifications',  icon: Bell,         color: 'bg-amber-500',   interval: 'Every 24 hours' },
  activity_log: { label: 'Activity Logs',  icon: Activity,     color: 'bg-blue-500',    interval: 'Every 24 hours' },
  chat_message: { label: 'Chat Messages',  icon: MessageSquare,color: 'bg-violet-500',  interval: 'Every 24 hours' },
};

function formatTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function timeAgo(iso: string | null) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'ok') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-500">
      <CheckCircle2 className="w-3.5 h-3.5" /> OK
    </span>
  );
  if (status === 'failed') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-500">
      <XCircle className="w-3.5 h-3.5" /> Failed
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-surface-400">
      <Clock className="w-3.5 h-3.5" /> Never run
    </span>
  );
}

export default function PurgeStatusPage() {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const queryClient = useQueryClient();
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<Record<string, { count: number; ok: boolean } | null>>({});

  const { data, isLoading, isError } = useQuery({
    queryKey: ['purge-status'],
    queryFn: () => purgeApi.getStatus(),
    refetchInterval: 30_000,
  });

  const runMutation = useMutation({
    mutationFn: (job: string) => purgeApi.runJob(job),
    onMutate: (job) => setRunningJob(job),
    onSuccess: (res, job) => {
      setRunResult((p) => ({ ...p, [job]: { count: res.data.rows_deleted, ok: true } }));
      queryClient.invalidateQueries({ queryKey: ['purge-status'] });
    },
    onError: (_err, job) => {
      setRunResult((p) => ({ ...p, [job]: { count: 0, ok: false } }));
    },
    onSettled: () => setRunningJob(null),
  });

  const status: PurgeStatusData | undefined = data?.data;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (isError || !status) {
    return (
      <div className="flex items-center justify-center py-24 text-red-500">
        Failed to load purge status.
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-brand-400 to-indigo-400 flex items-center gap-3">
          <ShieldAlert className="w-8 h-8 text-brand-500" />
          Purge Status
        </h1>
        <p className={`text-sm mt-1 ${isDark ? 'text-surface-500' : 'text-surface-400'}`}>
          Background cleanup jobs — data retention and storage health
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {status.summary.map((item) => {
          const meta = JOB_META[item.job_name];
          if (!meta) return null;
          const Icon = meta.icon;
          const result = runResult[item.job_name];
          const isRunning = runningJob === item.job_name;
          return (
            <div
              key={item.job_name}
              className={`rounded-2xl p-5 border flex flex-col gap-3 shadow-sm transition-all duration-300 ${isDark ? 'bg-surface-900/60 backdrop-blur-md border-surface-700/50' : 'bg-white/80 backdrop-blur-md border-surface-200'}`}
            >
              <div className="flex items-start justify-between">
                <div className={`w-10 h-10 rounded-xl ${meta.color} flex items-center justify-center flex-shrink-0`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <StatusBadge status={item.status} />
              </div>

              <div>
                <p className="text-sm font-semibold">{meta.label}</p>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-surface-500' : 'text-surface-400'}`}>{meta.interval}</p>
              </div>

              <div className={`rounded-xl p-3 text-xs space-y-1 ${isDark ? 'bg-surface-800' : 'bg-surface-50'}`}>
                <div className="flex justify-between">
                  <span className={isDark ? 'text-surface-500' : 'text-surface-400'}>Last run</span>
                  <span className="font-medium">{timeAgo(item.ran_at) ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className={isDark ? 'text-surface-500' : 'text-surface-400'}>Deleted</span>
                  <span className="font-bold">{item.status === 'never_run' ? '—' : item.rows_deleted.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className={isDark ? 'text-surface-500' : 'text-surface-400'}>Next run</span>
                  <span className="font-medium">{item.next_run_at ? timeAgo(item.next_run_at) === 'just now' ? 'soon' : `~${timeAgo(item.next_run_at)}` : '—'}</span>
                </div>
              </div>

              {item.status === 'failed' && item.error_msg && (
                <p className="text-xs text-red-400 break-words">{item.error_msg}</p>
              )}

              {result && (
                <p className={`text-xs font-medium ${result.ok ? 'text-emerald-500' : 'text-red-400'}`}>
                  {result.ok ? `Ran now — ${result.count} row${result.count !== 1 ? 's' : ''} deleted` : 'Run failed'}
                </p>
              )}

              <button
                onClick={() => runMutation.mutate(item.job_name)}
                disabled={isRunning || runMutation.isPending}
                className={`mt-auto flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  isRunning
                    ? 'opacity-60 cursor-not-allowed bg-brand-500/20 text-brand-400'
                    : 'bg-brand-500/10 text-brand-400 hover:bg-brand-500/20'
                }`}
              >
                {isRunning
                  ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Running...</>
                  : <><Play className="w-3.5 h-3.5" /> Run now</>
                }
              </button>
            </div>
          );
        })}
      </div>

      {/* History log */}
      <div className={`rounded-2xl border overflow-hidden shadow-sm ${isDark ? 'bg-surface-900/60 backdrop-blur-md border-surface-700/50' : 'bg-white/80 backdrop-blur-md border-surface-200'}`}>
        <div className="px-6 py-4 border-b flex items-center gap-2" style={{ borderColor: isDark ? 'rgba(255,255,255,0.07)' : '#e2e8f0' }}>
          <Clock className="w-4 h-4 text-brand-500" />
          <h2 className="text-sm font-semibold">Recent Runs</h2>
          <span className={`ml-auto text-xs ${isDark ? 'text-surface-500' : 'text-surface-400'}`}>Last 20</span>
        </div>

        {status.history.length === 0 ? (
          <div className={`px-6 py-10 text-center text-sm ${isDark ? 'text-surface-500' : 'text-surface-400'}`}>
            No purge runs recorded yet.
          </div>
        ) : (
          <>
            <div className={`hidden sm:grid grid-cols-[1fr_120px_100px_80px] gap-4 px-6 py-3 text-[11px] font-medium uppercase tracking-wide ${isDark ? 'text-surface-500' : 'text-surface-400'}`}>
              <span>Job</span>
              <span>Ran at</span>
              <span className="text-center">Deleted</span>
              <span className="text-center">Status</span>
            </div>
            <div className="divide-y" style={{ borderColor: isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9' }}>
              {status.history.map((log) => {
                const meta = JOB_META[log.job_name];
                const Icon = meta?.icon ?? Activity;
                return (
                  <div
                    key={log.id}
                    className={`px-6 py-3 grid grid-cols-1 sm:grid-cols-[1fr_120px_100px_80px] gap-2 sm:gap-4 items-center transition-colors ${isDark ? 'hover:bg-surface-800/40' : 'hover:bg-surface-50'}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-lg ${meta?.color ?? 'bg-surface-500'} flex items-center justify-center flex-shrink-0`}>
                        <Icon className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="text-sm font-medium">{meta?.label ?? log.job_name}</span>
                    </div>
                    <span className={`text-xs ${isDark ? 'text-surface-400' : 'text-surface-500'}`}>{formatTime(log.ran_at)}</span>
                    <span className="text-sm font-bold text-center">{log.rows_deleted.toLocaleString()}</span>
                    <div className="text-center"><StatusBadge status={log.status} /></div>
                    {log.status === 'failed' && log.error_msg && (
                      <p className="sm:col-span-4 text-xs text-red-400 pl-8">{log.error_msg}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
