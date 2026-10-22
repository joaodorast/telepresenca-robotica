import { SIGNALING_WS } from '../../config/env';
import { CLOSE, type ClientMessage, type ServerMessage } from '../../shared/protocol';

export type SignalingState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface SignalingStatus {
  state: SignalingState;
  /** Motivo do fechamento definitivo (token inválido, sessão encerrada, substituída). */
  reason: string | null;
  /** Ida e volta da mensagem de ping ao servidor, em ms (medido). */
  rttMs: number | null;
  attempt: number;
}

type MessageListener = (m: ServerMessage) => void;
type StatusListener = (s: SignalingStatus) => void;

/**
 * Cliente WebSocket com reconexão exponencial e medição de latência.
 * Não tenta reconectar quando o servidor encerra a sessão ou rejeita o token.
 */
export class SignalingClient {
  private ws: WebSocket | null = null;
  private messageListeners = new Set<MessageListener>();
  private statusListeners = new Set<StatusListener>();
  private stopped = true;
  private pingTimer: number | undefined;
  private reconnectTimer: number | undefined;
  private status: SignalingStatus = { state: 'idle', reason: null, rttMs: null, attempt: 0 };

  constructor(private readonly token: string) {}

  connect() {
    if (!this.stopped) return;
    this.stopped = false;
    this.open();
  }

  close() {
    this.stopped = true;
    window.clearTimeout(this.reconnectTimer);
    window.clearInterval(this.pingTimer);
    this.ws?.close(1000, 'cliente saiu');
    this.ws = null;
    this.setStatus({ state: 'closed' });
  }

  send(msg: ClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  onMessage(fn: MessageListener) {
    this.messageListeners.add(fn);
    return () => this.messageListeners.delete(fn);
  }

  onStatus(fn: StatusListener) {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => this.statusListeners.delete(fn);
  }

  get current() {
    return this.status;
  }

  private setStatus(p: Partial<SignalingStatus>) {
    this.status = { ...this.status, ...p };
    this.statusListeners.forEach((fn) => fn(this.status));
  }

  private open() {
    this.setStatus({ state: this.status.attempt > 0 ? 'reconnecting' : 'connecting', reason: null });
    const ws = new WebSocket(`${SIGNALING_WS}?token=${encodeURIComponent(this.token)}`);
    this.ws = ws;

    ws.onopen = () => {
      this.setStatus({ state: 'open', attempt: 0 });
      this.ping();
      window.clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => this.ping(), 4000);
    };

    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      if (msg.type === 'pong') {
        this.setStatus({ rttMs: Math.round(performance.now() - msg.t) });
        return;
      }
      this.messageListeners.forEach((fn) => fn(msg));
    };

    ws.onclose = (ev) => {
      window.clearInterval(this.pingTimer);
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.stopped) return;
      const fatal: Record<number, string> = {
        [CLOSE.INVALID_TOKEN]: 'Link ou token de sessão inválido ou expirado.',
        [CLOSE.SESSION_ENDED]: 'A sessão foi encerrada pelo operador.',
        [CLOSE.REPLACED]: 'Esta sessão foi aberta em outro dispositivo ou aba.',
      };
      if (fatal[ev.code]) {
        this.stopped = true;
        this.setStatus({ state: 'closed', reason: fatal[ev.code], rttMs: null });
        return;
      }
      const attempt = this.status.attempt + 1;
      const delay = Math.min(10_000, 600 * 2 ** Math.min(attempt, 5)) * (0.8 + Math.random() * 0.4);
      this.setStatus({ state: 'reconnecting', attempt, rttMs: null });
      this.reconnectTimer = window.setTimeout(() => this.open(), delay);
    };
  }

  private ping() {
    this.send({ type: 'ping', t: performance.now() });
  }
}
