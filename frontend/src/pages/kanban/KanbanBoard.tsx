import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productsApi } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { Product, STATUS_LABELS, STATUS_ORDER, ProductStatus } from '../../types';
import SearchFilters from '../../components/SearchFilters';
import ProductDetailModal from '../../components/ProductDetailModal';
import CreateProductModal from '../../components/CreateProductModal';
import {
  DndContext, closestCorners, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, DragOverEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, GripVertical, Package } from 'lucide-react';

export default function KanbanBoard() {
  const [filters, setFilters] = useState({ search: '', status: '', created_by: '', date_from: '', date_to: '' });
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const { canCreateProduct } = useAuthStore();
  const queryClient = useQueryClient();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

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

  const columns = STATUS_ORDER.map((status) => ({
    status,
    label: STATUS_LABELS[status],
    items: products.filter((p) => p.status === status),
  }));

  const columnColors: Record<ProductStatus, { bg: string; border: string; dot: string }> = {
    yet_to_start: { bg: 'bg-gray-500/5', border: 'border-gray-600/30', dot: 'bg-gray-400' },
    working: { bg: 'bg-blue-500/5', border: 'border-blue-600/30', dot: 'bg-blue-400' },
    review: { bg: 'bg-amber-500/5', border: 'border-amber-600/30', dot: 'bg-amber-400' },
    done: { bg: 'bg-emerald-500/5', border: 'border-emerald-600/30', dot: 'bg-emerald-400' },
  };

  const handleDragStart = (event: DragStartEvent) => {
    const product = products.find((p) => p.id === event.active.id);
    setActiveProduct(product || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveProduct(null);
    const { active, over } = event;
    if (!over) return;

    const productId = active.id as number;
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    // Determine target status
    let targetStatus: string;
    if (STATUS_ORDER.includes(over.id as ProductStatus)) {
      targetStatus = over.id as string;
    } else {
      const overProduct = products.find((p) => p.id === over.id);
      targetStatus = overProduct?.status || product.status;
    }

    if (targetStatus !== product.status) {
      statusMutation.mutate({ id: productId, status: targetStatus });
    }
  };

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

      {isLoading ? (
        <div className="flex justify-center py-12 flex-1">
          <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 flex-1 min-h-0">
            {columns.map((col) => (
              <KanbanColumn
                key={col.status}
                status={col.status as ProductStatus}
                label={col.label}
                items={col.items}
                colors={columnColors[col.status as ProductStatus]}
                onCardClick={setSelectedProduct}
              />
            ))}
          </div>

          <DragOverlay>
            {activeProduct && <KanbanCardOverlay product={activeProduct} />}
          </DragOverlay>
        </DndContext>
      )}

      {selectedProduct && (
        <ProductDetailModal productId={selectedProduct} onClose={() => setSelectedProduct(null)} />
      )}
      {showCreate && (
        <CreateProductModal onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}

function KanbanColumn({
  status, label, items, colors, onCardClick,
}: {
  status: ProductStatus;
  label: string;
  items: Product[];
  colors: { bg: string; border: string; dot: string };
  onCardClick: (id: number) => void;
}) {
  const { setNodeRef } = useSortable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={`${colors.bg} border ${colors.border} rounded-2xl flex flex-col min-h-[200px]`}
    >
      <div className="p-4 border-b border-surface-700/30">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
          <h3 className="font-semibold text-sm">{label}</h3>
          <span className="ml-auto text-xs text-surface-500 bg-surface-800/50 px-2 py-0.5 rounded-full">
            {items.length}
          </span>
        </div>
      </div>

      <div className="p-2 flex-1 overflow-y-auto space-y-2">
        <SortableContext items={items.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          {items.map((product) => (
            <KanbanCard key={product.id} product={product} onClick={() => onCardClick(product.id)} />
          ))}
        </SortableContext>
        {items.length === 0 && (
          <div className="flex items-center justify-center h-20 text-surface-500 text-xs">
            Drop items here
          </div>
        )}
      </div>
    </div>
  );
}

function KanbanCard({ product, onClick }: { product: Product; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: product.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
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
