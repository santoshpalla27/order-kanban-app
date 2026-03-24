import { useState } from 'react';
import { X, Loader2, Check } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { profileApi } from '../api/client';
import { User } from '../types';

interface Props {
  onClose: () => void;
}

export default function ProfileModal({ onClose }: Props) {
  const { user, updateUser } = useAuthStore();
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';

  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name cannot be empty');
      return;
    }
    if (name.trim() === user?.name) {
      onClose();
      return;
    }
    setSaving(true);
    setError('');
    try {
      await profileApi.update({ name: name.trim() });
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
        className={`w-full max-w-sm ${isDark ? 'bg-surface-900 border-surface-700/50' : 'bg-white border-surface-200'} border rounded-2xl shadow-2xl animate-scale-in`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? 'border-surface-700/50' : 'border-surface-200'}`}>
          <h2 className="text-base font-semibold">Edit Profile</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
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
