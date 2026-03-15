import { create } from 'zustand'

/**
 * Tracks which product detail screen is currently open so that
 * useWsEvents can signal it to reload comments/attachments in real-time.
 */
interface ProductDetailState {
  activeId:       number | null
  commentSignal:  number   // increment to trigger comment reload
  attachSignal:   number   // increment to trigger attachment reload
  setActiveId:    (id: number | null) => void
  signalComment:  () => void
  signalAttach:   () => void
}

export const useProductDetailStore = create<ProductDetailState>(set => ({
  activeId:      null,
  commentSignal: 0,
  attachSignal:  0,
  setActiveId:   (id)  => set({ activeId: id }),
  signalComment: ()    => set(s => ({ commentSignal: s.commentSignal + 1 })),
  signalAttach:  ()    => set(s => ({ attachSignal:  s.attachSignal  + 1 })),
}))
