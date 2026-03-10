import { useRef } from 'react';
import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { productsApi } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { Product, STATUS_LABELS, STATUS_ORDER, ProductStatus } from '../../types';
import SearchFilters from '../../components/SearchFilters';
import ProductDetailModal from '../../components/ProductDetailModal';
import CreateProductModal from '../../components/CreateProductModal';
import { Plus, Eye, Trash2, Loader2, Search } from 'lucide-react';

const PAGE_SIZE = 50;
const ROW_HEIGHT = 53;
const SECTION_HEIGHT = ROW_HEIGHT * 6; // ~6 rows visible before scroll

// ─── Scrollable virtual table for one status group ───────────────────────────

function StatusTable({
  items,
  onStatusChange,
  onView,
  onDelete,
  canDelete,
  onScrollEnd,
}: {
  items: Product[];
  onStatusChange: (id: number, status: string) => void;
  onView: (id: number) => void;
  onDelete: (id: number) => void;
  canDelete: boolean;
  onScrollEnd: () => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0;

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 120) {
      onScrollEnd();
    }
  };

  return (
    <div
      ref={parentRef}
      className="glass rounded-xl overflow-y-auto"
      style={{ height: `${SECTION_HEIGHT}px` }}
      onScroll={handleScroll}
    >
      <table className="w-full">
        <thead className="sticky top-0 z-10 bg-surface-900/95 backdrop-blur-sm">
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
          {paddingTop > 0 && (
            <tr><td colSpan={6} style={{ height: `${paddingTop}px`, padding: 0, border: 0 }} /></tr>
          )}
          {virtualItems.map((vr) => {
            const product = items[vr.index];
            return (
              <tr
                key={product.id}
                className="border-b border-surface-700/20 hover:bg-surface-700/20 transition-colors"
              >
                <td className="px-4 py-3">
                  <span className="text-sm font-medium text-brand-400">{product.product_id}</span>
                </td>
                <td className="px-4 py-3 text-sm">{product.customer_name}</td>
                <td className="px-4 py-3 text-sm text-surface-400 hidden md:table-cell">
                  {product.customer_phone || '—'}
                </td>
                <td className="px-4 py-3 text-sm text-surface-400 hidden lg:table-cell max-w-[200px] truncate">
                  {product.description || '—'}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={product.status}
                    onChange={(e) => onStatusChange(product.id, e.target.value)}
                    className={`text-xs px-2 py-1 rounded-full status-${product.status} bg-transparent border-0 cursor-pointer`}
                  >
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => onView(product.id)} className="btn-ghost p-1.5 rounded-lg" title="View details">
                      <Eye className="w-4 h-4" />
                    </button>
                    {canDelete && (
                      <button onClick={() => onDelete(product.id)} className="btn-ghost p-1.5 rounded-lg text-red-400 hover:text-red-300" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {paddingBottom > 0 && (
            <tr><td colSpan={6} style={{ height: `${paddingBottom}px`, padding: 0, border: 0 }} /></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Per-status paginated section ────────────────────────────────────────────

function StatusSection({
  status,
  filters,
  onStatusChange,
  onView,
  onDelete,
  canDelete,
}: {
  status: ProductStatus;
  filters: Record<string, string>;
  onStatusChange: (id: number, status: string) => void;
  onView: (id: number) => void;
  onDelete: (id: number) => void;
  canDelete: boolean;
}) {
  const queryClient = useQueryClient();
  const [sectionSearch, setSectionSearch] = useState('');

  const queryKey = ['products', 'paged', status, filters];
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      productsApi.getPaged({ ...filters, status }, PAGE_SIZE, pageParam as number | undefined),
    getNextPageParam: (lastPage) => lastPage.data.next_cursor ?? undefined,
    initialPageParam: undefined as number | undefined,
  });

  const allItems: Product[] = data?.pages.flatMap((p) => p.data.data) ?? [];
  const total: number = data?.pages[0]?.data.total ?? allItems.length;

  const q = sectionSearch.trim().toLowerCase();
  const filtered = q
    ? allItems.filter(
        (p) =>
          p.product_id.toLowerCase().includes(q) ||
          p.customer_name.toLowerCase().includes(q) ||
          (p.customer_phone || '').toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q),
      )
    : allItems;

  const statusColors: Record<ProductStatus, string> = {
    yet_to_start: 'from-gray-500 to-gray-600',
    working: 'from-blue-500 to-blue-600',
    review: 'from-amber-500 to-amber-600',
    done: 'from-emerald-500 to-emerald-600',
  };

  const handleStatusChange = (id: number, newStatus: string) => {
    onStatusChange(id, newStatus);
    queryClient.setQueryData(queryKey, (old: any) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page: any) => ({
          ...page,
          data: { ...page.data, data: page.data.data.filter((p: Product) => p.id !== id) },
        })),
      };
    });
  };

  const handleScrollEnd = () => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className={`w-3 h-3 rounded-full bg-gradient-to-r ${statusColors[status]} flex-shrink-0`} />
        <h2 className="text-lg font-semibold">{STATUS_LABELS[status]}</h2>
        <span className="text-sm text-surface-500">({total})</span>
        <div className="ml-auto flex items-center gap-1.5 bg-surface-800/60 border border-surface-700/40 rounded-lg px-2.5 py-1.5">
          <Search className="w-3.5 h-3.5 text-surface-500 flex-shrink-0" />
          <input
            value={sectionSearch}
            onChange={(e) => setSectionSearch(e.target.value)}
            placeholder="Filter this section…"
            className="bg-transparent border-0 outline-none text-xs text-surface-200 placeholder-surface-500 w-36"
          />
          {sectionSearch && (
            <button onClick={() => setSectionSearch('')} className="text-surface-500 hover:text-surface-300 text-xs">✕</button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="glass rounded-xl p-6 flex justify-center">
          <div className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-xl p-6 text-center text-surface-500 text-sm" style={{ height: `${SECTION_HEIGHT}px` }}>
          {sectionSearch ? 'No matches in this section' : 'No products'}
        </div>
      ) : (
        <>
          <StatusTable
            items={filtered}
            onStatusChange={handleStatusChange}
            onView={onView}
            onDelete={onDelete}
            canDelete={canDelete}
            onScrollEnd={handleScrollEnd}
          />
          {isFetchingNextPage && (
            <div className="flex justify-center items-center gap-2 py-1.5 text-xs text-surface-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400" /> Loading more…
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main ListView ───────────────────────────────────────────────────────────

export default function ListView() {
  const [filters, setFilters] = useState({ search: '', status: '', created_by: '', date_from: '', date_to: '' });
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const { canCreateProduct, canDeleteProduct } = useAuthStore();
  const queryClient = useQueryClient();

  // Strip empty values; also strip `status` since StatusSection injects it per-group
  const baseFilters = Object.fromEntries(
    Object.entries(filters).filter(([k, v]) => v !== '' && k !== 'status')
  ) as Record<string, string>;

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      productsApi.updateStatus(id, status),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => productsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setDeleteConfirmId(null);
    },
  });

  // Statuses to render: if a status filter is active, show only that one
  const visibleStatuses = (filters.status ? [filters.status as ProductStatus] : STATUS_ORDER);

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

      <div className="space-y-8">
        {visibleStatuses.map((status) => (
          <StatusSection
            key={status}
            status={status}
            filters={baseFilters}
            onStatusChange={(id, s) => statusMutation.mutate({ id, status: s })}
            onView={setSelectedProduct}
            onDelete={setDeleteConfirmId}
            canDelete={canDeleteProduct()}
          />
        ))}
      </div>

      {selectedProduct && (
        <ProductDetailModal productId={selectedProduct} onClose={() => setSelectedProduct(null)} />
      )}
      {showCreate && (
        <CreateProductModal onClose={() => setShowCreate(false)} />
      )}

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
