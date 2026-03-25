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
  Database,
  ChevronDown,
  ChevronUp,
  Timer,
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

interface PurgeInsightItem {
  job_name: string;
  total_rows: number;
  eligible_rows: number;
  in_grace_period: number;
  oldest_age_days: number;
  newest_age_days: number;
  retention_days: number;
}

interface PurgeRow {
  id: number;
  label: string;
  detail: string;
  created_at: string;
  purges_at: string;
  is_eligible: boolean;
}

interface PurgeStatusData {
  summary: PurgeSummaryItem[];
  history: PurgeLog[];
  insights: PurgeInsightItem[];
}

const JOB_META: Record<string, { label: string; icon: React.ElementType; color: string; interval: string }> = {
  trash:        { label: 'Trash',          icon: Trash2,        color: 'bg-red-500',    interval: 'Every 6 hours' },
  notification: { label: 'Notifications',  icon: Bell,          color: 'bg-amber-500',  interval: 'Every 24 hours' },
  activity_log: { label: 'Activity Logs',  icon: Activity,      color: 'bg-blue-500',   interval: 'Every 24 hours' },
  chat_message: { label: 'Chat Messages',  icon: MessageSquare, color: 'bg-violet-500', interval: 'Every 24 hours' },
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

function formatAgeDays(days: number) {
  if (days === 0) return '—';
  const totalMins = Math.round(days * 24 * 60);
  if (totalMins < 1) return '< 1m';
  if (totalMins < 60) return `${totalMins}m`;
  const hrs = Math.round(days * 24);
  if (hrs < 24) return `${hrs}h`;
  if (days < 2) return `${days.toFixed(1)}d`;
  return `${Math.floor(days)}d`;
}

// Returns "in Xd", "in Xh", "in Xm", or "next cycle" for rows that are overdue
function formatCountdown(purgesAt: string): { text: string; urgent: boolean; overdue: boolean } {
  const ms = new Date(purgesAt).getTime() - Date.now();
  if (ms <= 0) return { text: 'next cycle', urgent: true, overdue: true };
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return { text: `in ${mins}m`, urgent: true, overdue: false };
  const hrs = Math.floor(ms / 3600000);
  if (hrs < 24) return { text: `in ${hrs}h`, urgent: true, overdue: false };
  const days = Math.floor(ms / 86400000);
  return { text: `in ${days}d`, urgent: days <= 3, overdue: false };
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
  const [runResult, setRunResult] = useState<Record<string, { count: number; ok: boolean; force?: boolean } | null>>({});
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [jobRows, setJobRows] = useState<Record<string, PurgeRow[]>>({});
  const [jobCursors, setJobCursors] = useState<Record<string, number | null>>({});
  const [jobHasMore, setJobHasMore] = useState<Record<string, boolean>>({});
  const [loadingJob, setLoadingJob] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<string | null>(null);
  const fetchRows = async (job: string, cursor?: number) => {
    const isFirst = cursor == null;
    if (isFirst) setLoadingJob(job); else setLoadingMore(job);
    try {
      const res = await purgeApi.getRows(job, 25, cursor);
      const { data, next_cursor, has_more } = res.data;
      setJobRows((p) => ({ ...p, [job]: isFirst ? data : [...(p[job] ?? []), ...data] }));
      setJobCursors((p) => ({ ...p, [job]: next_cursor }));
      setJobHasMore((p) => ({ ...p, [job]: has_more }));
    } catch {
      if (isFirst) setJobRows((p) => ({ ...p, [job]: [] }));
    } finally {
      if (isFirst) setLoadingJob(null); else setLoadingMore(null);
    }
  };

  const toggleRows = async (job: string) => {
    if (expandedJob === job) { setExpandedJob(null); return; }
    setExpandedJob(job);
    if (jobRows[job] !== undefined) return; // already loaded
    await fetchRows(job);
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['purge-status'],
    queryFn: () => purgeApi.getStatus(),
    refetchInterval: 30_000,
  });

  const runMutation = useMutation({
    mutationFn: ({ job, force }: { job: string; force: boolean }) => purgeApi.runJob(job, force),
    onMutate: ({ job }) => setRunningJob(job),
    onSuccess: (res, { job, force }) => {
      setRunResult((p) => ({ ...p, [job]: { count: res.data.rows_deleted, ok: true, force } }));
      setJobRows((p) => { const n = { ...p }; delete n[job]; return n; }); // clear so next expand re-fetches
      setJobCursors((p) => { const n = { ...p }; delete n[job]; return n; });
      setJobHasMore((p) => { const n = { ...p }; delete n[job]; return n; });
      setExpandedJob(null);
      queryClient.invalidateQueries({ queryKey: ['purge-status'] });
    },
    onError: (_err, { job }) => {
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
                  {result.ok
                    ? `Ran now — ${result.count} row${result.count !== 1 ? 's' : ''} deleted`
                    : 'Run failed'}
                </p>
              )}

              <div className="mt-auto flex gap-2">
                <button
                  onClick={() => runMutation.mutate({ job: item.job_name, force: false })}
                  disabled={isRunning || runMutation.isPending}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    isRunning
                      ? 'opacity-60 cursor-not-allowed bg-brand-500/20 text-brand-400'
                      : 'bg-brand-500/10 text-brand-400 hover:bg-brand-500/20'
                  }`}
                >
                  {isRunning
                    ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Running...</>
                    : <><Play className="w-3.5 h-3.5" /> Run</>
                  }
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live data insights */}
      {status.insights && status.insights.length > 0 && (
        <div className={`rounded-2xl border overflow-hidden shadow-sm ${isDark ? 'bg-surface-900/60 backdrop-blur-md border-surface-700/50' : 'bg-white/80 backdrop-blur-md border-surface-200'}`}>
          <div className="px-6 py-4 border-b flex items-center gap-2" style={{ borderColor: isDark ? 'rgba(255,255,255,0.07)' : '#e2e8f0' }}>
            <Database className="w-4 h-4 text-brand-500" />
            <h2 className="text-sm font-semibold">Live Data</h2>
            <span className={`ml-auto text-xs ${isDark ? 'text-surface-500' : 'text-surface-400'}`}>Current rows in each table</span>
          </div>

          <div className="divide-y" style={{ borderColor: isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9' }}>
            {status.insights.map((insight) => {
              const meta = JOB_META[insight.job_name];
              if (!meta) return null;
              const Icon = meta.icon;
              const eligiblePct = insight.total_rows > 0 ? (insight.eligible_rows / insight.total_rows) * 100 : 0;
              const isTrash = insight.job_name === 'trash';
              const timeUntilOldestClears = insight.oldest_age_days > 0
                ? Math.max(0, insight.retention_days - insight.oldest_age_days)
                : null;
              const isExpanded = expandedJob === insight.job_name;
              const rows = jobRows[insight.job_name];

              return (
                <div key={insight.job_name}>
                  <div className={`px-6 py-4 transition-colors ${isDark ? 'hover:bg-surface-800/30' : 'hover:bg-surface-50'}`}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-7 h-7 rounded-lg ${meta.color} flex items-center justify-center flex-shrink-0`}>
                        <Icon className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="text-sm font-semibold">{meta.label}</span>
                      <span className={`ml-auto text-xl font-black ${insight.total_rows === 0 ? (isDark ? 'text-surface-500' : 'text-surface-400') : ''}`}>
                        {insight.total_rows.toLocaleString()}
                      </span>
                      <span className={`text-xs ${isDark ? 'text-surface-500' : 'text-surface-400'}`}>rows</span>
                    </div>

                    {insight.total_rows > 0 ? (
                      <div className="space-y-2.5">
                        {/* Eligible progress bar */}
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className={isDark ? 'text-surface-500' : 'text-surface-400'}>
                              {insight.eligible_rows > 0 ? (
                                <span className="text-amber-500 font-semibold">
                                  {insight.eligible_rows.toLocaleString()} eligible for deletion
                                </span>
                              ) : 'No rows eligible yet'}
                            </span>
                            {eligiblePct > 0 && (
                              <span className="font-semibold text-amber-500">{eligiblePct.toFixed(1)}%</span>
                            )}
                          </div>
                          <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-surface-700' : 'bg-surface-200'}`}>
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${eligiblePct > 50 ? 'bg-red-500' : eligiblePct > 20 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              style={{ width: `${Math.min(eligiblePct, 100)}%` }}
                            />
                          </div>
                        </div>

                        {/* Clears-in + trash grace period */}
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className={`text-xs ${isDark ? 'text-surface-500' : 'text-surface-400'}`}>
                            Clears in:&nbsp;
                            {timeUntilOldestClears !== null && timeUntilOldestClears > 0
                              ? <span className="font-semibold">{formatAgeDays(timeUntilOldestClears)}</span>
                              : insight.eligible_rows > 0
                                ? <span className="font-semibold text-amber-500">next cycle</span>
                                : <span className="font-semibold">—</span>
                            }
                          </span>
                          {isTrash && insight.in_grace_period > 0 && (
                            <span className={`text-xs ${isDark ? 'text-surface-500' : 'text-surface-400'}`}>
                              <span className="font-semibold text-blue-400">{insight.in_grace_period}</span> in grace &nbsp;·&nbsp;
                              <span className="font-semibold text-amber-500">{insight.eligible_rows}</span> past grace
                            </span>
                          )}
                        </div>

                        {/* Expand rows button */}
                        <button
                          onClick={() => toggleRows(insight.job_name)}
                          className={`flex items-center gap-1.5 text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors ${
                            isExpanded
                              ? isDark ? 'bg-surface-700 text-surface-200' : 'bg-surface-200 text-surface-700'
                              : isDark ? 'bg-surface-800 text-surface-400 hover:bg-surface-700' : 'bg-surface-100 text-surface-500 hover:bg-surface-200'
                          }`}
                        >
                          <Timer className="w-3.5 h-3.5" />
                          {isExpanded ? 'Hide rows' : 'View rows & purge timers'}
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      </div>
                    ) : (
                      <p className={`text-xs ${isDark ? 'text-surface-500' : 'text-surface-400'}`}>Table is empty — nothing to purge.</p>
                    )}
                  </div>

                  {/* Expanded rows table */}
                  {isExpanded && (
                    <div className={`border-t ${isDark ? 'border-surface-700/50 bg-surface-900/40' : 'border-surface-100 bg-surface-50/60'}`}>
                      {loadingJob === insight.job_name ? (
                        <div className="flex items-center justify-center py-6">
                          <RefreshCw className="w-4 h-4 animate-spin text-brand-500" />
                        </div>
                      ) : !rows || rows.length === 0 ? (
                        <p className={`text-xs px-6 py-4 ${isDark ? 'text-surface-500' : 'text-surface-400'}`}>No rows found.</p>
                      ) : (
                        <>
                          {/* Column headers */}
                          <div className={`grid grid-cols-[40px_1fr_120px_100px] gap-3 px-6 py-2 text-[10px] font-semibold uppercase tracking-wide ${isDark ? 'text-surface-600' : 'text-surface-400'}`}>
                            <span>#ID</span>
                            <span>{insight.job_name === 'trash' ? 'Product' : insight.job_name === 'notification' ? 'Message' : 'Content'}</span>
                            <span>{insight.job_name === 'trash' ? 'Deleted at' : 'Created at'}</span>
                            <span className="text-right">Purges in</span>
                          </div>
                          <div className="divide-y" style={{ borderColor: isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9' }}>
                            {rows.map((row) => {
                              const countdown = formatCountdown(row.purges_at);
                              return (
                                <div
                                  key={row.id}
                                  className={`grid grid-cols-[40px_1fr_120px_100px] gap-3 items-center px-6 py-2.5 ${isDark ? 'hover:bg-surface-800/40' : 'hover:bg-white/80'}`}
                                >
                                  <span className={`text-[10px] font-mono ${isDark ? 'text-surface-500' : 'text-surface-400'}`}>#{row.id}</span>
                                  <div className="min-w-0">
                                    <p className="text-xs truncate">{row.label}</p>
                                    {row.detail && (
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-surface-700 text-surface-400' : 'bg-surface-200 text-surface-500'}`}>{row.detail}</span>
                                    )}
                                  </div>
                                  <span className={`text-[10px] ${isDark ? 'text-surface-500' : 'text-surface-400'}`}>
                                    {new Date(row.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })}
                                  </span>
                                  <span className={`text-xs font-bold text-right ${
                                    countdown.overdue ? 'text-red-400' : countdown.urgent ? 'text-amber-400' : 'text-emerald-500'
                                  }`}>
                                    {countdown.text}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          {/* Load more */}
                          <div className={`px-6 py-2.5 flex items-center justify-between border-t text-[11px] ${isDark ? 'border-surface-700/50 text-surface-500' : 'border-surface-100 text-surface-400'}`}>
                            <span>Showing {rows.length} of {insight.total_rows.toLocaleString()} · oldest first</span>
                            {jobHasMore[insight.job_name] && (
                              <button
                                onClick={() => { const c = jobCursors[insight.job_name]; if (c != null) fetchRows(insight.job_name, c); }}
                                disabled={loadingMore === insight.job_name}
                                className={`flex items-center gap-1.5 font-semibold py-1 px-2.5 rounded-lg transition-colors ${isDark ? 'bg-surface-700 hover:bg-surface-600 text-surface-300' : 'bg-surface-200 hover:bg-surface-300 text-surface-600'} disabled:opacity-50`}
                              >
                                {loadingMore === insight.job_name
                                  ? <><RefreshCw className="w-3 h-3 animate-spin" /> Loading...</>
                                  : 'Load more'
                                }
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

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
