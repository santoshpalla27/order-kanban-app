import { useState } from 'react';
import { Search, Filter, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { usersApi } from '../api/client';
import { STATUS_LABELS, STATUS_ORDER } from '../types';
import { User } from '../types';

export interface BaseFilters {
  search: string;
  status: string;
  created_by: string;
  date_from: string;
  date_to: string;
  assigned_to?: string;
  delivery_from?: string;
  delivery_to?: string;
}

interface Props<T extends BaseFilters> {
  filters: T;
  onChange: (filters: T) => void;
  showAssigneeFilter?: boolean;
  showDeliveryFilter?: boolean;
}

type DeliveryPreset = 'due' | 'today' | 'tomorrow' | '3days' | '6days' | 'custom' | '';

// Returns UTC ISO string for the start of a local day (offset in days from today)
function dayStartUTC(daysOffset: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString();
}

// Returns exclusive-upper-bound UTC ISO ranges for each preset
function presetToRange(preset: DeliveryPreset): { from: string; to: string } {
  if (preset === 'due')      return { from: '',             to: dayStartUTC(0) };  // before local today
  if (preset === 'today')    return { from: dayStartUTC(0), to: dayStartUTC(1) };  // local today only
  if (preset === 'tomorrow') return { from: dayStartUTC(0), to: dayStartUTC(2) };  // today + tomorrow
  if (preset === '3days')    return { from: dayStartUTC(0), to: dayStartUTC(4) };
  if (preset === '6days')    return { from: dayStartUTC(0), to: dayStartUTC(7) };
  return { from: '', to: '' };
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
    showDeliveryFilter ? filters.delivery_from : '',
    showDeliveryFilter ? filters.delivery_to : '',
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
      ...(showDeliveryFilter ? { delivery_from: '', delivery_to: '' } : {}),
    } as T);
    setShowFilters(false);
  };

  const handleDeliveryPreset = (preset: DeliveryPreset) => {
    setDeliveryPreset(preset);
    if (preset !== 'custom') {
      const { from, to } = presetToRange(preset);
      onChange({ ...filters, delivery_from: from, delivery_to: to } as T);
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
                  { value: 'due',      label: 'Overdue'  },
                  { value: 'today',    label: 'Today'    },
                  { value: 'tomorrow', label: 'Tomorrow' },
                  { value: '3days',    label: '3 Days'   },
                  { value: '6days',    label: '6 Days'   },
                  { value: 'custom',   label: 'Custom'   },
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
                <div className="flex gap-2">
                  <input
                    type="date"
                    onChange={(e) => {
                      if (!e.target.value) { onChange({ ...filters, delivery_from: '' } as T); return; }
                      const [y, m, d] = e.target.value.split('-').map(Number);
                      const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
                      onChange({ ...filters, delivery_from: dt.toISOString() } as T);
                    }}
                    className="w-full"
                    placeholder="From"
                  />
                  <input
                    type="date"
                    onChange={(e) => {
                      if (!e.target.value) { onChange({ ...filters, delivery_to: '' } as T); return; }
                      const [y, m, d] = e.target.value.split('-').map(Number);
                      const dt = new Date(y, m - 1, d + 1, 0, 0, 0, 0); // exclusive: start of next day
                      onChange({ ...filters, delivery_to: dt.toISOString() } as T);
                    }}
                    className="w-full"
                    placeholder="To"
                  />
                </div>
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
