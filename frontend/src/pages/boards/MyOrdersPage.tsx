import { useRef, useState, useEffect } from 'react';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { productsApi } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { Product, STATUS_LABELS, STATUS_ORDER, ProductStatus } from '../../types';
import ProductDetailModal from '../../components/ProductDetailModal';
import { Eye, Loader2, Search, X } from 'lucide-react';
import { formatDate } from '../../utils/date';

const PAGE_SIZE = 50;

type TabKey = ProductStatus | 'all';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'all',          label: 'All'          },
  { key: 'yet_to_start', label: 'Yet to Start' },
  { key: 'working',      label: 'In Progress'  },
  { key: 'review',       label: 'In Review'    },
  { key: 'done',         label: 'Done'         },
];

const TAB_ACTIVE: Record<TabKey, string> = {
  all:          'bg-brand-500/15 text-brand-400 border-brand-500/40',
  yet_to_start: 'bg-surface-500/15 text-surface-300 border-surface-500/40',
  working:      'bg-blue-500/15 text-blue-400 border-blue-500/40',
  review:       'bg-amber-500/15 text-amber-400 border-amber-500/40',
  done:         'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
};

const TAB_IDLE = 'text-surface-400 border-transparent hover:text-surface-200 hover:bg-surface-800/60';

function useTabCounts(baseFilters: Record<string, string>) {
  const all          = useQuery({ queryKey: ['my-orders', 'cnt', 'all',          baseFilters], queryFn: () => productsApi.getPaged(baseFilters, 1), staleTime: 30000 });
  const yet_to_start = useQuery({ queryKey: ['my-orders', 'cnt', 'yet_to_start', baseFilters], queryFn: () => productsApi.getPaged({ ...baseFilters, status: 'yet_to_start' }, 1), staleTime: 30000 });
  const working      = useQuery({ queryKey: ['my-orders', 'cnt', 'working',      baseFilters], queryFn: () => productsApi.getPaged({ ...baseFilters, status: 'working'      }, 1), staleTime: 30000 });
  const review       = useQuery({ queryKey: ['my-orders', 'cnt', 'review',       baseFilters], queryFn: () => productsApi.getPaged({ ...baseFilters, status: 'review'       }, 1), staleTime: 30000 });
  const done         = useQuery({ queryKey: ['my-orders', 'cnt', 'done',         baseFilters], queryFn: () => productsApi.getPaged({ ...baseFilters, status: 'done'         }, 1), staleTime: 30000 });
  return {
    all:          all.data?.data.total          ?? null,
    yet_to_start: yet_to_start.data?.data.total ?? null,
    working:      working.data?.data.total      ?? null,
    review:       review.data?.data.total       ?? null,
    done:         done.data?.data.total         ?? null,
  };
}

