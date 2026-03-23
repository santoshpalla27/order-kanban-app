import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { Eye, EyeOff } from 'lucide-react';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await authApi.register(name, email, password);
      setAuth(res.data.access_token ?? res.data.token, res.data.refresh_token, res.data.user);
      navigate('/');
    } catch (err: any) {
      if (!err.response) {
        setError(err.code === 'ECONNABORTED'
          ? 'Request timed out. Please try again.'
          : 'Unable to connect. Check your internet connection and try again.');
      } else {
        setError(err.response.data?.error || err.response.data?.message || 'Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-950 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <svg viewBox="0 0 100 100" className="w-12 h-12 drop-shadow-sm" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="50" fill="#F0914A" />
              <g stroke="#1e1b4b" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M 16 28 H 25 L 34 62 H 70 L 78 38 H 28" />
                <circle cx="40" cy="75" r="5" fill="none" />
                <circle cx="64" cy="75" r="5" fill="none" />
                <path d="M 38 32 H 68 V 39 H 38 Z" fill="#F0914A" />
                <path d="M 42 39 V 56 H 64 V 39" fill="#F0914A" />
                <path d="M 53 32 V 56" />
                <path d="M 53 32 C 45 18 36 24 44 32" fill="#F0914A" />
                <path d="M 53 32 C 61 18 70 24 62 32" fill="#F0914A" />
              </g>
            </svg>
            <span className="font-extrabold text-[32px] tracking-tighter leading-none text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
              <span className="text-[#F0914A]">Gift</span> Highway
            </span>
          </div>
          <p className="text-surface-400 text-sm">Create your account</p>
        </div>

        <form onSubmit={handleSubmit} className="glass rounded-2xl p-8 space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm animate-fade-in">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              required
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                required
                minLength={6}
                className="w-full !pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-200"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Confirm Password</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                className={`w-full !pr-10 ${confirmPassword && password !== confirmPassword ? 'border-red-500/60 focus:border-red-500' : ''}`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-200"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {confirmPassword && password !== confirmPassword && (
              <p className="text-red-400 text-xs mt-1">Passwords do not match</p>
            )}
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating account...
              </span>
            ) : 'Create Account'}
          </button>

          <p className="text-center text-sm text-surface-400">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
