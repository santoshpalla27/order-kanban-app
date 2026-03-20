import { create } from 'zustand';

export interface ProductFilters {
  search: string;
  status: string;
  created_by: string;
  assigned_to: string;
  date_from: string;
  date_to: string;
  delivery_from: string;
  delivery_to: string;
}

interface BoardStore {
  filters: ProductFilters;
  setFilters: (f: Partial<ProductFilters>) => void;
  resetFilters: () => void;
}

const DEFAULT_FILTERS: ProductFilters = {
  search: '',
  status: '',
  created_by: '',
  assigned_to: '',
  date_from: '',
  date_to: '',
  delivery_from: '',
  delivery_to: '',
};

export const useBoardStore = create<BoardStore>((set) => ({
  filters: DEFAULT_FILTERS,
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
}));
