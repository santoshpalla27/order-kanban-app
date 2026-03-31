import { useRef, useState, useEffect } from 'react';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { productsApi } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { Product, STATUS_LABELS, STATUS_ORDER, ProductStatus } from '../../types';
import ProductDetailModal from '../../components/ProductDetailModal';
import CreateProductModal from '../../components/CreateProductModal';
import SearchFilters from '../../components/SearchFilters';
import { Plus, Eye, Trash2, Loader2, ChevronDown } from 'lucide-react';
import { useProductBadges } from '../../hooks/useProductBadges';
import { useCustomerMessageStore } from '../../store/customerMessageStore';

const PAGE_SIZE = 50;

type TabKey = string; // ProductStatus | 'all'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: '',             label: 'All'          },
  { key: 'yet_to_start', label: 'Yet to Start' },
  { key: 'working',      label: 'Working'      },
  { key: 'review',       label: 'In Review'    },
  { key: 'done',         label: 'Done'         },
];

const TAB_ACTIVE: Record<string, string> = {
  '':           'bg-brand-500/15 text-brand-400 border-brand-500/40',
  yet_to_start: 'bg-red-500/15 text-red-500 border-red-500/40',
  working:      'bg-blue-500/15 text-blue-400 border-blue-500/40',
  review:       'bg-amber-500/15 text-amber-400 border-amber-500/40',
  done:         'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
};

const TAB_DOTS: Record<string, string> = {
  '':           'bg-brand-400',
  yet_to_start: 'bg-red-500',
  working:      'bg-blue-400',
  review:       'bg-amber-400',
  done:         'bg-emerald-400',
};

const TAB_IDLE = 'text-surface-400 border-transparent hover:text-surface-200 hover:bg-surface-800/60';

// ─── Chip counts ─────────────────────────────────────────────────────────────

function useTabCounts(baseFilters: Record<string, string>) {
  const all          = useQuery({ queryKey: ['products', 'cnt', 'all',          baseFilters], queryFn: () => productsApi.getPaged(baseFilters, 1), staleTime: 30000 });
  const yet_to_start = useQuery({ queryKey: ['products', 'cnt', 'yet_to_start', baseFilters], queryFn: () => productsApi.getPaged({ ...baseFilters, status: 'yet_to_start' }, 1), staleTime: 30000 });
  const working      = useQuery({ queryKey: ['products', 'cnt', 'working',      baseFilters], queryFn: () => productsApi.getPaged({ ...baseFilters, status: 'working'      }, 1), staleTime: 30000 });
  const review       = useQuery({ queryKey: ['products', 'cnt', 'review',       baseFilters], queryFn: () => productsApi.getPaged({ ...baseFilters, status: 'review'       }, 1), staleTime: 30000 });
  const done         = useQuery({ queryKey: ['products', 'cnt', 'done',         baseFilters], queryFn: () => productsApi.getPaged({ ...baseFilters, status: 'done'         }, 1), staleTime: 30000 });
  return {
    '':           all.data?.data.total          ?? null,
    yet_to_start: yet_to_start.data?.data.total ?? null,
    working:      working.data?.data.total      ?? null,
    review:       review.data?.data.total       ?? null,
    done:         done.data?.data.total         ?? null,
  } as Record<string, number | null>;
}

// ─── Main ListView ───────────────────────────────────────────────────────────

