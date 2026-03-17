import { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { useQuery } from '@tanstack/react-query';
import { notificationsApi } from '../api/client';
import { useChatStore } from '../store/chatStore';
import { useProductBadges } from '../hooks/useProductBadges';
import NotificationPanel from './NotificationPanel';
import ActivityPanel from './ActivityPanel';
import NotificationToast from './NotificationToast';
import ProfileModal from './ProfileModal';
import {
  LayoutDashboard,
  List,
  ClipboardList,
  MessageSquare,
  Users,
  Bell,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Sun,
  Moon,
  Activity,
  UserCircle,
  Trash2,
} from 'lucide-react';

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

function UserAvatar({ user, size = 'sm' }: { user: { name: string; avatar_url?: string }; size?: 'sm' | 'md' }) {
  const [imgError, setImgError] = useState(false);
  const gradient = getAvatarGradient(user.name);
  const initial = user.name.charAt(0).toUpperCase();
  const sizeClass = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-8 h-8 text-sm';

  if (user.avatar_url && !imgError) {
    return (
      <img
        src={user.avatar_url}
        alt={user.name}
        className={`${sizeClass} rounded-full object-cover flex-shrink-0`}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div className={`${sizeClass} rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center font-bold text-white flex-shrink-0`}>
      {initial}
    </div>
  );
}

export default function Layout() {
  const { user, logout, isAdmin, canAccessTrash } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notifOpen, setNotifOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const navigate = useNavigate();
  const activityRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const isDark = theme === 'dark';

  useWebSocket();

  const { data: unreadData } = useQuery({
    queryKey: ['unread-count'],
    queryFn: () => notificationsApi.getUnreadCount(),
    refetchInterval: 30000,
  });
  const unreadCount = unreadData?.data?.count || 0;
  const unreadChatCount = useChatStore((s) => s.unreadCount);
  const { totalProducts: unreadProductCount } = useProductBadges();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (activityRef.current && !activityRef.current.contains(e.target as Node)) setActivityOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Kanban Board' },
    { to: '/list', icon: List, label: 'List View' },
    { to: '/my-orders', icon: ClipboardList, label: 'My Orders' },
    { to: '/chat', icon: MessageSquare, label: 'Team Chat' },
    ...(isAdmin() ? [{ to: '/admin', icon: Users, label: 'Admin Panel' }] : []),
    ...(canAccessTrash() ? [{ to: '/trash', icon: Trash2, label: 'Trash' }] : []),
  ];

  return (
    <div className={`min-h-screen flex ${isDark ? 'bg-surface-950' : 'bg-surface-100'}`}>
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-0 lg:w-20'
        } ${isDark ? 'bg-surface-900 border-surface-700/50' : 'bg-white border-surface-200'} border-r transition-all duration-300 flex flex-col overflow-hidden flex-shrink-0`}
      >
        {/* Logo */}
        <div className={`h-16 flex items-center px-5 border-b ${isDark ? 'border-surface-700/50' : 'border-surface-200'}`}>
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center flex-shrink-0">
              <LayoutDashboard className="w-4 h-4 text-white" />
            </div>
            {sidebarOpen && <span className="font-bold text-lg whitespace-nowrap">KanbanFlow</span>}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const isChat = item.to === '/chat';
            const isProductView = ['/', '/list', '/my-orders'].includes(item.to);
            const showChatBadge = isChat && unreadChatCount > 0;
            const showProductBadge = isProductView && unreadProductCount > 0;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? isDark
                        ? 'bg-brand-600/20 text-brand-400'
                        : 'bg-brand-100 text-brand-700'
                      : isDark
                      ? 'text-surface-400 hover:text-surface-200 hover:bg-surface-800'
                      : 'text-surface-500 hover:text-surface-800 hover:bg-surface-100'
                  }`
                }
              >
                <div className="relative flex-shrink-0">
                  <item.icon className="w-5 h-5" />
                  {(showChatBadge || showProductBadge) && !sidebarOpen && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
                  )}
                </div>
                {sidebarOpen && (
                  <span className="flex-1 whitespace-nowrap flex items-center justify-between">
                    {item.label}
                    {showChatBadge && (
                      <span className="ml-auto min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-scale-in">
                        {unreadChatCount > 9 ? '9+' : unreadChatCount}
                      </span>
                    )}
                    {showProductBadge && (
                      <span className="ml-auto min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-scale-in">
                        {unreadProductCount > 9 ? '9+' : unreadProductCount}
                      </span>
                    )}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* User info at bottom */}
        {sidebarOpen && user && (
          <div className={`p-3 border-t ${isDark ? 'border-surface-700/50' : 'border-surface-200'}`}>
            <button
              onClick={() => { setProfileModalOpen(true); }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${isDark ? 'hover:bg-surface-800' : 'hover:bg-surface-100'}`}
            >
              <UserAvatar user={user} size="md" />
              <div className="overflow-hidden text-left">
                <p className="text-sm font-medium truncate">{user.name}</p>
                <p className={`text-xs capitalize ${isDark ? 'text-surface-500' : 'text-surface-400'}`}>{user.role?.name}</p>
              </div>
            </button>
          </div>
        )}
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className={`h-16 backdrop-blur-md border-b flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30 ${
          isDark ? 'bg-surface-900/80 border-surface-700/50' : 'bg-white/80 border-surface-200'
        }`}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="btn-ghost p-2 rounded-lg"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="flex items-center gap-2">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className={`relative flex items-center justify-between w-14 h-7 p-1 rounded-full transition-colors duration-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 ${
                isDark ? 'bg-surface-800 border-surface-700 inner-shadow-dark' : 'bg-surface-200 border-surface-300 inner-shadow-light'
              } border`}
              title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
            >
              <div className={`z-10 flex items-center justify-center w-5 h-5 theme-switch-icon ${!isDark ? 'text-amber-500 scale-100' : 'text-surface-500 scale-75'}`}>
                <Sun className="w-3.5 h-3.5" />
              </div>
              <div className={`z-10 flex items-center justify-center w-5 h-5 theme-switch-icon ${isDark ? 'text-brand-400 scale-100' : 'text-surface-400 scale-75'}`}>
                <Moon className="w-3.5 h-3.5" />
              </div>
              <div
                className={`absolute left-1 w-5 h-5 rounded-full shadow-sm theme-switch-thumb ${
                  isDark ? 'translate-x-7 bg-surface-700' : 'translate-x-0 bg-white'
                }`}
              />
            </button>

            {/* Activity */}
            <div ref={activityRef} className="relative">
              <button
                onClick={() => { setActivityOpen(!activityOpen); setNotifOpen(false); }}
                className="btn-ghost p-2 rounded-lg"
                title="Activity log"
              >
                <Activity className="w-5 h-5" />
              </button>
              {activityOpen && <ActivityPanel onClose={() => setActivityOpen(false)} />}
            </div>

            {/* Notifications */}
            <div ref={notifRef} className="relative">
              <button
                onClick={() => { setNotifOpen(!notifOpen); setActivityOpen(false); }}
                className="btn-ghost p-2 rounded-lg relative"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-scale-in">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {notifOpen && <NotificationPanel onClose={() => setNotifOpen(false)} />}
            </div>

            {/* Profile dropdown */}
            <div ref={profileRef} className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 btn-ghost px-2 py-1.5 rounded-lg"
              >
                {user && <UserAvatar user={user} size="sm" />}
                <ChevronDown className="w-4 h-4" />
              </button>

              {profileOpen && (
                <div className={`absolute right-0 top-full mt-2 w-52 ${isDark ? 'bg-surface-800 border-surface-700/50' : 'bg-white border-surface-200'} border rounded-xl py-2 animate-scale-in z-50 shadow-xl`}>
                  {/* User info */}
                  <div className={`px-4 py-3 border-b ${isDark ? 'border-surface-700/50' : 'border-surface-200'}`}>
                    <div className="flex items-center gap-3">
                      {user && <UserAvatar user={user} size="md" />}
                      <div className="overflow-hidden">
                        <p className="text-sm font-medium truncate">{user?.name}</p>
                        <p className={`text-xs truncate ${isDark ? 'text-surface-500' : 'text-surface-400'}`}>{user?.email}</p>
                      </div>
                    </div>
                  </div>

                  {/* Edit Profile */}
                  <button
                    onClick={() => { setProfileOpen(false); setProfileModalOpen(true); }}
                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                      isDark ? 'text-surface-300 hover:bg-surface-700/50' : 'text-surface-700 hover:bg-surface-100'
                    }`}
                  >
                    <UserCircle className="w-4 h-4" /> Edit Profile
                  </button>

                  {/* Sign Out */}
                  <button
                    onClick={handleLogout}
                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-400 transition-colors ${
                      isDark ? 'hover:bg-surface-700/50' : 'hover:bg-surface-100'
                    }`}
                  >
                    <LogOut className="w-4 h-4" /> Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      <NotificationToast />
      {profileModalOpen && <ProfileModal onClose={() => setProfileModalOpen(false)} />}
    </div>
  );
}
