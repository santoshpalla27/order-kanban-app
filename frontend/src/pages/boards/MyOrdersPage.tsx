import { useRef, useState, useEffect } from 'react';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { productsApi } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { Product, STATUS_LABELS, STATUS_ORDER, ProductStatus } from '../../types';
import ProductDetailModal from '../../components/ProductDetailModal';
import SearchFilters from '../../components/SearchFilters';
import { Eye, Loader2, ChevronDown } from 'lucide-react';
import { useProductBadges, useMyOrdersBadges } from '../../hooks/useProductBadges';
import { formatDate } from '../../utils/date';


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

function useTabCounts(baseFilters: Record<string, string>) {
  const all          = useQuery({ queryKey: ['my-orders', 'cnt', 'all',          baseFilters], queryFn: () => productsApi.getPaged(baseFilters, 1), staleTime: 30000 });
  const yet_to_start = useQuery({ queryKey: ['my-orders', 'cnt', 'yet_to_start', baseFilters], queryFn: () => productsApi.getPaged({ ...baseFilters, status: 'yet_to_start' }, 1), staleTime: 30000 });
  const working      = useQuery({ queryKey: ['my-orders', 'cnt', 'working',      baseFilters], queryFn: () => productsApi.getPaged({ ...baseFilters, status: 'working'      }, 1), staleTime: 30000 });
  const review       = useQuery({ queryKey: ['my-orders', 'cnt', 'review',       baseFilters], queryFn: () => productsApi.getPaged({ ...baseFilters, status: 'review'       }, 1), staleTime: 30000 });
  const done         = useQuery({ queryKey: ['my-orders', 'cnt', 'done',         baseFilters], queryFn: () => productsApi.getPaged({ ...baseFilters, status: 'done'         }, 1), staleTime: 30000 });
  return {
    '':           all.data?.data.total          ?? null,
    yet_to_start: yet_to_start.data?.data.total ?? null,
    working:      working.data?.data.total      ?? null,
    review:       review.data?.data.total       ?? null,
    done:         done.data?.data.total         ?? null,
  } as Record<string, number | null>;
}

export default function MyOrdersPage() {
  const { user } = useAuthStore();
  const { hasAny, badges } = useProductBadges();
  const { badgeCountsByStatus } = useMyOrdersBadges(user?.id);
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    created_by: '',
    date_from: '',
    date_to: '',
    assigned_to: String(user?.id ?? 0),
    delivery_from: '',
    delivery_to: '',
  });
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const parentRef   = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Base filters for counts exclude status
  const baseFilters = Object.fromEntries(
    Object.entries(filters).filter(([k, v]) => v !== '' && k !== 'status')
  ) as Record<string, string>;

  const counts   = useTabCounts(baseFilters);
  const tabLabel = TABS.find(t => t.key === filters.status)?.label ?? '';

  // API parameters and Cache Key
  const apiParams = Object.fromEntries(
    Object.entries(filters).filter(([_, v]) => v !== '')
  ) as Record<string, string>;

  const queryKey = ['my-orders', 'list', filters];

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

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 61,
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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
    },
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="flex flex-col h-full gap-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-brand-400 to-indigo-400">My Orders</h1>
      </div>

      <SearchFilters filters={filters} onChange={setFilters} showDeliveryFilter />

      {/* Status chips */}
      <div className="flex items-center gap-2 overflow-x-auto pt-1.5 pb-1 px-1 -mx-1 flex-shrink-0">
        {TABS.map(({ key, label }) => {
          const count    = counts[key];
          const isActive = filters.status === key;
          const notifCount = key === ''
            ? Object.keys(badges || {}).length
            : badgeCountsByStatus[key] || 0;
          return (
            <button
              key={key}
              onClick={() => setFilters({ ...filters, status: key })}
              className={`relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all duration-150 whitespace-nowrap flex-shrink-0 ${
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
              {notifCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-surface-950" />
              )}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 glass rounded-2xl border border-surface-700/30 flex flex-col overflow-hidden">

        <div className="flex-shrink-0 bg-surface-900/80 backdrop-blur-lg border-b border-surface-700/50 grid grid-cols-[minmax(100px,1fr)_minmax(120px,1.5fr)_minmax(100px,1fr)_minmax(0,2fr)_100px_minmax(180px,200px)]">
          <div className="text-left text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-4">Product ID</div>
          <div className="text-left text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-4">Customer</div>
          <div className="text-left text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-4 hidden md:block">Delivery</div>
          <div className="text-left text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-4 hidden lg:block">Description</div>
          <div className="text-center text-xs font-medium text-surface-400 uppercase tracking-wider px-4 py-4">View</div>
          <div className="text-center text-xs font-medium text-surface-400 uppercase tracking-wider pl-4 pr-10 py-4">Status</div>
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
                    className="grid grid-cols-[minmax(100px,1fr)_minmax(120px,1.5fr)_minmax(100px,1fr)_minmax(0,2fr)_100px_minmax(180px,200px)] border-b border-surface-700/30 hover:bg-surface-800/40 transition-colors group"
                  >
                    <div className="px-4 py-4 flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-brand-400 truncate">{product.product_id}</span>
                      {hasAny(product.id) && (
                        <span className="flex-shrink-0 w-2 h-2 rounded-full bg-red-500 animate-pulse" title="New comment" />
                      )}
                    </div>
                    <div className="px-4 py-4 text-sm text-surface-200 truncate">{product.customer_name}</div>
                    <div className="px-4 py-4 text-sm text-surface-400 truncate hidden md:block">
                      {product.delivery_at ? formatDate(product.delivery_at) : '—'}
                    </div>
                    <div className="px-4 py-4 text-sm text-surface-400 truncate hidden lg:block">{product.description || '—'}</div>
                    <div className="px-4 py-4 flex items-center justify-center">
                      <button
                        onClick={() => { setSelectedProduct(product.id); }}
                        className="p-1.5 rounded-lg text-surface-400 hover:text-brand-400 hover:bg-brand-500/10 transition-colors"
                        title="View details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="pl-4 pr-10 py-4 flex items-center justify-center">
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
