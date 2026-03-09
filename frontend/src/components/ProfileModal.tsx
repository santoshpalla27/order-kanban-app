import { useState, useRef } from 'react';
import { X, Camera, Loader2, Check } from 'lucide-react';
import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { profileApi } from '../api/client';
import { User } from '../types';

interface Props {
  onClose: () => void;
}

const AVATAR_COLORS = [
  'from-violet-500 to-purple-500',
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
  'from-fuchsia-500 to-purple-500',
];

function getAvatarGradient(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function ProfileModal({ onClose }: Props) {
  const { user, updateUser } = useAuthStore();
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';

  const [name, setName] = useState(user?.name || '');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatar_url || null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initials = name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  const gradient = getAvatarGradient(user?.name || '');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name cannot be empty');
      return;
    }
    setSaving(true);
    setError('');
    try {
      let avatarKey: string | undefined;

      // Upload avatar if a new file was picked
      if (pendingFile) {
        const presignRes = await profileApi.getAvatarUploadUrl(pendingFile.name);
        const { upload_url, s3_key, content_type } = presignRes.data;

        await axios.put(upload_url, pendingFile, {
          headers: { 'Content-Type': content_type },
          onUploadProgress: (e) => {
            if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100));
          },
        });
        avatarKey = s3_key;
      }

      const updateData: { name?: string; avatar_key?: string } = {};
      if (name.trim() !== user?.name) updateData.name = name.trim();
      if (avatarKey) updateData.avatar_key = avatarKey;

      const res = await profileApi.update(updateData);
      updateUser(res.data as User);

      setSuccess(true);
      setTimeout(onClose, 800);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save profile');
    } finally {
      setSaving(false);
      setUploadProgress(0);
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
          {/* Avatar upload */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative group">
              <div className="w-20 h-20 rounded-full overflow-hidden ring-2 ring-brand-500/30">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                    onError={() => setAvatarPreview(null)}
                  />
                ) : (
                  <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-xl font-bold`}>
                    {initials}
                  </div>
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                <Camera className="w-5 h-5 text-white" />
              </button>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`text-xs ${isDark ? 'text-brand-400 hover:text-brand-300' : 'text-brand-600 hover:text-brand-700'} transition-colors`}
            >
              Change photo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.gif,.webp"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Upload progress */}
          {saving && uploadProgress > 0 && uploadProgress < 100 && (
            <div className={`w-full h-1.5 rounded-full ${isDark ? 'bg-surface-700' : 'bg-surface-200'}`}>
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}

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
