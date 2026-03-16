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
  assigned_to?: string;
  delivery_before?: string;
}

interface Props<T extends BaseFilters> {
  filters: T;
  onChange: (filters: T) => void;
  showAssigneeFilter?: boolean;
  showDeliveryFilter?: boolean;
}

type DeliveryPreset = 'due' | 'today' | 'tomorrow' | '3days' | '6days' | 'custom' | '';

function toDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function presetToDate(preset: DeliveryPreset): string {
  if (!preset || preset === 'custom') return '';
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (preset === 'due') {
    d.setDate(d.getDate() - 1); // yesterday — delivery_at <= yesterday means overdue
  } else if (preset === 'today') {
    // delivery_at <= today
  } else if (preset === 'tomorrow') {
    d.setDate(d.getDate() + 1);
  } else if (preset === '3days') {
    d.setDate(d.getDate() + 3);
  } else if (preset === '6days') {
    d.setDate(d.getDate() + 6);
  }
  return toDateStr(d);
}

export default function SearchFilters<T extends BaseFilters>({ filters, onChange, showAssigneeFilter, showDeliveryFilter }: Props<T>) {
  const [showFilters, setShowFilters] = useState(false);
  const [deliveryPreset, setDeliveryPreset] = useState<DeliveryPreset>('');

  const { data: usersData } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => usersApi.getList(),
  });
  const users: User[] = usersData?.data || [];

  const hasActiveFilters = [
    filters.status,
    filters.created_by,
    filters.date_from,
    filters.date_to,
    showAssigneeFilter ? filters.assigned_to : '',
    showDeliveryFilter ? filters.delivery_before : '',
  ].some(v => v !== '' && v !== 'all');

  const clearFilters = () => {
    setDeliveryPreset('');
    onChange({
      ...filters,
      search: '',
      status: '',
      created_by: '',
      date_from: '',
      date_to: '',
      ...(showAssigneeFilter ? { assigned_to: '' } : {}),
      ...(showDeliveryFilter ? { delivery_before: '' } : {}),
    } as T);
    setShowFilters(false);
  };

  const handleDeliveryPreset = (preset: DeliveryPreset) => {
    setDeliveryPreset(preset);
    if (preset !== 'custom') {
      onChange({ ...filters, delivery_before: presetToDate(preset) } as T);
    }
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
          {showAssigneeFilter && (
            <div className="flex-1 min-w-[150px]">
              <label className="block text-xs font-medium text-surface-400 mb-1">Assignee</label>
              <select
                value={filters.assigned_to ?? ''}
                onChange={(e) => onChange({ ...filters, assigned_to: e.target.value })}
                className="w-full"
              >
                <option value="">All Assignees</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          )}
          {showDeliveryFilter && (
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-surface-400 mb-1">Delivery Due</label>
              <div className="flex flex-wrap gap-1 mb-2">
                {([
                  { value: 'due',      label: 'Overdue'   },
                  { value: 'today',    label: 'Today'     },
                  { value: 'tomorrow', label: 'Tomorrow'  },
                  { value: '3days',    label: '3 Days'    },
                  { value: '6days',    label: '6 Days'    },
                  { value: 'custom',   label: 'Custom'    },
                ] as { value: DeliveryPreset; label: string }[]).map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleDeliveryPreset(deliveryPreset === value ? '' : value)}
                    className={`px-2 py-1 rounded-md text-xs font-medium border transition-colors ${
                      deliveryPreset === value
                        ? 'bg-brand-500/20 text-brand-400 border-brand-500/40'
                        : 'text-surface-400 border-surface-700/50 hover:text-surface-200 hover:border-surface-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {deliveryPreset === 'custom' && (
                <input
                  type="date"
                  value={filters.delivery_before ?? ''}
                  onChange={(e) => onChange({ ...filters, delivery_before: e.target.value } as T)}
                  className="w-full"
                />
              )}
            </div>
          )}
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
