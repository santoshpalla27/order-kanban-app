import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { authApi } from '../../api/client';

export default function PendingPage() {
  const { token, user, updateUser, logout } = useAuthStore();
  const navigate = useNavigate();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Redirect away if not logged in or already approved
  useEffect(() => {
    if (!token) { navigate('/login', { replace: true }); return; }
    if (user?.role?.name && user.role.name !== 'pending') { navigate('/', { replace: true }); return; }
  }, [token, user]);

  // Poll /auth/me every 5 s — when approved, rotate the JWT (old token still carries
  // the "pending" role claim) then update the store and redirect.
  useEffect(() => {
    if (!token) return;
    intervalRef.current = setInterval(async () => {
      try {
        const res = await authApi.getMe();
        const fresh = res.data?.user ?? res.data;
        if (fresh?.role?.name && fresh.role.name !== 'pending') {
          // Refresh token pair so the new role is encoded in the JWT
          await authApi.refreshTokens();
          updateUser(fresh);
          navigate('/', { replace: true });
        }
      } catch {
        // server unreachable or refresh failed — keep waiting
      }
    }, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [token]);

  const handleLogout = async () => {
    const { refreshToken } = useAuthStore.getState();
    try { await authApi.logout(refreshToken ?? undefined); } catch {}
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="glass rounded-2xl p-8 text-center space-y-6 border border-surface-700/50">
          {/* Animated clock icon */}
          <div className="flex justify-center">
            <div className="relative w-20 h-20">
              <div className="w-20 h-20 rounded-full border-4 border-brand-500/30 border-t-brand-500 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-8 h-8 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Heading */}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white">Awaiting Approval</h1>
            <p className="text-surface-400 text-sm leading-relaxed">
              Your account has been created successfully. An administrator needs to
              approve your access before you can use the app.
            </p>
          </div>

          {/* User info */}
          {user && (
            <div className="bg-surface-800/60 rounded-xl px-4 py-3 border border-surface-700/40 text-left space-y-1">
              <p className="text-xs text-surface-500 uppercase tracking-wider font-medium">Signed in as</p>
              <p className="text-sm font-semibold text-white">{user.name}</p>
              <p className="text-xs text-surface-400">{user.email}</p>
            </div>
          )}

          {/* Status */}
          <div className="flex items-center justify-center gap-2 text-xs text-surface-500">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
            Checking for approval every 5 seconds…
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="w-full btn-secondary text-sm py-2.5"
          >
            Sign out
          </button>
        </div>

        {/* Footer hint */}
        <p className="text-center text-xs text-surface-600 mt-4">
          Once approved you will be redirected automatically.
        </p>
      </div>
    </div>
  );
}
