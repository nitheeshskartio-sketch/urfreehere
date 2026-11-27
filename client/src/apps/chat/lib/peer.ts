import { keyMatchesId, sign, verify, type Identity } from './identity';
import type { IceConfig, SignalData } from './signaling';
import type { PublicJwk, UserId } from './types';

/** direct: peer to peer · relay: through a TURN server · server: forwarded by our signaling server */
export type Route = 'direct' | 'relay' | 'server';

/** What the engine needs from a connection to a peer, WebRTC or server relay. */
export interface ChatSession {
  readonly peerId: UserId;
  state: 'connecting' | 'open' | 'closed';
  route: Route | null;
  peerKey: PublicJwk | null;
  readonly createdAt: number;
  /** Conversations we've already asked this peer to sync during this connection. */
  readonly asked: Set<string>;
  /** Forwarded by the Humble server instead of a WebRTC connection. */
  readonly viaServer: boolean;
  /** Largest binary chunk to send in one message. */
  readonly maxChunk: number;
  send(msg: Record<string, unknown>): boolean;
  close(reason: string): void;
  handleSignal(data: SignalData): Promise<void>;
  detectRoute(): Promise<Route | null>;
  openFileChannel(label: string): RTCDataChannel;
}

export interface SessionCallbacks {
  signal(data: SignalData): void;
  onOpen(session: ChatSession): void;
  onMessage(session: ChatSession, msg: Record<string, unknown>): void;
  onClose(session: ChatSession, reason: string): void;
  onFileChannel(session: ChatSession, channel: RTCDataChannel): void;
  /** First time we learn the peer's verified public key. */
  onPeerKey(session: ChatSession, jwk: PublicJwk): void;
}

const CONNECT_TIMEOUT = 15_000;
const DISCONNECT_GRACE = 8_000;
/** Larger control messages are split so they fit every browser's SCTP limit. */
const FRAME = 48 * 1024;

function fingerprints(sdp: string): string {
  return sdp
    .split(/\r?\n/)
    .filter((l) => l.startsWith('a=fingerprint:'))
    .map((l) => l.trim().toLowerCase())
    .sort()
    .join('|');
}

/**
 * One WebRTC connection to one peer.
 *
 * Authentication: each side signs its DTLS certificate fingerprint with its
 * identity key, and the other side checks it against the peer's user ID
 * (which is derived from that key). A signaling server that swapped the SDP
 * to insert itself would fail this check.
 */
export class PeerSession implements ChatSession {
  readonly pc: RTCPeerConnection;
  readonly viaServer = false;
  ctl: RTCDataChannel | null = null;
  state: 'connecting' | 'open' | 'closed' = 'connecting';
  route: Route | null = null;
  peerKey: PublicJwk | null = null;
  readonly createdAt = Date.now();
  /** Conversations we've already asked this peer to sync during this connection. */
  readonly asked = new Set<string>();
  private pendingIce: RTCIceCandidateInit[] = [];
  private remoteSet = false;
  private timer: number;
  private discTimer: number | undefined;
  private parts = new Map<string, string[]>();