export default function MyOrdersPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab]             = useState<TabKey>('all');
  const [search, setSearch]                   = useState('');
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const parentRef   = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const baseFilters: Record<string, string> = {
    assigned_to: String(user?.id ?? 0),
    ...(search.trim() ? { search: search.trim() } : {}),
  };

  const counts   = useTabCounts(baseFilters);
  const queryParams = activeTab === 'all' ? baseFilters : { ...baseFilters, status: activeTab };
  const queryKey    = ['my-orders', 'list', activeTab, baseFilters];

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => productsApi.getPaged(queryParams, PAGE_SIZE, pageParam as number | undefined),
    getNextPageParam: (lastPage) => lastPage.data.next_cursor ?? undefined,
    initialPageParam: undefined as number | undefined,
  });

  const items: Product[] = data?.pages.flatMap((p) => p.data.data) ?? [];

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 53,
    overscan: 10,
  });

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

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => productsApi.updateStatus(id, status),
    onMutate: ({ id }) => {
      if (activeTab !== 'all') {
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
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['my-orders'] }),
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="flex flex-col h-full gap-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <h1 className="text-2xl font-bold">My Orders</h1>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 glass rounded-xl px-3 py-2 border border-surface-700/40 flex-shrink-0">
        <Search className="w-4 h-4 text-surface-500 flex-shrink-0" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by product ID, customer or description…"
          className="flex-1 bg-transparent border-0 outline-none text-sm placeholder:text-surface-500"
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-surface-500 hover:text-surface-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Status chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5 flex-shrink-0">
        {TABS.map(({ key, label }) => {
          const count    = counts[key];
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all duration-150 whitespace-nowrap flex-shrink-0 ${
                isActive ? TAB_ACTIVE[key] : TAB_IDLE
              }`}
            >
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

      {/* Table */}
      <div className="flex-1 min-h-0 glass rounded-2xl border border-surface-700/30 flex flex-col overflow-hidden">

        <div className="flex-shrink-0 bg-surface-900/90 backdrop-blur-sm border-b border-surface-700/50 grid grid-cols-[minmax(100px,1fr)_minmax(120px,1.5fr)_minmax(100px,1fr)_minmax(0,2fr)_140px_80px]">
          <div className="text-left text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-3">Product ID</div>
          <div className="text-left text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-3">Customer</div>
          <div className="text-left text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-3 hidden md:block">Delivery</div>
          <div className="text-left text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-3 hidden lg:block">Description</div>
          <div className="text-left text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-3">Status</div>
          <div className="text-right text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-3">View</div>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-7 h-7 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-surface-400">
            <p className="text-sm">No orders assigned to you</p>
          </div>
        ) : (
          <div ref={parentRef} className="flex-1 overflow-auto relative">
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualItems.map((vi) => {
                const product = items[vi.index];
                return (
                  <div
                    key={vi.key}
                    data-index={vi.index}
                    ref={virtualizer.measureElement}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)` }}
                    className="grid grid-cols-[minmax(100px,1fr)_minmax(120px,1.5fr)_minmax(100px,1fr)_minmax(0,2fr)_140px_80px] border-b border-surface-700/30 hover:bg-surface-800/40 transition-colors group"
                  >
                    <div className="px-4 py-3 text-sm font-medium text-brand-400 truncate">{product.product_id}</div>
                    <div className="px-4 py-3 text-sm text-surface-200 truncate">{product.customer_name}</div>
                    <div className="px-4 py-3 text-sm text-surface-400 truncate hidden md:block">
                      {product.delivery_at ? formatDate(product.delivery_at) : '—'}
                    </div>
                    <div className="px-4 py-3 text-sm text-surface-400 truncate hidden lg:block">{product.description || '—'}</div>
                    <div className="px-4 py-3">
                      <select
                        value={product.status}
                        onChange={(e) => statusMutation.mutate({ id: product.id, status: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                        disabled={statusMutation.isPending}
                        className={`text-xs px-2.5 py-1 rounded-full status-${product.status} bg-transparent border-0 cursor-pointer disabled:opacity-60`}
                      >
                        {STATUS_ORDER.map((s) => (
                          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                    </div>
                    <div className="px-4 py-3 flex items-center justify-end gap-1">
                      <button
                        onClick={() => setSelectedProduct(product.id)}
                        className="p-1.5 rounded-lg text-surface-400 hover:text-brand-400 hover:bg-brand-500/10 transition-colors"
                        title="View details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Sentinel for infinite scroll */}
            <div ref={sentinelRef} style={{ position: 'absolute', bottom: 0, width: '100%', height: 1 }} />

            {isFetchingNextPage && (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-brand-400" />
              </div>
            )}

            {!hasNextPage && items.length > 0 && (
              <div className="text-center py-4 text-xs text-surface-500">
                {items.length} order{items.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}
      </div>

      {selectedProduct && (
        <ProductDetailModal productId={selectedProduct} onClose={() => setSelectedProduct(null)} />
      )}
    </div>
  );
}
