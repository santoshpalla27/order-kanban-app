import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { productsApi, usersApi } from '../api/client';
import { User } from '../types';
import { X, Package } from 'lucide-react';

function todayAtMidnight() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T00:00`;
}

interface Props {
  onClose: () => void;
}

export default function CreateProductModal({ onClose }: Props) {
  const [productId, setProductId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [description, setDescription] = useState('');
  const [deliveryAt, setDeliveryAt] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const { data: usersData } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => usersApi.getList(),
  });
  const users: User[] = usersData?.data || [];

  const mutation = useMutation({
    mutationFn: (data: any) => productsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onClose();
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to create product');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      product_id: productId,
      customer_name: customerName,
      customer_phone: customerPhone,
      description,
      delivery_at: deliveryAt ? new Date(deliveryAt).toISOString() : null,
      assignee_ids: assigneeIds,
    });
  };

  const addAssignee = (id: number) => {
    if (id && !assigneeIds.includes(id)) setAssigneeIds(prev => [...prev, id]);
  };
  const removeAssignee = (id: number) => setAssigneeIds(prev => prev.filter(x => x !== id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md glass rounded-2xl animate-scale-in flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-surface-700/50 flex-shrink-0">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Package className="w-5 h-5 text-brand-400" />
            New Product
          </h2>
          <button onClick={onClose} className="btn-ghost p-2 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Product ID *</label>
            <input
              type="text"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              placeholder="e.g. PRD-001"
              required
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Customer Name *</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer name"
              required
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Customer Phone</label>
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="+1 234 567 8900"
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Product description..."
              rows={3}
              className="w-full resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Delivery Date & Time</label>
            <input
              type="datetime-local"
              value={deliveryAt}
              onFocus={() => { if (!deliveryAt) setDeliveryAt(todayAtMidnight()); }}
              onChange={(e) => setDeliveryAt(e.target.value)}
              className="w-full"
            />
            {deliveryAt && (
              <div className="flex justify-end mt-1">
                <button
                  type="button"
                  onClick={() => setDeliveryAt('')}
                  className="text-xs text-surface-500 hover:text-surface-300 px-2 py-0.5 rounded transition-colors"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Assign To</label>
            {assigneeIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {assigneeIds.map(id => {
                  const u = users.find(u => u.id === id);
                  return u ? (
                    <span key={id} className="inline-flex items-center gap-1 bg-brand-500/15 text-brand-300 text-xs px-2.5 py-1 rounded-full border border-brand-500/30">
                      {u.name}
                      <button type="button" onClick={() => removeAssignee(id)} className="hover:text-red-400 transition-colors ml-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ) : null;
                })}
              </div>
            )}
            <select
              value=""
              onChange={(e) => addAssignee(Number(e.target.value))}
              className="w-full"
            >
              <option value="">+ Add assignee…</option>
              {users.filter(u => !assigneeIds.includes(u.id)).map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary flex-1">
              {mutation.isPending ? 'Creating...' : 'Create Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