  constructor(
    private readonly identity: Identity,
    readonly peerId: UserId,
    ice: IceConfig,
    readonly offerer: boolean,
    private readonly cb: SessionCallbacks,
    private readonly expectedKey?: PublicJwk,
  ) {
    this.pc = new RTCPeerConnection({ iceServers: ice.iceServers, iceTransportPolicy: ice.iceTransportPolicy });
    this.pc.onicecandidate = (e) => {
      if (e.candidate && this.state !== 'closed') this.cb.signal({ kind: 'ice', candidate: e.candidate.toJSON() });
    };
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === 'failed') this.close('failed');
      else if (s === 'disconnected') {
        window.clearTimeout(this.discTimer);
        this.discTimer = window.setTimeout(() => {
          if (this.pc.connectionState !== 'connected') this.close('disconnected');
        }, DISCONNECT_GRACE);
      } else if (s === 'connected') {
        window.clearTimeout(this.discTimer);
        void this.detectRoute();
      }
    };
    this.pc.ondatachannel = (e) => {
      if (e.channel.label === 'ctl') this.attachCtl(e.channel);
      else if (e.channel.label.startsWith('file:')) this.cb.onFileChannel(this, e.channel);
      else e.channel.close();
    };
    this.timer = window.setTimeout(() => {
      if (this.state === 'connecting') this.close('timeout');
    }, CONNECT_TIMEOUT);
  }

  async start() {
    this.attachCtl(this.pc.createDataChannel('ctl', { ordered: true }));
    try {
      await this.pc.setLocalDescription(await this.pc.createOffer());
      await this.sendDescription('offer');
    } catch {
      this.close('offer-failed');
    }
  }

  private async sendDescription(kind: 'offer' | 'answer') {
    const sdp = this.pc.localDescription!.sdp;
    const sig = await sign(this.identity, `urfree-chat-dtls|${kind}|${this.identity.userId}|${this.peerId}|${fingerprints(sdp)}`);
    this.cb.signal({ kind, sdp, pub: this.identity.publicJwk, sig });
  }

  private async verifyDescription(kind: 'offer' | 'answer', data: SignalData): Promise<boolean> {
    const sdp = data.sdp as string;
    const pub = data.pub as PublicJwk;
    if (typeof sdp !== 'string' || sdp.length > 32_000 || typeof data.sig !== 'string') return false;
    if (!(await keyMatchesId(pub, this.peerId))) return false;
    if (this.expectedKey && (this.expectedKey.x !== pub.x || this.expectedKey.y !== pub.y)) return false;
    const ok = await verify(pub, `urfree-chat-dtls|${kind}|${this.peerId}|${this.identity.userId}|${fingerprints(sdp)}`, data.sig);
    if (ok && !this.peerKey) {
      this.peerKey = pub;
      this.cb.onPeerKey(this, pub);
    }
    return ok;
  }

  async handleSignal(data: SignalData) {
    if (this.state === 'closed') return;
    try {
      if (data.kind === 'offer' && !this.offerer) {
        if (!(await this.verifyDescription('offer', data))) return this.close('bad-signature');
        await this.pc.setRemoteDescription({ type: 'offer', sdp: data.sdp as string });
        await this.flushIce();
        await this.pc.setLocalDescription(await this.pc.createAnswer());
        await this.sendDescription('answer');
      } else if (data.kind === 'answer' && this.offerer) {
        if (this.pc.signalingState !== 'have-local-offer') return;
        if (!(await this.verifyDescription('answer', data))) return this.close('bad-signature');
        await this.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp as string });
        await this.flushIce();
      } else if (data.kind === 'ice' && data.candidate && typeof data.candidate === 'object') {
        if (this.remoteSet) await this.pc.addIceCandidate(data.candidate as RTCIceCandidateInit).catch(() => {});
        else this.pendingIce.push(data.candidate as RTCIceCandidateInit);
      } else if (data.kind === 'bye') {
        this.close('peer-closed');
      }
    } catch {
      this.close('signal-error');
    }
  }

  private async flushIce() {
    this.remoteSet = true;
    for (const c of this.pendingIce.splice(0)) await this.pc.addIceCandidate(c).catch(() => {});
  }

  private attachCtl(channel: RTCDataChannel) {
    this.ctl = channel;
    const open = () => {
      if (this.state !== 'connecting') return;
      this.state = 'open';
      window.clearTimeout(this.timer);
      this.cb.onOpen(this);
    };
    channel.onopen = open;
    if (channel.readyState === 'open') open();
    channel.onclose = () => this.close('channel-closed');
    channel.onmessage = (e) => {
      if (typeof e.data !== 'string' || e.data.length > 256 * 1024) return;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.t === 'part') return this.onPart(msg);
      this.cb.onMessage(this, msg);
    };
  }

  private onPart(msg: Record<string, unknown>) {
    const id = String(msg.id);
    const n = Number(msg.n);
    const i = Number(msg.i);
    if (!Number.isInteger(n) || n < 1 || n > 200 || !Number.isInteger(i) || i < 0 || i >= n) return;
    const list = this.parts.get(id) ?? new Array<string>(n);
    list[i] = String(msg.d ?? '');
    this.parts.set(id, list);
    if (list.filter((x) => x !== undefined).length === n) {
      this.parts.delete(id);
      try {
        this.cb.onMessage(this, JSON.parse(list.join('')));
      } catch {
        /* drop */
      }
    }
  }

  /** Sends a JSON control message. Returns false if the channel isn't open. */
  send(msg: Record<string, unknown>): boolean {
    if (this.state !== 'open' || this.ctl?.readyState !== 'open') return false;
    const text = JSON.stringify(msg);
    try {
      if (text.length <= FRAME) {
        this.ctl.send(text);
      } else {
        const id = Math.random().toString(36).slice(2);
        const n = Math.ceil(text.length / FRAME);
        for (let i = 0; i < n; i++) this.ctl.send(JSON.stringify({ t: 'part', id, i, n, d: text.slice(i * FRAME, (i + 1) * FRAME) }));
      }
      return true;
    } catch {
      return false;
    }
  }

  get maxChunk() {
    const max = this.pc.sctp?.maxMessageSize;
    return max && Number.isFinite(max) ? Math.max(16 * 1024, Math.min(64 * 1024, max)) : 16 * 1024;
  }

  openFileChannel(label: string): RTCDataChannel {
    const ch = this.pc.createDataChannel(label, { ordered: true });
    ch.binaryType = 'arraybuffer';
    return ch;
  }

  async detectRoute(): Promise<Route | null> {
    try {
      const stats = await this.pc.getStats();
      let pair: RTCIceCandidatePairStats | undefined;
      stats.forEach((r) => {
        if (r.type === 'transport' && r.selectedCandidatePairId) pair = stats.get(r.selectedCandidatePairId);
      });
      if (!pair) stats.forEach((r) => r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated && (pair = r));
      if (!pair) return this.route;
      const local = stats.get(pair.localCandidateId);
      const remote = stats.get(pair.remoteCandidateId);
      this.route = local?.candidateType === 'relay' || remote?.candidateType === 'relay' ? 'relay' : 'direct';
    } catch {
      /* ignore */
    }
    return this.route;
  }

  close(reason: string) {
    if (this.state === 'closed') return;
    this.state = 'closed';
    window.clearTimeout(this.timer);
    window.clearTimeout(this.discTimer);
    try {
      this.ctl?.close();
    } catch {
      /* ignore */
    }
    this.pc.close();
    this.cb.onClose(this, reason);
  }
}
