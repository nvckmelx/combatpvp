import type { ClientMsg, PlayerView, ServerMsg } from '@hj/shared';

type Listener = (msg: ServerMsg) => void;
type StatusListener = (connected: boolean) => void;

/** Одно WebSocket-соединение с сервером: переподключение и возврат на своё место в бою. */
export class Net {
  private ws: WebSocket | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly statusListeners = new Set<StatusListener>();
  private queue: ClientMsg[] = [];
  private retry = 0;
  private retryTimer: number | null = null;
  private stopped = false;
  /** Куда возвращаться после обрыва связи. */
  rejoin: { code: string; token: string; name: string } | null = null;
  connected = false;
  /** Последнее состояние боя — для экрана, который подписался позже, чем оно пришло. */
  lastState: PlayerView | null = null;

  private url(): string {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/ws`;
  }

  connect(): void {
    this.stopped = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    const ws = new WebSocket(this.url());
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.setStatus(true);
      if (this.rejoin) ws.send(JSON.stringify({ t: 'join', ...this.rejoin } satisfies ClientMsg));
      const pending = this.queue;
      this.queue = [];
      for (const msg of pending) ws.send(JSON.stringify(msg));
    };
    ws.onmessage = (event) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (msg.t === 'state') this.lastState = msg.view;
      for (const fn of this.listeners) fn(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.setStatus(false);
      if (this.stopped) return;
      const delay = Math.min(8000, 500 * 2 ** this.retry++);
      this.retryTimer = window.setTimeout(() => this.connect(), delay);
    };
  }

  private setStatus(value: boolean): void {
    this.connected = value;
    for (const fn of this.statusListeners) fn(value);
  }

  send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    else {
      this.queue.push(msg);
      this.connect();
    }
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onStatus(fn: StatusListener): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  /** Полностью закрыть соединение (выход в меню). */
  stop(): void {
    this.stopped = true;
    this.rejoin = null;
    this.lastState = null;
    this.queue = [];
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.ws?.close();
    this.ws = null;
  }
}

export const net = new Net();
