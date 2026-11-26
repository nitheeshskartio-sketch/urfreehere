import { keyMatchesId } from './identity';
import type { ChatSession, Route, SessionCallbacks } from './peer';
import type { SignalData } from './signaling';
import type { PublicJwk, UserId } from './types';

/**
 * Server relay: when two people can't connect directly (strict NATs, no TURN
 * server), the same messages, sync and file transfers go over the signaling
 * socket instead. The server forwards each frame to the other person's socket
 * and stores nothing. Every chat event is still signed by its author and
 * verified on arrival, exactly as over WebRTC.
 *
 * Frames (`k`): m = control message, p = part of a large control message,
 * o = open file channel, d = file channel data, c = close file channel,
 * x = session closed.
 */
export type RelayFrame =
  | { k: 'm'; m: string }
  | { k: 'p'; id: string; i: number; n: number; d: string }
  | { k: 'o'; c: string }
  | { k: 'd'; c: string; s?: string; b?: ArrayBuffer }
  | { k: 'c'; c: string }
  | { k: 'x' };

/** Sends one frame to the peer; resolves false when the server refused it. */
export type RelaySend = (frame: RelayFrame) => Promise<boolean>;

/** Socket.IO messages are capped at 64 KB on the server; stay well below. */
const FRAME = 32 * 1024;
const CHUNK = 16 * 1024;

export class RelaySession implements ChatSession {
  state: 'connecting' | 'open' | 'closed' = 'open';
  route: Route = 'server';
  peerKey: PublicJwk | null = null;
  readonly createdAt = Date.now();
  readonly asked = new Set<string>();
  readonly viaServer = true;
  readonly maxChunk = CHUNK;
  private channels = new Map<string, RelayChannel>();
  private parts = new Map<string, string[]>();

  constructor(
    readonly peerId: UserId,
    private readonly emit: RelaySend,
    private readonly cb: Pick<SessionCallbacks, 'onMessage' | 'onClose' | 'onFileChannel' | 'onPeerKey'>,
  ) {}

  /** Messages are handled one after another so the key from "hello" is known before any event. */
  private queue: Promise<void> = Promise.resolve();

  /** Frames go out in order; a refused frame (peer gone, budget used up) ends the session. */
  frame(f: RelayFrame): Promise<boolean> {
    if (this.state === 'closed') return Promise.resolve(false);
    return this.emit(f).then((ok) => {
      if (!ok) this.close('relay-failed');
      return ok;
    });
  }

  send(msg: Record<string, unknown>): boolean {
    if (this.state !== 'open') return false;
    const text = JSON.stringify(msg);
    if (text.length <= FRAME) void this.frame({ k: 'm', m: text });
    else {
      const id = Math.random().toString(36).slice(2);
      const n = Math.ceil(text.length / FRAME);
      for (let i = 0; i < n; i++) void this.frame({ k: 'p', id, i, n, d: text.slice(i * FRAME, (i + 1) * FRAME) });
    }
    return true;
  }

  /** A frame from the peer, forwarded by the server. */
  receive(raw: unknown) {
    if (this.state === 'closed' || !raw || typeof raw !== 'object') return;
    const f = raw as Record<string, unknown>;
    switch (f.k) {
      case 'm':
        if (typeof f.m === 'string') this.deliver(f.m);
        break;
      case 'p': {
        const id = String(f.id);
        const n = Number(f.n);
        const i = Number(f.i);
        if (!Number.isInteger(n) || n < 1 || n > 200 || !Number.isInteger(i) || i < 0 || i >= n) return;
        const list = this.parts.get(id) ?? new Array<string>(n);
        list[i] = String(f.d ?? '');
        this.parts.set(id, list);
        if (list.filter((x) => x !== undefined).length === n) {
          this.parts.delete(id);
          this.deliver(list.join(''));
        }
        break;
      }
      case 'o': {
        const label = String(f.c);
        if (!label.startsWith('file:') || this.channels.has(label)) return;
        const ch = new RelayChannel(label, this, true);
        this.channels.set(label, ch);
        this.cb.onFileChannel(this, ch as unknown as RTCDataChannel);
        break;
      }
      case 'd':
        this.channels.get(String(f.c))?.deliver(typeof f.s === 'string' ? f.s : (f.b as ArrayBuffer | undefined));
        break;
      case 'c':
        this.channels.get(String(f.c))?.closeLocal(false);
        break;
      case 'x':
        this.close('peer-closed', false);
        break;
    }
  }

