import { create } from 'zustand'
import { productApi } from '../api/services'
import type { Product } from '../types'

const PAGE_SIZE = 10

export const STATUSES = ['yet_to_start', 'working', 'review', 'done'] as const
export type BoardStatus = typeof STATUSES[number]

export interface BoardFilters {
  search:        string
  created_by:    string
  assigned_to:   string
  date_from:     string
  date_to:       string
  delivery_from: string
  delivery_to:   string
}

export const emptyFilters = (): BoardFilters => ({
  search: '', created_by: '', assigned_to: '',
  date_from: '', date_to: '', delivery_from: '', delivery_to: '',
})

export interface ColumnState {
  data:          Product[]
  total:         number
  nextCursor:    number | null
  hasMore:       boolean
  isLoading:     boolean
  isLoadingMore: boolean
}

const emptyColumn = (): ColumnState => ({
  data: [], total: 0, nextCursor: null, hasMore: false, isLoading: false, isLoadingMore: false,
})

interface BoardState {
  columns:      Record<string, ColumnState>
  filters:      BoardFilters
  isRefreshing: boolean
  error:        string | null
  fetchAll:     (filters?: Partial<BoardFilters>) => Promise<void>
  loadMore:     (status: string) => Promise<void>
  refresh:      () => Promise<void>
  setSearch:    (q: string) => void
  setFilters:   (f: Partial<BoardFilters>) => void
  resetFilters: () => void
  updateProductLocally: (p: Product) => void
  removeProductLocally: (id: number) => void
  addProductLocally:    (p: Product) => void
}

const parseRes = (res: any) => ({
  data:       Array.isArray(res) ? (res as Product[]) : ((res.data ?? []) as Product[]),
  total:      Array.isArray(res) ? (res as Product[]).length : (res.total ?? 0),
  hasMore:    Array.isArray(res) ? false : !!(res.has_more),
  nextCursor: Array.isArray(res) ? null : (res.next_cursor ?? null),
})

function toApiParams(f: BoardFilters, status: string) {
  const p: Record<string, string | number> = { limit: PAGE_SIZE, status }
  if (f.search)        p.search        = f.search
  if (f.created_by)    p.created_by    = f.created_by
  if (f.assigned_to)   p.assigned_to   = f.assigned_to
  if (f.date_from)     p.date_from     = f.date_from
  if (f.date_to)       p.date_to       = f.date_to
  if (f.delivery_from) p.delivery_from = f.delivery_from
  if (f.delivery_to)   p.delivery_to   = f.delivery_to
  return p
}

export const useBoardStore = create<BoardState>((set, get) => ({
  columns:      Object.fromEntries(STATUSES.map(s => [s, emptyColumn()])),
  filters:      emptyFilters(),
  isRefreshing: false,
  error:        null,

  fetchAll: async (overrideFilters) => {
    const f = overrideFilters ? { ...get().filters, ...overrideFilters } : get().filters
    set(s => ({
      error: null,
      columns: Object.fromEntries(
        STATUSES.map(status => [status, { ...s.columns[status], isLoading: true }])
      ),
    }))

    await Promise.all(STATUSES.map(async (status) => {
      try {
        const res: any = await productApi.list(toApiParams(f, status) as any)
        const { data, total, hasMore, nextCursor } = parseRes(res)
        set(s => ({
          columns: {
            ...s.columns,
            [status]: { data, total, hasMore, nextCursor, isLoading: false, isLoadingMore: false },
          },
        }))
      } catch {
        set(s => ({
          columns: { ...s.columns, [status]: { ...s.columns[status], isLoading: false } },
        }))
      }
    }))
  },

  loadMore: async (status) => {
    const col = get().columns[status]
    if (!col.hasMore || !col.nextCursor || col.isLoadingMore) return
    set(s => ({
      columns: { ...s.columns, [status]: { ...s.columns[status], isLoadingMore: true } },
    }))
    try {
      const params = { ...toApiParams(get().filters, status), cursor: col.nextCursor } as any
      const res: any = await productApi.list(params)
      const { data: newData, hasMore, nextCursor } = parseRes(res)
      set(s => ({
        columns: {
          ...s.columns,
          [status]: {
            ...s.columns[status],
            data: [...s.columns[status].data, ...newData],
            hasMore,
            nextCursor,
            isLoadingMore: false,
          },
        },
      }))
    } catch {
      set(s => ({
        columns: { ...s.columns, [status]: { ...s.columns[status], isLoadingMore: false } },
      }))
    }
  },

  refresh: async () => {
    set({ isRefreshing: true })
    await get().fetchAll()
    set({ isRefreshing: false })
  },

  setSearch: (q) => {
    const f = { ...get().filters, search: q }
    set({ filters: f })
    get().fetchAll(f)
  },

  setFilters: (partial) => {
    const f = { ...get().filters, ...partial }
    set({ filters: f })
    get().fetchAll(f)
  },

  resetFilters: () => {
    const f = emptyFilters()
    set({ filters: f })
    get().fetchAll(f)
  },

  updateProductLocally: (p) =>
    set(s => ({
      columns: Object.fromEntries(
        STATUSES.map(status => {
          const col   = s.columns[status]
          const hadIt = col.data.some(x => x.id === p.id)
          if (p.status === status) {
            return [status, {
              ...col,
              data:  hadIt ? col.data.map(x => x.id === p.id ? p : x) : [p, ...col.data],
              total: hadIt ? col.total : col.total + 1,
            }]
          } else {
            return [status, {
              ...col,
              data:  col.data.filter(x => x.id !== p.id),
              total: hadIt ? Math.max(0, col.total - 1) : col.total,
            }]
          }
        })
      ),
    })),

  removeProductLocally: (id) =>
    set(s => ({
      columns: Object.fromEntries(
        STATUSES.map(status => {
          const col   = s.columns[status]
          const hadIt = col.data.some(x => x.id === id)
          return [
            status,
            { ...col, data: col.data.filter(x => x.id !== id), total: hadIt ? Math.max(0, col.total - 1) : col.total },
          ]
        })
      ),
    })),

  addProductLocally: (p) =>
    set(s => ({
      columns: {
        ...s.columns,
        [p.status]: {
          ...s.columns[p.status],
          data:  [p, ...s.columns[p.status].data],
          total: s.columns[p.status].total + 1,
        },
      },
    })),
}))
