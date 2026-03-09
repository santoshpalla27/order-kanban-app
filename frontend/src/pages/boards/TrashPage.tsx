import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productsApi } from '../../api/client';
import { Product } from '../../types';
import { Trash2, RotateCcw, Clock } from 'lucide-react';

const GRACE_DAYS = 10;

function daysRemaining(deletedAt: string): number {
  const expiry = new Date(new Date(deletedAt).getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);
  return Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

function expiryLabel(deletedAt: string): string {
  const days = daysRemaining(deletedAt);
  if (days === 0) return 'Expires today';
  if (days === 1) return '1 day left';
  return `${days} days left`;
}

export default function TrashPage() {
  const queryClient = useQueryClient();
  const [restoreConfirmId, setRestoreConfirmId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['products-deleted'],
    queryFn: () => productsApi.getDeleted(),
  });

  const products: Product[] = data?.data || [];

  const restoreMutation = useMutation({
    mutationFn: (id: number) => productsApi.restore(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products-deleted'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setRestoreConfirmId(null);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Trash2 className="w-6 h-6 text-surface-400" />
        <div>
          <h1 className="text-2xl font-bold">Trash</h1>
          <p className="text-sm text-surface-500 mt-0.5">
            Deleted products are kept for {GRACE_DAYS} days before permanent removal.
            The product ID cannot be reused during this period.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
        </div>
      ) : products.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Trash2 className="w-10 h-10 text-surface-600 mx-auto mb-3" />
          <p className="text-surface-400 font-medium">Trash is empty</p>
          <p className="text-surface-500 text-sm mt-1">Deleted products will appear here</p>
        </div>
      ) : (
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-700/50">
                <th className="text-left text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-3">Product ID</th>
                <th className="text-left text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-3">Customer</th>
                <th className="text-left text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Status</th>
                <th className="text-left text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Created by</th>
                <th className="text-left text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-3">Expires</th>
                <th className="text-right text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const days = product.deleted_at ? daysRemaining(product.deleted_at) : GRACE_DAYS;
                const urgent = days <= 2;
                return (
                  <tr key={product.id} className="border-b border-surface-700/20 hover:bg-surface-700/20 transition-colors opacity-80">
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-surface-300 line-through">
                        {product.product_id}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-surface-400">{product.customer_name}</td>
                    <td className="px-4 py-3 text-sm text-surface-400 capitalize hidden md:table-cell">
                      {product.status?.replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-3 text-sm text-surface-400 hidden lg:table-cell">
                      {product.creator?.name || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {product.deleted_at && (
                        <span className={`flex items-center gap-1.5 text-xs font-medium ${urgent ? 'text-red-400' : 'text-amber-400'}`}>
                          <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                          {expiryLabel(product.deleted_at)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setRestoreConfirmId(product.id)}
                        className="btn-ghost p-1.5 rounded-lg text-brand-400 hover:text-brand-300"
                        title="Restore"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Restore Confirmation Modal */}
      {restoreConfirmId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setRestoreConfirmId(null)}
        >
          <div
            className="w-full max-w-sm glass rounded-2xl p-6 text-center animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-brand-500/20 text-brand-400 flex items-center justify-center mx-auto mb-4">
              <RotateCcw className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold mb-2">Restore Product?</h3>
            <p className="text-surface-400 text-sm mb-6">
              The product will be moved back to the Kanban board with its original ID.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setRestoreConfirmId(null)}
                className="btn-ghost px-5 py-2.5"
                disabled={restoreMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={() => restoreMutation.mutate(restoreConfirmId)}
                className="btn-primary px-5 py-2.5 flex items-center gap-2"
                disabled={restoreMutation.isPending}
              >
                {restoreMutation.isPending ? 'Restoring…' : 'Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
