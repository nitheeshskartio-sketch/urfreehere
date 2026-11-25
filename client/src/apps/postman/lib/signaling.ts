import { io, type Socket } from 'socket.io-client';
import { TransferError, type ErrorCode } from './errors';

export interface IceConfig {
  iceServers: RTCIceServer[];
  iceTransportPolicy: RTCIceTransportPolicy;
  turnEnabled: boolean;
}

export interface RoomInfo {
  code: string;
  token: string;
  expiresAt: number;
  ice: IceConfig;
}

export type SignalMessage =
  | { kind: 'offer' | 'answer'; sdp: string }
  | { kind: 'ice'; candidate: RTCIceCandidateInit }
  | { kind: 'ice-end' };

export interface SignalingHandlers {
  onPeerJoined?(): void;
  onPeerLeft?(): void;
  onRoomClosed?(reason: 'host-left' | 'expired' | 'lost'): void;
  onSignal?(message: SignalMessage): void;
  /** Signaling socket is gone for good (reconnection attempts exhausted). */
  onConnectionLost?(): void;
}

const SIGNALING_URL: string | undefined = import.meta.env.VITE_SIGNALING_URL || undefined;
const ACK_TIMEOUT = 10_000;

/**
 * Socket.IO signaling client. Carries only room coordination and WebRTC
 * offer/answer/ICE messages — never file data.
 */
export class Signaling {
  private socket: Socket;
  private room: { code: string; token: string } | null = null;
  private closed = false;

  constructor(private readonly handlers: SignalingHandlers) {
    this.socket = io(SIGNALING_URL, {
      autoConnect: false,
      reconnectionAttempts: 8,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
      timeout: ACK_TIMEOUT,
    });

    this.socket.on('peer:joined', () => this.handlers.onPeerJoined?.());
    this.socket.on('peer:left', () => this.handlers.onPeerLeft?.());
    this.socket.on('room:closed', (p: { reason?: string } | undefined) => {
      this.room = null;
      this.handlers.onRoomClosed?.(p?.reason === 'expired' ? 'expired' : 'host-left');
    });
    this.socket.on('signal', (msg: SignalMessage) => this.handlers.onSignal?.(msg));

    // After a reconnect (e.g. phone came back from background), reclaim our seat.
    this.socket.io.on('reconnect', () => {
      if (!this.room || this.closed) return;
      this.socket
        .timeout(ACK_TIMEOUT)
        .emit('room:resume', this.room, (err: Error | null, res: { ok: boolean } | undefined) => {
          if (err || !res?.ok) {
            this.room = null;
            this.handlers.onRoomClosed?.('lost');
          }
        });
    });
    this.socket.io.on('reconnect_failed', () => {
      if (!this.closed) this.handlers.onConnectionLost?.();
    });
  }

  connect(): Promise<void> {
    if (this.socket.connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new TransferError('SIGNALING_UNAVAILABLE'));
      }, ACK_TIMEOUT);
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const onError = (err: Error) => {
        if (err.message === 'RATE_LIMITED') {
          cleanup();
          this.socket.disconnect();
          reject(new TransferError('RATE_LIMITED'));
        }
        // Otherwise Socket.IO keeps retrying until the timeout above.
      };
      const cleanup = () => {
        window.clearTimeout(timer);
        this.socket.off('connect', onConnect);
        this.socket.off('connect_error', onError);
      };
      this.socket.on('connect', onConnect);
      this.socket.on('connect_error', onError);
      this.socket.connect();
    });
  }

  private request<T>(event: string, payload: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      this.socket
        .timeout(ACK_TIMEOUT)
        .emit(event, payload, (err: Error | null, res: ({ ok: true } & T) | { ok: false; error: ErrorCode }) => {
          if (err) return reject(new TransferError('SIGNALING_UNAVAILABLE'));
          if (!res.ok) return reject(new TransferError(res.error));
          resolve(res);
        });
    });
  }

  async createRoom(): Promise<RoomInfo> {
    await this.connect();
    const room = await this.request<RoomInfo>('room:create', {});
    this.room = { code: room.code, token: room.token };
    return room;
  }

  async joinRoom(code: string): Promise<RoomInfo> {
    await this.connect();
    const room = await this.request<RoomInfo>('room:join', { code });
    this.room = { code: room.code, token: room.token };
    return room;
  }

  send(message: SignalMessage) {
    if (!this.closed) this.socket.emit('signal', message);
  }

  /** Leaves the room (server frees it) and closes the socket. */
  close() {
    if (this.closed) return;
    this.closed = true;
    // Even without a confirmed room: a create/join may be in flight.
    if (this.socket.connected) this.socket.emit('room:leave');
    this.room = null;
    this.socket.removeAllListeners();
    this.socket.io.removeAllListeners();
    // Give the leave message a moment to flush before disconnecting.
    window.setTimeout(() => this.socket.disconnect(), 200);
  }
}
