import { useState } from 'react';
import { X, Loader2, Check, Bell, Monitor, Smartphone } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { profileApi } from '../api/client';
import {
  User,
  NotificationPrefs,
  NotificationMode,
  NotifType,
  ALL_NOTIF_TYPES,
  DEFAULT_NOTIFICATION_PREFS,
} from '../types';

interface Props {
  onClose: () => void;
}

const NOTIF_MODE_OPTIONS: { value: NotificationMode; label: string; desc: string }[] = [
  { value: 'all', label: 'All Notifications', desc: 'Receive every notification' },
  { value: 'my_orders', label: 'My Orders + Chat', desc: 'Only orders assigned to me & team chat' },
  { value: 'custom', label: 'Custom', desc: 'Choose exactly what you receive' },
];

const NOTIF_TYPE_LABELS: Record<NotifType, string> = {
  status_change: 'Status Changes',
  comment: 'Comments',
  mention: 'Mentions',
  assignment: 'Assignments',
  attachment: 'Attachments',
  chat: 'Team Chat',
  product_created: 'New Orders',
  product_deleted: 'Deleted Orders',
  delivery_reminder: 'Delivery Reminders',
};

// Preset type lists for quick-select buttons inside a custom channel.
const PRESET_ALL: NotifType[]       = [...ALL_NOTIF_TYPES];
const PRESET_MY_ORDERS: NotifType[] = [
  'status_change', 'comment', 'mention', 'assignment',
  'attachment', 'product_created', 'product_deleted', 'delivery_reminder',
  // 'chat' intentionally excluded — my orders preset is order-focused
];

