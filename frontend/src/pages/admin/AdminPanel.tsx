import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../../api/client';
import { User } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { Users, UserPlus, Trash2, Shield, X } from 'lucide-react';

const ROLES = [
  { id: 1, name: 'admin', label: 'Admin', color: 'text-red-400 bg-red-500/10' },
  { id: 2, name: 'manager', label: 'Manager', color: 'text-amber-400 bg-amber-500/10' },
  { id: 3, name: 'worker', label: 'Worker', color: 'text-blue-400 bg-blue-500/10' },
];

export default function AdminPanel() {
  const [showCreate, setShowCreate] = useState(false);
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
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
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <UserPlus className="w-4 h-4" /> Add User
        </button>
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
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {u.id !== currentUser?.id ? (
                        <button
                          onClick={() => {
                            if (confirm(`Delete user ${u.name}?`)) deleteMutation.mutate(u.id);
                          }}
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

      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState(3);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
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
