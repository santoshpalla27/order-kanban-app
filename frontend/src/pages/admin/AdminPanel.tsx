import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../../api/client';
import { formatDate } from '../../utils/date';
import { User } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { Users, UserPlus, Trash2, Shield, X, AlertTriangle, Check } from 'lucide-react';

const ROLES = [
  { id: 1, name: 'admin', label: 'Admin', color: 'text-red-400 bg-red-500/10' },
  { id: 2, name: 'manager', label: 'Manager', color: 'text-amber-400 bg-amber-500/10' },
  { id: 3, name: 'organiser', label: 'Organiser', color: 'text-violet-400 bg-violet-500/10' },
  { id: 4, name: 'employee', label: 'Employee', color: 'text-blue-400 bg-blue-500/10' },
  { id: 5, name: 'view_only', label: 'View Only', color: 'text-surface-400 bg-surface-500/10' },
];

function ConfirmDeleteModal({ userName, onConfirm, onCancel, isPending }: {
  userName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onCancel}>
      <div className="w-full max-w-sm glass rounded-2xl animate-scale-in shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-full bg-red-500/15 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold mb-1">Delete User</h2>
            <p className="text-sm text-surface-400">
              Are you sure you want to delete <span className="font-semibold text-surface-200">{userName}</span>? This action cannot be undone.
            </p>
          </div>
          <div className="flex gap-3 w-full pt-1">
            <button
              onClick={onCancel}
              className="btn-secondary flex-1"
              disabled={isPending}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isPending}
              className="flex-1 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              {isPending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminPanel() {
  const [showCreate, setShowCreate] = useState(false);
  const [showCapabilities, setShowCapabilities] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.getAll(),
  });
  const users: User[] = data?.data || [];

  const roleMutation = useMutation({
    mutationFn: ({ id, roleId }: { id: number; roleId: number }) => usersApi.updateRole(id, roleId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => usersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDeleteTarget(null);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-purple-500 flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Admin Panel</h1>
            <p className="text-sm text-surface-500">Manage users and roles</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowCapabilities(true)} className="btn-secondary flex items-center gap-2">
            <Shield className="w-4 h-4" /> User Capabilities
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Add User
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-700/50">
                <th className="text-left text-xs font-medium text-surface-400 uppercase tracking-wider px-6 py-4">User</th>
                <th className="text-left text-xs font-medium text-surface-400 uppercase tracking-wider px-6 py-4">Email</th>
                <th className="text-left text-xs font-medium text-surface-400 uppercase tracking-wider px-6 py-4">Role</th>
                <th className="text-left text-xs font-medium text-surface-400 uppercase tracking-wider px-6 py-4">Joined</th>
                <th className="text-right text-xs font-medium text-surface-400 uppercase tracking-wider px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const roleStyle = ROLES.find((r) => r.id === u.role_id);
                return (
                  <tr key={u.id} className="border-b border-surface-700/20 hover:bg-surface-700/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-purple-500 flex items-center justify-center text-sm font-bold text-white">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-sm">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-surface-400">{u.email}</td>
                    <td className="px-6 py-4">
                      <select
                        value={u.role_id}
                        onChange={(e) => roleMutation.mutate({ id: u.id, roleId: Number(e.target.value) })}
                        disabled={u.id === currentUser?.id}
                        className={`text-xs px-3 py-1.5 rounded-full ${roleStyle?.color || ''} border-0`}
                      >
                        {ROLES.map((r) => (
                          <option key={r.id} value={r.id}>{r.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-4 text-sm text-surface-500">
                      {formatDate(u.created_at)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {u.id !== currentUser?.id ? (
                        <button
                          onClick={() => setDeleteTarget(u)}
                          className="btn-ghost p-2 rounded-lg text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : (
                        <span className="text-xs text-surface-600">You</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCapabilities && <UserCapabilitiesModal onClose={() => setShowCapabilities(false)} />}
      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} />}

      {deleteTarget && (
        <ConfirmDeleteModal
          userName={deleteTarget.name}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState(4);
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: any) => usersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Failed to create user'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({ name, email, password, role_id: roleId });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md glass rounded-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-surface-700/50">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-brand-400" /> Add User
          </h2>
          <button onClick={onClose} className="btn-ghost p-2 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Email *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Password *</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Role</label>
            <select value={roleId} onChange={(e) => setRoleId(Number(e.target.value))} className="w-full">
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary flex-1">
              {mutation.isPending ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function UserCapabilitiesModal({ onClose }: { onClose: () => void }) {
  const CAPABILITIES = [
    { name: 'Manage Users & Roles (Add/Delete/Change Role)', roles: [1] },
    { name: 'Delete Orders Permanently', roles: [1, 2] },
    { name: 'View Admin Analytics Dashboard', roles: [1, 2] },
    { name: 'Manage System Products & Configurations', roles: [1, 2, 3] },
    { name: 'Create New Orders & Edit Order Details', roles: [1, 2, 3, 4] },
    { name: 'Update Order Status (Move Kanban Cards)', roles: [1, 2, 3, 4] },
    { name: 'Participate in Team Chat Channels', roles: [1, 2, 3, 4, 5] },
    { name: 'View All Live Orders & Kanban Board', roles: [1, 2, 3, 4, 5] },
  ];

  /* 1 = admin, 2 = manager, 3 = organiser, 4 = employee, 5 = view_only */
  const ROLES = [
    { id: 1, name: 'admin', label: 'Admin', color: 'text-red-400 bg-red-500/10' },
    { id: 2, name: 'manager', label: 'Manager', color: 'text-amber-400 bg-amber-500/10' },
    { id: 3, name: 'organiser', label: 'Organiser', color: 'text-violet-400 bg-violet-500/10' },
    { id: 4, name: 'employee', label: 'Employee', color: 'text-blue-400 bg-blue-500/10' },
    { id: 5, name: 'view_only', label: 'View Only', color: 'text-surface-400 bg-surface-500/10' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-4xl glass rounded-2xl animate-scale-in flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-surface-700/50">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-400"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"></path></svg>
            User Capabilities
          </h2>
          <button onClick={onClose} className="btn-ghost p-2 rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        
        <div className="overflow-auto p-5">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-surface-800/50 text-surface-300">
              <tr>
                <th className="px-4 py-3 font-semibold rounded-tl-lg border-b border-surface-700/50 text-surface-100">Capability</th>
                {ROLES.map(r => <th key={r.id} className="px-4 py-3 font-semibold text-center border-b border-surface-700/50">{r.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((cap, i) => (
                <tr key={i} className="border-b border-surface-700/30 hover:bg-surface-700/20 transition-colors">
                  <td className="px-4 py-4 font-medium text-surface-200">{cap.name}</td>
                  {ROLES.map(r => (
                    <td key={r.id} className="px-4 py-4 text-center border-l border-surface-700/20">
                      {cap.roles.includes(r.id) ? (
                        <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                      ) : (
                        <div className="w-6 h-6 flex items-center justify-center mx-auto text-surface-600 opacity-50">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <div className="p-5 border-t border-surface-700/50 flex justify-end">
          <button onClick={onClose} className="btn-secondary">Close</button>
        </div>
      </div>
    </div>
  );
}
