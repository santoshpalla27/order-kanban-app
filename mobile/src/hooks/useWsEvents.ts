import { useEffect, useRef } from 'react'
import { wsManager } from '../websocket/wsManager'
import { useAuthStore } from '../store/authStore'
import { useChatStore } from '../store/chatStore'
import { useNotifStore } from '../store/notificationStore'
import { useBoardStore } from '../store/boardStore'
import type { WsEvent } from '../types'

/**
 * Mount once inside MainTabs. Subscribes to wsManager events and
 * dispatches them to the appropriate stores.
 *
 * Event types mirror the web's useWebSocket hook:
 *   chat_message       → append to chatStore, increment unread if not reading chat
 *   notification       → increment notifStore.unreadCount, prepend to list
 *   product_created    → boardStore.addProductLocally
 *   product_update     → boardStore.updateProductLocally
 *   product_deleted    → boardStore.removeProductLocally
 *   force_logout       → authStore.logout
 */
export function useWsEvents(isChatActive: () => boolean) {
  const logout = useAuthStore(s => s.logout)

  // Use refs so the listener closure always sees current store actions
  const chatRef  = useRef(useChatStore.getState())
  const notifRef = useRef(useNotifStore.getState())
  const boardRef = useRef(useBoardStore.getState())

  useEffect(() => {
    const unsubChat  = useChatStore.subscribe(s  => { chatRef.current  = s })
    const unsubNotif = useNotifStore.subscribe(s => { notifRef.current = s })
    const unsubBoard = useBoardStore.subscribe(s => { boardRef.current = s })

    const unsubWs = wsManager.subscribe((event: WsEvent) => {
      switch (event.type) {

        case 'chat_message': {
          const msg = event.payload as any
          chatRef.current.prependMessage(msg)
          if (!isChatActive()) {
            chatRef.current.increment()
          }
          break
        }

        case 'notification': {
          notifRef.current.incrementUnread()
          // If the notification list is already loaded, prepend it so the
          // Notifications screen shows it immediately on next open.
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
      unsubWs()
    }
  }, [logout, isChatActive])
}
