import { useState } from 'react';
import { X, Loader2, Check, Bell } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { profileApi } from '../api/client';
import {
  User,
  NotificationPrefs,
  NotifType,
  ALL_NOTIF_TYPES,
  MY_ORDERS_NOTIF_TYPES,
} from '../types';

interface Props {
  onClose: () => void;
}

const NOTIF_TYPE_LABELS: Record<NotifType, string> = {
  status_change:     'Status & Movements',
  comment:           'Comments',
  mention:           'Mentions',
  attachment:        'Files & Attachments',
  chat:              'Team Chat',
  product_created:   'New Orders',
  product_deleted:   'Deleted Orders',
};

function TypeGrid({
  title,
  subtitle,
  types,
  selected,
  onChange,
  isDark,
}: {
  title: string;
  subtitle: string;
  types: readonly NotifType[];
  selected: NotifType[];
  onChange: (t: NotifType, checked: boolean) => void;
  isDark: boolean;
}) {
  const safeSelected = selected ?? [];
  return (
    <div className={`rounded-xl border p-4 space-y-3 ${isDark ? 'border-surface-700/50 bg-surface-800/40' : 'border-surface-200 bg-surface-50'}`}>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className={`text-xs mt-0.5 ${isDark ? 'text-surface-400' : 'text-surface-500'}`}>{subtitle}</p>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {types.map((t) => {
          const locked  = t === 'mention';
          const checked = locked || safeSelected.includes(t);
          return (
            <label
              key={t}
              className={`flex items-center gap-2 text-xs select-none ${
                locked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
              } ${isDark ? 'text-surface-300' : 'text-surface-700'}`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={locked}
                onChange={(e) => !locked && onChange(t, e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-brand-600 flex-shrink-0"
              />
              {NOTIF_TYPE_LABELS[t]}
              {locked && <span className="text-brand-500 text-[10px] ml-0.5">always on</span>}
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default function ProfileModal({ onClose }: Props) {
  const { user, updateUser } = useAuthStore();
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';

  const [name, setName]       = useState(user?.name || '');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState(false);

  const raw = user?.notification_prefs;
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    custom_my_types:  raw?.custom_my_types  ?? [...MY_ORDERS_NOTIF_TYPES],
    custom_all_types: raw?.custom_all_types ?? [...ALL_NOTIF_TYPES],
  });

  const toggleMyType = (t: NotifType, checked: boolean) =>
    setPrefs((p) => ({
      ...p,
      custom_my_types: checked
        ? [...p.custom_my_types, t]
        : p.custom_my_types.filter((x) => x !== t),
    }));

  const toggleAllType = (t: NotifType, checked: boolean) =>
    setPrefs((p) => ({
      ...p,
      custom_all_types: checked
        ? [...p.custom_all_types, t]
        : p.custom_all_types.filter((x) => x !== t),
    }));

  const handleSave = async () => {
    if (!name.trim()) { setError('Name cannot be empty'); return; }
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

          {/* Name */}
          <div>
            <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-surface-400' : 'text-surface-500'}`}>
              Display Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className={`w-full px-3 py-2.5 rounded-lg text-sm border outline-none transition-colors ${
                isDark
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
              className={`w-full px-3 py-2.5 rounded-lg text-sm border opacity-60 cursor-not-allowed ${
                isDark
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
            <div className={`px-3 py-2.5 rounded-lg text-sm capitalize border opacity-60 ${
              isDark
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

            <div className="space-y-3">
              <TypeGrid
                title="My Orders"
                subtitle="Notifications for orders assigned to me"
                types={MY_ORDERS_NOTIF_TYPES}
                selected={prefs.custom_my_types}
                onChange={toggleMyType}
                isDark={isDark}
              />
              <TypeGrid
                title="All Other Orders"
                subtitle="Notifications for orders not assigned to me (+ Team Chat)"
                types={ALL_NOTIF_TYPES}
                selected={prefs.custom_all_types}
                onChange={toggleAllType}
                isDark={isDark}
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* Save */}
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