  private deliver(text: string) {
    if (text.length > 256 * 1024) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    this.queue = this.queue.then(async () => {
      if (this.state === 'closed') return;
      // No DTLS handshake here: the sender includes its public key, which must hash to its chat ID.
      if (msg.t === 'hello' && msg.pub && !this.peerKey && (await keyMatchesId(msg.pub, this.peerId).catch(() => false))) {
        this.peerKey = msg.pub as PublicJwk;
        this.cb.onPeerKey(this, this.peerKey);
      }
      this.cb.onMessage(this, msg);
    });
  }

  openFileChannel(label: string): RTCDataChannel {
    const ch = new RelayChannel(label, this, false);
    this.channels.set(label, ch);
    void this.frame({ k: 'o', c: label }).then((ok) => (ok ? ch.markOpen() : ch.closeLocal(false)));
    return ch as unknown as RTCDataChannel;
  }

  forget(label: string) {
    this.channels.delete(label);
  }

  close(reason: string, notifyPeer = true) {
    if (this.state === 'closed') return;
    // Tell the other side, unless it's gone or the relay itself failed.
    if (notifyPeer && reason !== 'relay-failed' && reason !== 'offline') void this.emit({ k: 'x' });
    this.state = 'closed';
    for (const ch of this.channels.values()) ch.closeLocal(false);
    this.channels.clear();
    this.cb.onClose(this, reason);
  }

  async handleSignal(_data: SignalData) {
    /* WebRTC signals don't apply to a relayed session */
  }

  async detectRoute(): Promise<Route> {
    return 'server';
  }
}

/**
 * Just enough of RTCDataChannel for sendFile/receiveFile, carried as relay
 * frames. bufferedAmount counts bytes the server hasn't acknowledged yet, so
 * the sender's backpressure works the same way.
 */
class RelayChannel extends EventTarget {
  readyState: RTCDataChannelState;
  binaryType: BinaryType = 'arraybuffer';
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: Event) => void) | null = null;
  onopen: ((ev: Event) => void) | null = null;

  constructor(
    readonly label: string,
    private readonly session: RelaySession,
    open: boolean,
  ) {
    super();
    this.readyState = open ? 'open' : 'connecting';
  }

  markOpen() {
    if (this.readyState !== 'connecting') return;
    this.readyState = 'open';
    const ev = new Event('open');
    this.dispatchEvent(ev);
    this.onopen?.(ev);
  }

  send(data: string | ArrayBuffer | ArrayBufferView) {
    if (this.readyState !== 'open') throw new Error('closed');
    let frame: RelayFrame;
    let size: number;
    if (typeof data === 'string') {
      frame = { k: 'd', c: this.label, s: data };
      size = data.length;
    } else {
      // Copy exactly the bytes of a view, not its whole underlying buffer.
      const b = data instanceof ArrayBuffer ? data : (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
      frame = { k: 'd', c: this.label, b };
      size = b.byteLength;
    }
    this.bufferedAmount += size;
    void this.session.frame(frame).then((ok) => {
      this.bufferedAmount = Math.max(0, this.bufferedAmount - size);
      if (!ok) return this.closeLocal(false);
      if (this.bufferedAmount <= this.bufferedAmountLowThreshold) this.dispatchEvent(new Event('bufferedamountlow'));
    });
  }

  deliver(data: string | ArrayBuffer | undefined) {
    if (this.readyState !== 'open' || data === undefined) return;
    const ev = new MessageEvent('message', { data });
    this.dispatchEvent(ev);
    this.onmessage?.(ev);
  }

  close() {
    this.closeLocal(true);
  }

  closeLocal(notifyPeer: boolean) {
    if (this.readyState === 'closed') return;
    const wasOpen = this.readyState === 'open';
    this.readyState = 'closed';
    // Let queued chunks go first: frames are delivered in order.
    if (notifyPeer && wasOpen) void this.session.frame({ k: 'c', c: this.label });
    this.session.forget(this.label);
    const ev = new Event('close');
    this.dispatchEvent(ev);
    this.onclose?.(ev);
  }
}