export default function ListView() {
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    created_by: '',
    date_from: '',
    date_to: '',
    assigned_to: '',
    delivery_from: '',
    delivery_to: '',
  });
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const { hasAny } = useProductBadges();
  const customerHasUnread = useCustomerMessageStore((s) => s.hasUnread);
  const [showCreate, setShowCreate]           = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const { canCreateProduct, canDeleteProduct } = useAuthStore();
  const queryClient = useQueryClient();
  const parentRef   = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Base filters for counts exclude status but include everything else
  const baseFilters = Object.fromEntries(
    Object.entries(filters).filter(([k, v]) => v !== '' && k !== 'status')
  ) as Record<string, string>;

  const counts   = useTabCounts(baseFilters);
  const tabLabel = TABS.find(t => t.key === filters.status)?.label ?? '';

  // API parameters and Cache Key
  const apiParams = Object.fromEntries(
    Object.entries(filters).filter(([_, v]) => v !== '')
  ) as Record<string, string>;

  const queryKey = ['products', 'list', filters];

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => productsApi.getPaged(apiParams, PAGE_SIZE, pageParam as number | undefined),
    getNextPageParam: (lastPage) => lastPage.data.next_cursor ?? undefined,
    initialPageParam: undefined as number | undefined,
  });

  const items: Product[] = data?.pages.flatMap((p) => p.data.data) ?? [];

  // ── Virtualizer (absolute-position mode) ──────────────────────────────────
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 61,
    overscan: 10,
  });

  // ── IntersectionObserver sentinel — fires when the bottom sentinel enters view
  const fetchNextPageRef = useRef(fetchNextPage);
  const hasNextPageRef   = useRef(hasNextPage);
  const isFetchingRef    = useRef(isFetchingNextPage);
  fetchNextPageRef.current = fetchNextPage;
  hasNextPageRef.current   = hasNextPage;
  isFetchingRef.current    = isFetchingNextPage;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPageRef.current && !isFetchingRef.current) {
          fetchNextPageRef.current();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => productsApi.updateStatus(id, status),
    onMutate: async ({ id }) => {
      if (filters.status !== '') {
        await queryClient.cancelQueries({ queryKey });
        const previous = queryClient.getQueryData(queryKey);
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
        return { previous };
      }
    },
    onError: (_err, _vars, context: any) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => productsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setDeleteConfirmId(null);
    },
  });

  const virtualItems = virtualizer.getVirtualItems();

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full gap-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-brand-400 to-indigo-400">Products</h1>
        {canCreateProduct() && (
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Product
          </button>
        )}
      </div>

      <SearchFilters filters={filters} onChange={setFilters} showAssigneeFilter showDeliveryFilter />

      {/* Status chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5 flex-shrink-0">
        {TABS.map(({ key, label }) => {
          const count    = counts[key];
          const isActive = filters.status === key;
          return (
            <button
              key={key}
              onClick={() => setFilters({ ...filters, status: key })}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all duration-150 whitespace-nowrap flex-shrink-0 ${
                isActive ? TAB_ACTIVE[key] : TAB_IDLE
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${TAB_DOTS[key]}`} />
              {label}
              {count !== null && (
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                  isActive ? 'bg-white/10' : 'bg-surface-700/60 text-surface-400'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Table card — fills remaining height */}
      <div className="flex-1 min-h-0 glass rounded-2xl border border-surface-700/30 flex flex-col overflow-hidden">

        {/* Sticky column header */}
        <div className="flex-shrink-0 bg-surface-900/80 backdrop-blur-lg border-b border-surface-700/50 grid grid-cols-[minmax(100px,1fr)_minmax(120px,1.5fr)_minmax(100px,1fr)_minmax(0,2fr)_100px_180px_80px]">
          <div className="text-left text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-4">Product ID</div>
          <div className="text-left text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-4">Customer</div>
          <div className="text-left text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-4 hidden md:block">Phone</div>
          <div className="text-left text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-4 hidden lg:block">Assignee</div>
          <div className="text-center text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-4">View</div>
          <div className="text-center text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-4">Status</div>
          <div className="pl-4 pr-8 py-4"/>
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-7 h-7 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-surface-500 text-sm">
              {filters.search ? 'No products match your search' : `No products in "${tabLabel}"`}
            </p>
          </div>
        ) : (
          <div ref={parentRef} className="flex-1 overflow-y-auto">

            {/* Virtual container */}
            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
              {virtualItems.map((vr) => {
                const product = items[vr.index];
                return (
                  <div
                    key={product.id}
                    data-index={vr.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${vr.start}px)`,
                    }}
                    className="grid grid-cols-[minmax(100px,1fr)_minmax(120px,1.5fr)_minmax(100px,1fr)_minmax(0,2fr)_100px_180px_80px] border-b border-surface-700/20 hover:bg-surface-700/30 transition-colors"
                  >
                    <div className="px-4 py-4 flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-brand-400 truncate">{product.product_id}</span>
                      {(hasAny(product.id) || customerHasUnread(product.id)) && (
                        <span className="flex-shrink-0 w-2 h-2 rounded-full bg-red-500 animate-pulse" title="New activity" />
                      )}
                    </div>
                    <div className="px-4 py-4 flex items-center text-sm truncate min-w-0">{product.customer_name}</div>
                    <div className="px-4 py-4 items-center text-sm text-surface-400 hidden md:flex truncate min-w-0">
                      {product.customer_phone || '—'}
                    </div>
                    <div className="px-4 py-4 items-center text-sm text-surface-400 hidden lg:flex truncate min-w-0">
                      {product.assignees && product.assignees.length > 0
                        ? product.assignees.map(a => a.name).join(', ')
                        : '—'}
                    </div>
                    <div className="px-4 py-4 flex items-center justify-center">
                      <button onClick={() => { setSelectedProduct(product.id); }} className="btn-ghost p-1.5 rounded-lg" title="View details">
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="px-4 py-4 flex items-center justify-center">
                      <select
                        value={product.status}
                        onChange={(e) => statusMutation.mutate({ id: product.id, status: e.target.value })}
                        className={`text-xs px-2 py-1 rounded-full status-${product.status} bg-transparent border-0 cursor-pointer`}
                      >
                        {STATUS_ORDER.map((s) => (
                          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                    </div>
                    <div className="pl-4 pr-8 py-4 flex items-center justify-center">
                      {canDeleteProduct() && (
                        <button onClick={() => setDeleteConfirmId(product.id)} className="btn-ghost p-1.5 rounded-lg text-red-400 hover:text-red-300" title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Sentinel + load-more footer */}
            <div ref={sentinelRef} className="flex items-center justify-center py-3 gap-3">
              {isFetchingNextPage ? (
                <span className="flex items-center gap-2 text-xs text-surface-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400" /> Loading more…
                </span>
              ) : hasNextPage ? (
                <button
                  onClick={() => fetchNextPage()}
                  className="flex items-center gap-1.5 text-xs text-surface-400 hover:text-surface-200 px-3 py-1.5 rounded-lg hover:bg-surface-700/30 transition-colors"
                >
                  <ChevronDown className="w-3.5 h-3.5" /> Load more
                </button>
              ) : items.length > 0 ? (
                <span className="text-xs text-surface-600">All {items.length} items loaded</span>
              ) : null}
            </div>

          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {selectedProduct && (
        <ProductDetailModal productId={selectedProduct} onClose={() => setSelectedProduct(null)} />
      )}
      {showCreate && (
        <CreateProductModal onClose={() => setShowCreate(false)} />
      )}

      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setDeleteConfirmId(null)}>
          <div className="w-full max-w-sm glass rounded-2xl p-6 text-center animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold mb-2">Delete Product?</h3>
            <p className="text-surface-400 text-sm mb-6">This action cannot be undone.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setDeleteConfirmId(null)} className="btn-ghost px-5 py-2.5" disabled={deleteMutation.isPending}>Cancel</button>
              <button onClick={() => deleteMutation.mutate(deleteConfirmId)} className="btn-danger px-5 py-2.5 flex items-center gap-2" disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
