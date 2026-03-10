import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { productsApi } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { Product, STATUS_LABELS, STATUS_ORDER, ProductStatus } from '../../types';
import SearchFilters from '../../components/SearchFilters';
import ProductDetailModal from '../../components/ProductDetailModal';
import CreateProductModal from '../../components/CreateProductModal';
import {
  DndContext, closestCenter, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, useDroppable, useDraggable,
} from '@dnd-kit/core';
import { Plus, GripVertical, Package, Loader2 } from 'lucide-react';

const PAGE_SIZE = 20;          // cards per page per column
const CARD_ESTIMATE_PX = 100;  // estimated card height for virtualizer
const VIRTUAL_THRESHOLD = 15;  // switch to virtual scrolling above this count

// ─── Column query key ────────────────────────────────────────────────────────

const colKey = (status: string, base: Record<string, string>) =>
  ['products', 'kanban', status, base] as const;

// ─── Root board ──────────────────────────────────────────────────────────────

export default function KanbanBoard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState({
    search: '', status: '', created_by: '', date_from: '', date_to: '',
  });
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const { canCreateProduct } = useAuthStore();
  const queryClient = useQueryClient();

  // Open product modal via ?product=id (e.g. from notification link)
  useEffect(() => {
    const id = searchParams.get('product');
    if (id) {
      setSelectedProduct(Number(id));
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // Base filters — status is injected per-column, not here
  const baseFilters = Object.fromEntries(
    Object.entries(filters).filter(([k, v]) => v !== '' && k !== 'status'),
  ) as Record<string, string>;

  // ── Drag mutation with full optimistic cross-column update ─────────────────

  const dragMutation = useMutation({
    mutationFn: ({ id, newStatus }: { id: number; srcStatus: string; newStatus: string; product: Product }) =>
      productsApi.updateStatus(id, newStatus),

    onMutate: async ({ id, srcStatus, newStatus, product }) => {
      const srcKey = colKey(srcStatus, baseFilters);
      const tgtKey = colKey(newStatus, baseFilters);

      await queryClient.cancelQueries({ queryKey: srcKey });
      await queryClient.cancelQueries({ queryKey: tgtKey });

      const prevSrc = queryClient.getQueryData(srcKey);
      const prevTgt = queryClient.getQueryData(tgtKey);

      // Remove card from source column
      queryClient.setQueryData(srcKey, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            data: { ...page.data, data: page.data.data.filter((p: Product) => p.id !== id) },
          })),
        };
      });

      // Prepend card to target column's first page
      queryClient.setQueryData(tgtKey, (old: any) => {
        if (!old) return old;
        const updated = { ...product, status: newStatus };
        return {
          ...old,
          pages: old.pages.map((page: any, i: number) =>
            i === 0
              ? { ...page, data: { ...page.data, data: [updated, ...page.data.data] } }
              : page,
          ),
        };
      });

      return { prevSrc, prevTgt, srcKey, tgtKey };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.prevSrc) queryClient.setQueryData(ctx.srcKey, ctx.prevSrc);
      if (ctx?.prevTgt) queryClient.setQueryData(ctx.tgtKey, ctx.prevTgt);
    },

    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['products', 'kanban'] }),
  });

  // ── Drag handlers ──────────────────────────────────────────────────────────

  const handleDragStart = (event: DragStartEvent) => {
    const product = (event.active.data.current as any)?.product as Product | undefined;
    setActiveProduct(product ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveProduct(null);
    const { over } = event;
    if (!over || !activeProduct) return;

    // over.id is always a column status string — cards are not droppables
    const targetStatus = over.id as string;
    if (targetStatus === activeProduct.status) return;

    dragMutation.mutate({
      id: activeProduct.id,
      srcStatus: activeProduct.status,
      newStatus: targetStatus,
      product: activeProduct,
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const columnColors: Record<ProductStatus, { bg: string; border: string; dot: string }> = {
    yet_to_start: { bg: 'bg-gray-500/5',    border: 'border-gray-600/30',   dot: 'bg-gray-400'    },
    working:      { bg: 'bg-blue-500/5',    border: 'border-blue-600/30',   dot: 'bg-blue-400'    },
    review:       { bg: 'bg-amber-500/5',   border: 'border-amber-600/30',  dot: 'bg-amber-400'   },
    done:         { bg: 'bg-emerald-500/5', border: 'border-emerald-600/30', dot: 'bg-emerald-400' },
  };

  const visibleStatuses = filters.status
    ? [filters.status as ProductStatus]
    : STATUS_ORDER;

  const gridCls = visibleStatuses.length === 1
    ? 'grid-cols-1'
    : visibleStatuses.length === 2
      ? 'grid-cols-1 md:grid-cols-2'
      : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4';

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Kanban Board</h1>
        {canCreateProduct() && (
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Product
          </button>
        )}
      </div>

      <SearchFilters filters={filters} onChange={setFilters} />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className={`grid ${gridCls} gap-4 flex-1 min-h-0`}>
          {visibleStatuses.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              label={STATUS_LABELS[status]}
              colors={columnColors[status]}
              baseFilters={baseFilters}
              activeProductId={activeProduct?.id ?? null}
              onCardClick={setSelectedProduct}
            />
          ))}
        </div>

        <DragOverlay>
          {activeProduct && <KanbanCardOverlay product={activeProduct} />}
        </DragOverlay>
      </DndContext>

      {selectedProduct && (
        <ProductDetailModal productId={selectedProduct} onClose={() => setSelectedProduct(null)} />
      )}
      {showCreate && (
        <CreateProductModal onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

function KanbanColumn({
  status, label, colors, baseFilters, activeProductId, onCardClick,
}: {
  status: ProductStatus;
  label: string;
  colors: { bg: string; border: string; dot: string };
  baseFilters: Record<string, string>;
  activeProductId: number | null;
  onCardClick: (id: number) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: status });

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: colKey(status, baseFilters),
    queryFn: ({ pageParam }) =>
      productsApi.getPaged({ ...baseFilters, status }, PAGE_SIZE, pageParam as number | undefined),
    getNextPageParam: (lastPage) => lastPage.data.next_cursor ?? undefined,
    initialPageParam: undefined as number | undefined,
  });

  const items: Product[] = data?.pages.flatMap((p) => p.data.data) ?? [];
  // Total comes from the first page's COUNT query — accurate regardless of how many are loaded
  const total: number = data?.pages[0]?.data.total ?? items.length;

  // Keep the drag-source column as a flat list so @dnd-kit can measure all DOM nodes
  const isDragSource = activeProductId !== null && items.some((p) => p.id === activeProductId);
  const shouldVirtualize = items.length > VIRTUAL_THRESHOLD && !isDragSource;

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? items.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CARD_ESTIMATE_PX,
    measureElement: (el) => el.getBoundingClientRect().height,
    overscan: 3,
  });

  return (
    <div
      ref={setDropRef}
      className={`${colors.bg} border ${isOver ? 'border-brand-500/50' : colors.border} rounded-2xl flex flex-col min-h-[200px] transition-colors duration-150`}
    >
      {/* Header */}
      <div className="p-4 border-b border-surface-700/30 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
          <h3 className="font-semibold text-sm">{label}</h3>
          <span className="ml-auto text-xs text-surface-500 bg-surface-800/50 px-2 py-0.5 rounded-full">
            {total}
          </span>
        </div>
      </div>

      {/* Card list */}
      <div ref={parentRef} className="p-2 flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-surface-500 text-xs">
            Drop items here
          </div>
        ) : shouldVirtualize ? (
          /* Virtual list — only visible cards are in the DOM */
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vItem) => (
              <div
                key={vItem.key}
                data-index={vItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${vItem.start}px)`,
                  paddingBottom: '8px',
                }}
              >
                <KanbanCard
                  product={items[vItem.index]}
                  status={status}
                  onClick={() => onCardClick(items[vItem.index].id)}
                />
              </div>
            ))}
          </div>
        ) : (
          /* Flat list — used when item count ≤ threshold or while dragging from this column */
          <div className="space-y-2">
            {items.map((product) => (
              <KanbanCard
                key={product.id}
                product={product}
                status={status}
                onClick={() => onCardClick(product.id)}
              />
            ))}
          </div>
        )}

        {/* Per-column load more */}
        {hasNextPage && (
          <div className="flex justify-center pt-2">
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="flex items-center gap-1.5 text-xs text-surface-400 hover:text-surface-200 px-3 py-1.5 rounded-lg hover:bg-surface-700/30 transition-colors disabled:opacity-50"
            >
              {isFetchingNextPage
                ? <><Loader2 className="w-3 h-3 animate-spin" /> Loading…</>
                : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function KanbanCard({
  product, status, onClick,
}: {
  product: Product;
  status: string;
  onClick: () => void;
}) {
  // useDraggable (not useSortable) — no within-column sort, no transform conflict with virtualizer
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: product.id,
    data: { product, status },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.3 : 1 }}
      className="bg-surface-800/80 border border-surface-700/50 rounded-xl p-3 cursor-pointer card-hover group"
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <div
          {...attributes}
          {...listeners}
          className="text-surface-600 hover:text-surface-400 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity p-1 -ml-1 -mt-1 self-stretch flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Package className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
            <span className="text-xs font-mono text-brand-400">{product.product_id}</span>
          </div>
          <h4 className="text-sm font-medium truncate">{product.customer_name}</h4>
          {product.customer_phone && (
            <p className="text-xs text-surface-500 mt-0.5">{product.customer_phone}</p>
          )}
          {product.description && (
            <p className="text-xs text-surface-400 mt-1.5 line-clamp-2">{product.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Drag overlay card (follows cursor) ──────────────────────────────────────

function KanbanCardOverlay({ product }: { product: Product }) {
  return (
    <div className="bg-surface-800 border border-brand-500/50 rounded-xl p-3 shadow-2xl shadow-brand-500/10 rotate-2">
      <div className="flex items-center gap-2 mb-1">
        <Package className="w-3.5 h-3.5 text-brand-400" />
        <span className="text-xs font-mono text-brand-400">{product.product_id}</span>
      </div>
      <h4 className="text-sm font-medium">{product.customer_name}</h4>
    </div>
  );
}
