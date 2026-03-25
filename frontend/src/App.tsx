import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/authStore';
import { authApi } from './api/client';
import Layout from './components/Layout';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import KanbanBoard from './pages/kanban/KanbanBoard';
import ErrorBoundary from './components/ErrorBoundary';

// Lazy-load non-critical routes — each becomes a separate JS chunk
const ListView = lazy(() => import('./pages/boards/ListView'));
const MyOrdersPage = lazy(() => import('./pages/boards/MyOrdersPage'));
const ChatPage = lazy(() => import('./pages/chat/ChatPage'));
const AdminPanel = lazy(() => import('./pages/admin/AdminPanel'));
const TrashPage = lazy(() => import('./pages/boards/TrashPage'));
const ActivityPage = lazy(() => import('./pages/activity/ActivityPage'));
const NotificationsPage = lazy(() => import('./pages/notifications/NotificationsPage'));
const StatsPage = lazy(() => import('./pages/stats/StatsPage'));
const PurgeStatusPage = lazy(() => import('./pages/purge/PurgeStatusPage'));

const PageLoader = () => (
  <div className="flex justify-center items-center py-20">
    <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
  </div>
);

// Wraps each lazy route with Suspense + its own ErrorBoundary so one
// page crashing doesn't take down the whole app
function LazyRoute({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PageLoader />}>
      <ErrorBoundary>{children}</ErrorBoundary>
    </Suspense>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 10000,
    },
  },
});

function ProtectedRoute({ children, adminOnly = false, trashOnly = false, statsOnly = false }: { children: React.ReactNode; adminOnly?: boolean; trashOnly?: boolean; statsOnly?: boolean }) {
  const { token, isAdmin, canAccessTrash, canViewStats } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin()) return <Navigate to="/" replace />;
  if (trashOnly && !canAccessTrash()) return <Navigate to="/" replace />;
  if (statsOnly && !canViewStats()) return <Navigate to="/" replace />;
  return <>{children}</>;
}


// Validates the persisted token against the backend on startup.
// If invalid (new DB, expired, etc.) clears auth so the user lands on /login.
function AuthValidator({ children }: { children: React.ReactNode }) {
  const { token, logout } = useAuthStore();
  const [checked, setChecked] = useState(!token); // skip check if no token

  useEffect(() => {
    if (!token) return;
    authApi.getMe()
      .catch(() => logout())
      .finally(() => setChecked(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!checked) return null; // blank screen for the brief validation round-trip
  return <>{children}</>;
}

export default function App() {
  return (
    // Root ErrorBoundary catches crashes outside individual route boundaries
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthValidator>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              {/* KanbanBoard is the landing page — keep it eager */}
              <Route path="/" element={<KanbanBoard />} />
              <Route path="/list" element={<LazyRoute><ListView /></LazyRoute>} />
              <Route path="/my-orders" element={<LazyRoute><MyOrdersPage /></LazyRoute>} />
              <Route path="/chat" element={<LazyRoute><ChatPage /></LazyRoute>} />
              <Route path="/activity" element={<LazyRoute><ActivityPage /></LazyRoute>} />
              <Route path="/notifications" element={<LazyRoute><NotificationsPage /></LazyRoute>} />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute adminOnly>
                    <LazyRoute><AdminPanel /></LazyRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/trash"
                element={
                  <ProtectedRoute trashOnly>
                    <LazyRoute><TrashPage /></LazyRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/stats"
                element={
                  <ProtectedRoute statsOnly>
                    <LazyRoute><StatsPage /></LazyRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/purge-status"
                element={
                  <ProtectedRoute adminOnly>
                    <LazyRoute><PurgeStatusPage /></LazyRoute>
                  </ProtectedRoute>
                }
              />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </AuthValidator>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