function ChannelPrefs({
  label,
  icon,
  enabled,
  types,
  onToggleEnabled,
  onToggleType,
  onSetPreset,
  isDark,
}: {
  label: string;
  icon: React.ReactNode;
  enabled: boolean;
  types: NotifType[];
  onToggleEnabled: (v: boolean) => void;
  onToggleType: (t: NotifType, v: boolean) => void;
  onSetPreset: (preset: NotifType[]) => void;
  isDark: boolean;
}) {
  const safeTypes = types ?? [];
  const isAllSelected      = PRESET_ALL.every((t) => t === 'mention' || safeTypes.includes(t));
  const isMyOrdersSelected = (
    PRESET_MY_ORDERS.every((t) => t === 'mention' || safeTypes.includes(t)) &&
    !safeTypes.includes('chat')
  );

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${isDark ? 'border-surface-700/50 bg-surface-800/40' : 'border-surface-200 bg-surface-50'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium">{label}</span>
        </div>
        <button
          type="button"
          onClick={() => onToggleEnabled(!enabled)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? 'bg-brand-600' : isDark ? 'bg-surface-600' : 'bg-surface-300'}`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-1'}`}
          />
        </button>
      </div>

      {enabled && (
        <>
          {/* Quick-select preset buttons */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onSetPreset(PRESET_ALL)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                isAllSelected
                  ? 'bg-brand-600 border-brand-600 text-white'
                  : isDark
                    ? 'border-surface-600 text-surface-400 hover:border-brand-500/50 hover:text-surface-200'
                    : 'border-surface-300 text-surface-500 hover:border-brand-400 hover:text-surface-700'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => onSetPreset(PRESET_MY_ORDERS)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                isMyOrdersSelected
                  ? 'bg-brand-600 border-brand-600 text-white'
                  : isDark
                    ? 'border-surface-600 text-surface-400 hover:border-brand-500/50 hover:text-surface-200'
                    : 'border-surface-300 text-surface-500 hover:border-brand-400 hover:text-surface-700'
              }`}
            >
              My Orders
            </button>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-1">
            {ALL_NOTIF_TYPES.map((t) => {
              const locked = t === 'mention';
              const checked = locked || safeTypes.includes(t);
              return (
                <label
                  key={t}
                  className={`flex items-center gap-2 text-xs cursor-pointer select-none ${
                    locked ? 'opacity-60 cursor-not-allowed' : ''
                  } ${isDark ? 'text-surface-300' : 'text-surface-700'}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={locked}
                    onChange={(e) => !locked && onToggleType(t, e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-brand-600"
                  />
                  {NOTIF_TYPE_LABELS[t]}
                  {locked && <span className="text-brand-500 text-[10px] ml-0.5">always on</span>}
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function ProfileModal({ onClose }: Props) {
  const { user, updateUser } = useAuthStore();
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';

  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const raw = user?.notification_prefs;
  const initPrefs: NotificationPrefs = raw ? {
    mode: raw.mode ?? 'all',
    web:  { enabled: raw.web?.enabled ?? true,  types: raw.web?.types  ?? [...ALL_NOTIF_TYPES] },
    push: { enabled: raw.push?.enabled ?? true, types: raw.push?.types ?? [...ALL_NOTIF_TYPES] },
  } : DEFAULT_NOTIFICATION_PREFS;
  const [prefs, setPrefs] = useState<NotificationPrefs>(initPrefs);

  const setMode = (mode: NotificationMode) => setPrefs((p) => ({ ...p, mode }));

  const setWebEnabled = (enabled: boolean) =>
    setPrefs((p) => ({ ...p, web: { ...p.web, enabled } }));

  const setPushEnabled = (enabled: boolean) =>
    setPrefs((p) => ({ ...p, push: { ...p.push, enabled } }));

  const toggleWebType = (t: NotifType, checked: boolean) =>
    setPrefs((p) => ({
      ...p,
      web: {
        ...p.web,
        types: checked ? [...p.web.types, t] : p.web.types.filter((x) => x !== t),
      },
    }));

  const togglePushType = (t: NotifType, checked: boolean) =>
    setPrefs((p) => ({
      ...p,
      push: {
        ...p.push,
        types: checked ? [...p.push.types, t] : p.push.types.filter((x) => x !== t),
      },
    }));

  const setWebPreset = (preset: NotifType[]) =>
    setPrefs((p) => ({ ...p, web: { ...p.web, types: preset } }));

  const setPushPreset = (preset: NotifType[]) =>
    setPrefs((p) => ({ ...p, push: { ...p.push, types: preset } }));

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name cannot be empty');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = { notification_prefs: prefs };
      if (name.trim() !== user?.name) payload.name = name.trim();
      await profileApi.update(payload as any);
      const meRes = await profileApi.getMe();
      updateUser(meRes.data as User);
      setSuccess(true);
      setTimeout(onClose, 800);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-md ${isDark ? 'bg-surface-900 border-surface-700/50' : 'bg-white border-surface-200'} border rounded-2xl shadow-2xl animate-scale-in flex flex-col max-h-[90vh]`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? 'border-surface-700/50' : 'border-surface-200'} flex-shrink-0`}>
          <h2 className="text-base font-semibold">Edit Profile</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          {/* Name field */}
          <div>
            <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-surface-400' : 'text-surface-500'}`}>
              Display Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className={`w-full px-3 py-2.5 rounded-lg text-sm border outline-none transition-colors
                ${isDark
                  ? 'bg-surface-800 border-surface-700/50 focus:border-brand-500/60 text-surface-100'
                  : 'bg-surface-50 border-surface-200 focus:border-brand-500 text-surface-900'
                }`}
              placeholder="Your name"
            />
          </div>

          {/* Email (read-only) */}
          <div>
            <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-surface-400' : 'text-surface-500'}`}>
              Email
            </label>
            <input
              type="email"
              value={user?.email || ''}
              readOnly
              className={`w-full px-3 py-2.5 rounded-lg text-sm border opacity-60 cursor-not-allowed
                ${isDark
                  ? 'bg-surface-800 border-surface-700/50 text-surface-400'
                  : 'bg-surface-100 border-surface-200 text-surface-500'
                }`}
            />
          </div>

          {/* Role (read-only) */}
          <div>
            <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-surface-400' : 'text-surface-500'}`}>
              Role
            </label>
            <div className={`px-3 py-2.5 rounded-lg text-sm capitalize border opacity-60
              ${isDark
                ? 'bg-surface-800 border-surface-700/50 text-surface-400'
                : 'bg-surface-100 border-surface-200 text-surface-500'
              }`}>
              {user?.role?.name || '—'}
            </div>
          </div>

          {/* ── Notification Preferences ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Bell className="w-4 h-4 text-brand-500" />
              <span className="text-sm font-semibold">Notification Preferences</span>
            </div>

            {/* Mode selector */}
            <div className="space-y-2 mb-4">
              {NOTIF_MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMode(opt.value)}
                  className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition-colors ${
                    prefs.mode === opt.value
                      ? 'border-brand-500/60 bg-brand-500/10'
                      : isDark
                        ? 'border-surface-700/50 bg-surface-800/40 hover:border-surface-600'
                        : 'border-surface-200 bg-surface-50 hover:border-surface-300'
                  }`}
                >
                  <span
                    className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 transition-colors ${
                      prefs.mode === opt.value ? 'border-brand-500 bg-brand-500' : isDark ? 'border-surface-600' : 'border-surface-300'
                    }`}
                  >
                    {prefs.mode === opt.value && (
                      <span className="block h-full w-full rounded-full bg-white scale-[0.45]" />
                    )}
                  </span>
                  <div>
                    <div className="text-sm font-medium leading-none mb-0.5">{opt.label}</div>
                    <div className={`text-xs ${isDark ? 'text-surface-400' : 'text-surface-500'}`}>{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>

            {/* Custom channel settings */}
            {prefs.mode === 'custom' && (
              <div className="space-y-3">
                <ChannelPrefs
                  label="Web"
                  icon={<Monitor className="w-4 h-4 text-surface-400" />}
                  enabled={prefs.web.enabled}
                  types={prefs.web.types}
                  onToggleEnabled={setWebEnabled}
                  onToggleType={toggleWebType}
                  onSetPreset={setWebPreset}
                  isDark={isDark}
                />
                <ChannelPrefs
                  label="Mobile Push"
                  icon={<Smartphone className="w-4 h-4 text-surface-400" />}
                  enabled={prefs.push.enabled}
                  types={prefs.push.types}
                  onToggleEnabled={setPushEnabled}
                  onToggleType={togglePushType}
                  onSetPreset={setPushPreset}
                  isDark={isDark}
                />
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving || success}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {success ? (
              <><Check className="w-4 h-4" /> Saved</>
            ) : saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
