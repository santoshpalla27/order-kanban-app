import { tokenManager } from '../utils/tokenManager'
import { WS_URL } from '../api/client'
import type { WsEvent } from '../types'

type Listener = (event: WsEvent) => void

class WebSocketManager {
  private ws: WebSocket | null = null
  private listeners: Set<Listener> = new Set()
  private retryDelay = 2000
  private shouldConnect = false

  async connect() {
    this.shouldConnect = true
    const token = await tokenManager.getAccessToken()
    if (!token) return
    this.createSocket(token)
  }

  disconnect() {
    this.shouldConnect = false
    this.ws?.close(1000, 'logout')
    this.ws = null
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private createSocket(token: string) {
    if (this.ws?.readyState === WebSocket.OPEN) return

    this.ws = new WebSocket(`${WS_URL}?token=${token}`)

    this.ws.onopen = () => {
      this.retryDelay = 2000
    }

    this.ws.onmessage = (e) => {
      try {
        const event: WsEvent = JSON.parse(e.data)
        this.listeners.forEach(fn => fn(event))
      } catch {}
    }

    this.ws.onclose = (e) => {
      if (!this.shouldConnect || e.code === 1000) return
      setTimeout(async () => {
        const t = await tokenManager.getAccessToken()
        if (t && this.shouldConnect) this.createSocket(t)
        this.retryDelay = Math.min(this.retryDelay * 2, 30_000)
      }, this.retryDelay)
    }

    this.ws.onerror = () => {
      this.ws?.close()
    }
  }
}

export const wsManager = new WebSocketManager()
