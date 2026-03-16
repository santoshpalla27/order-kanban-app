import { useState } from 'react';
import { Search, Filter, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { usersApi } from '../api/client';
import { ProductStatus, STATUS_LABELS, STATUS_ORDER } from '../types';
import { User } from '../types';

export interface BaseFilters {
  search: string;
  status: string;
  created_by: string;
  date_from: string;
  date_to: string;
}

interface Props<T extends BaseFilters> {
  filters: T;
  onChange: (filters: T) => void;
}

export default function SearchFilters<T extends BaseFilters>({ filters, onChange }: Props<T>) {
  const [showFilters, setShowFilters] = useState(false);

  const { data: usersData } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => usersApi.getList(),
  });
  const users: User[] = usersData?.data || [];

  const hasActiveFilters = [
    filters.status,
    filters.created_by,
    filters.date_from,
    filters.date_to
  ].some(v => v !== '' && v !== 'all');

  const clearFilters = () => {
    onChange({ ...filters, search: '', status: '', created_by: '', date_from: '', date_to: '' } as T);
    setShowFilters(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
          <input
            type="text"
            placeholder="Search by ID, customer, phone or description…"
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            className="w-full !pl-10"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`btn-secondary flex items-center gap-2 ${hasActiveFilters ? 'ring-2 ring-brand-500/50' : ''}`}
        >
          <Filter className="w-4 h-4" />
          Filters
          {hasActiveFilters && (
            <span className="w-2 h-2 bg-brand-500 rounded-full" />
          )}
        </button>
        {hasActiveFilters && (
          <button onClick={clearFilters} className="btn-ghost text-sm flex items-center gap-1">
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {showFilters && (
        <div className="glass rounded-xl p-4 flex flex-wrap gap-4 animate-fade-in">
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-medium text-surface-400 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => onChange({ ...filters, status: e.target.value })}
              className="w-full"
            >
              <option value="">All Statuses</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-medium text-surface-400 mb-1">Created By</label>
            <select
              value={filters.created_by}
              onChange={(e) => onChange({ ...filters, created_by: e.target.value })}
              className="w-full"
            >
              <option value="">All Users</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-medium text-surface-400 mb-1">From Date</label>
            <input
              type="date"
              value={filters.date_from}
              onChange={(e) => onChange({ ...filters, date_from: e.target.value })}
              className="w-full"
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-medium text-surface-400 mb-1">To Date</label>
            <input
              type="date"
              value={filters.date_to}
              onChange={(e) => onChange({ ...filters, date_to: e.target.value })}
              className="w-full"
            />
          </div>
        </div>
      )}
    </div>
  );
}
