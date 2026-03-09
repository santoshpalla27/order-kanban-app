import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productsApi } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { Product, STATUS_LABELS, STATUS_ORDER, ProductStatus } from '../../types';
import SearchFilters from '../../components/SearchFilters';
import ProductDetailModal from '../../components/ProductDetailModal';
import CreateProductModal from '../../components/CreateProductModal';
import { Plus, ChevronDown, Eye, Trash2 } from 'lucide-react';

export default function ListView() {
  const [filters, setFilters] = useState({ search: '', status: '', created_by: '', date_from: '', date_to: '' });
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const { canCreateProduct, canDeleteProduct } = useAuthStore();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['products', filters],
    queryFn: () => productsApi.getAll(
      Object.fromEntries(Object.entries(filters).filter(([_, v]) => v !== ''))
    ),
  });
  const products: Product[] = data?.data || [];

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      productsApi.updateStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => productsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setDeleteConfirmId(null);
    },
  });

  const groupedProducts = STATUS_ORDER.reduce((acc, status) => {
    acc[status] = products.filter((p) => p.status === status);
    return acc;
  }, {} as Record<ProductStatus, Product[]>);

  const statusColors: Record<ProductStatus, string> = {
    yet_to_start: 'from-gray-500 to-gray-600',
    working: 'from-blue-500 to-blue-600',
    review: 'from-amber-500 to-amber-600',
    done: 'from-emerald-500 to-emerald-600',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Products</h1>
        {canCreateProduct() && (
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Product
          </button>
        )}
      </div>

      <SearchFilters filters={filters} onChange={setFilters} />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-8">
          {STATUS_ORDER.map((status) => {
            const items = filters.status ? (filters.status === status ? groupedProducts[status] : []) : groupedProducts[status];
            if (filters.status && filters.status !== status) return null;

            return (
              <div key={status}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-3 h-3 rounded-full bg-gradient-to-r ${statusColors[status]}`} />
                  <h2 className="text-lg font-semibold">{STATUS_LABELS[status]}</h2>
                  <span className="text-sm text-surface-500">({items.length})</span>
                </div>

                {items.length === 0 ? (
                  <div className="glass rounded-xl p-6 text-center text-surface-500 text-sm">
                    No products
                  </div>
                ) : (
                  <div className="glass rounded-xl overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-surface-700/50">
                          <th className="text-left text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-3">Product ID</th>
                          <th className="text-left text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-3">Customer</th>
                          <th className="text-left text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Phone</th>
                          <th className="text-left text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">Description</th>
                          <th className="text-left text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-3">Status</th>
                          <th className="text-right text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((product) => (
                          <tr key={product.id} className="border-b border-surface-700/20 hover:bg-surface-700/20 transition-colors">
                            <td className="px-4 py-3">
                              <span className="text-sm font-medium text-brand-400">{product.product_id}</span>
                            </td>
                            <td className="px-4 py-3 text-sm">{product.customer_name}</td>
                            <td className="px-4 py-3 text-sm text-surface-400 hidden md:table-cell">{product.customer_phone || '—'}</td>
                            <td className="px-4 py-3 text-sm text-surface-400 hidden lg:table-cell max-w-[200px] truncate">{product.description || '—'}</td>
                            <td className="px-4 py-3">
                              <select
                                value={product.status}
                                onChange={(e) => statusMutation.mutate({ id: product.id, status: e.target.value })}
                                className={`text-xs px-2 py-1 rounded-full status-${product.status} bg-transparent border-0 cursor-pointer`}
                              >
                                {STATUS_ORDER.map((s) => (
                                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => setSelectedProduct(product.id)}
                                  className="btn-ghost p-1.5 rounded-lg"
                                  title="View details"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                {canDeleteProduct() && (
                                  <button
                                    onClick={() => setDeleteConfirmId(product.id)}
                                    className="btn-ghost p-1.5 rounded-lg text-red-400 hover:text-red-300"
                                    title="Delete"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedProduct && (
        <ProductDetailModal productId={selectedProduct} onClose={() => setSelectedProduct(null)} />
      )}
      {showCreate && (
        <CreateProductModal onClose={() => setShowCreate(false)} />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setDeleteConfirmId(null)}
        >
          <div
            className="w-full max-w-sm glass rounded-2xl p-6 text-center animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold mb-2">Delete Product?</h3>
            <p className="text-surface-400 text-sm mb-6">
              Are you sure you want to delete this product? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="btn-ghost px-5 py-2.5"
                disabled={deleteMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteConfirmId)}
                className="btn-danger px-5 py-2.5 flex items-center gap-2"
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
