import { getWsUrl } from '../utils/config';

type MessageHandler = (data: any) => void;

class WSManager {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private shouldReconnect = false;

  connect(token: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.token === token) return;
    this.token = token;
    this.shouldReconnect = true;
    this._open();
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  addHandler(fn: MessageHandler) {
    this.handlers.add(fn);
  }

  removeHandler(fn: MessageHandler) {
    this.handlers.delete(fn);
  }

  private _open() {
    if (!this.token) return;
    try {
      this.ws = new WebSocket(getWsUrl(this.token));

      this.ws.onopen = () => {
        console.log('[WS] connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handlers.forEach((fn) => fn(data));
        } catch {}
      };

      this.ws.onclose = () => {
        console.log('[WS] disconnected');
        if (this.shouldReconnect) {
          this.reconnectTimer = setTimeout(() => this._open(), 3000);
        }
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch (e) {
      console.warn('[WS] open error', e);
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => this._open(), 3000);
      }
    }
  }
}

export const wsManager = new WSManager();
