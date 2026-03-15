import { create } from 'zustand'
import { productApi } from '../api/services'
import type { Product } from '../types'

const PAGE_SIZE = 10

export const STATUSES = ['yet_to_start', 'working', 'review', 'done'] as const
export type BoardStatus = typeof STATUSES[number]

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
  columns:     Record<string, ColumnState>
  search:      string
  isRefreshing: boolean
  error:       string | null
  fetchAll:    (search?: string) => Promise<void>
  loadMore:    (status: string) => Promise<void>
  refresh:     () => Promise<void>
  setSearch:   (q: string) => void
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

export const useBoardStore = create<BoardState>((set, get) => ({
  columns:      Object.fromEntries(STATUSES.map(s => [s, emptyColumn()])),
  search:       '',
  isRefreshing: false,
  error:        null,

  fetchAll: async (search) => {
    const q = search ?? get().search
    // Mark all columns as loading
    set(s => ({
      error: null,
      columns: Object.fromEntries(
        STATUSES.map(status => [status, { ...s.columns[status], isLoading: true }])
      ),
    }))

    await Promise.all(STATUSES.map(async (status) => {
      try {
        const res: any = await productApi.list({
          status,
          search: q || undefined,
          limit: PAGE_SIZE,
        })
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
      const res: any = await productApi.list({
        status,
        search: get().search || undefined,
        limit: PAGE_SIZE,
        cursor: col.nextCursor,
      })
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
    set({ search: q })
    get().fetchAll(q || undefined)
  },

  updateProductLocally: (p) =>
    set(s => ({
      columns: Object.fromEntries(
        STATUSES.map(status => {
          const col   = s.columns[status]
          const hadIt = col.data.some(x => x.id === p.id)
          if (p.status === status) {
            // Correct column: update in-place or insert at top if moved here
            return [status, {
              ...col,
              data:  hadIt ? col.data.map(x => x.id === p.id ? p : x) : [p, ...col.data],
              total: hadIt ? col.total : col.total + 1,
            }]
          } else {
            // Wrong column: remove if it was here (status changed away)
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
          const col = s.columns[status]
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
