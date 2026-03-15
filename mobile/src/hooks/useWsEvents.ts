import { useEffect, useRef } from 'react'
import { wsManager } from '../websocket/wsManager'
import { useAuthStore } from '../store/authStore'
import { useChatStore } from '../store/chatStore'
import { useNotifStore } from '../store/notificationStore'
import { useBoardStore } from '../store/boardStore'
import { useProductDetailStore } from '../store/productDetailStore'
import type { WsEvent } from '../types'

/**
 * Mount once inside MainTabs. Subscribes to wsManager events and
 * dispatches them to the appropriate stores.
 *
 * chat_message        → append to chatStore, increment unread if not on Chat tab
 * notification        → increment bell badge, prepend to notification list
 * product_created     → boardStore.addProductLocally
 * product_update      → boardStore.updateProductLocally (moves between columns if status changed)
 * product_deleted     → boardStore.removeProductLocally
 * comment_added       → signal ProductDetailScreen to reload comments if that product is open
 * attachment_uploaded → signal ProductDetailScreen to reload attachments if that product is open
 * force_logout        → authStore.logout
 */
export function useWsEvents(isChatActive: () => boolean) {
  const logout = useAuthStore(s => s.logout)

  // Refs so the listener closure always sees latest store state
  const chatRef   = useRef(useChatStore.getState())
  const notifRef  = useRef(useNotifStore.getState())
  const boardRef  = useRef(useBoardStore.getState())
  const detailRef = useRef(useProductDetailStore.getState())

  useEffect(() => {
    const unsubChat   = useChatStore.subscribe(s         => { chatRef.current   = s })
    const unsubNotif  = useNotifStore.subscribe(s        => { notifRef.current  = s })
    const unsubBoard  = useBoardStore.subscribe(s        => { boardRef.current  = s })
    const unsubDetail = useProductDetailStore.subscribe(s => { detailRef.current = s })

    const unsubWs = wsManager.subscribe((event: WsEvent) => {
      switch (event.type) {

        case 'chat_message': {
          const msg = event.payload as any
          chatRef.current.prependMessage(msg)
          if (!isChatActive()) chatRef.current.increment()
          break
        }

        case 'notification': {
          notifRef.current.incrementUnread()
          const newNotif = event.payload as any
          if (newNotif?.id) {
            useNotifStore.setState(s => ({
              notifications: s.notifications.some(n => n.id === newNotif.id)
                ? s.notifications
                : [newNotif, ...s.notifications],
            }))
          }
          break
        }

        case 'product_created': {
          const product = event.payload as any
          if (product?.id) boardRef.current.addProductLocally(product)
          break
        }

        case 'product_update': {
          const product = event.payload as any
          if (product?.id) boardRef.current.updateProductLocally(product)
          break
        }

        case 'product_deleted': {
          const id = (event.payload as any)?.id as number
          if (id) boardRef.current.removeProductLocally(id)
          break
        }

        case 'comment_added': {
          const productId = (event.payload as any)?.product_id as number
          if (productId && detailRef.current.activeId === productId) {
            detailRef.current.signalComment()
          }
          break
        }

        case 'attachment_uploaded': {
          const productId = (event.payload as any)?.product_id as number
          if (productId && detailRef.current.activeId === productId) {
            detailRef.current.signalAttach()
          }
          break
        }

        case 'force_logout': {
          logout()
          break
        }
      }
    })

    return () => {
      unsubChat()
      unsubNotif()
      unsubBoard()
      unsubDetail()
      unsubWs()
    }
  }, [logout, isChatActive])
}
