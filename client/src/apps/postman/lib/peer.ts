import { TransferError } from './errors';
import type { IceConfig, SignalMessage } from './signaling';

export type RouteKind = 'direct-lan' | 'direct' | 'relay';

export interface PeerCallbacks {
  onSignal(message: SignalMessage): void;
  onOpen(channel: RTCDataChannel): void;
  onFailed(error: TransferError): void;
}

const CONNECT_TIMEOUT = 30_000;
const DISCONNECT_GRACE = 10_000;

/**
 * Owns one RTCPeerConnection and its data channel. The sender is the offerer
 * and creates the channel; the receiver answers and receives it.
 */
export class PeerLink {
  readonly pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet = false;
  private localCandidateTypes = new Set<string>();
  private connectTimer: number;
  private disconnectTimer: number | undefined;
  private opened = false;
  private done = false;

  constructor(
    private readonly role: 'sender' | 'receiver',
    private readonly ice: IceConfig,
    private readonly cb: PeerCallbacks,
  ) {
    this.pc = new RTCPeerConnection({
      iceServers: ice.iceServers,
      iceTransportPolicy: ice.iceTransportPolicy,
    });

    this.pc.onicecandidate = (e) => {
      if (this.done) return;
      if (e.candidate) {
        const type = e.candidate.type ?? / typ (\w+)/.exec(e.candidate.candidate)?.[1];
        if (type) this.localCandidateTypes.add(type);
        this.cb.onSignal({ kind: 'ice', candidate: e.candidate.toJSON() });
      } else {
        this.cb.onSignal({ kind: 'ice-end' });
      }
    };

    const onState = () => {
      const state = this.pc.connectionState ?? this.pc.iceConnectionState;
      if (state === 'failed') {
        this.fail();
      } else if (state === 'disconnected') {
        // Often transient (network switch); give ICE a chance to recover.
        window.clearTimeout(this.disconnectTimer);
        this.disconnectTimer = window.setTimeout(() => {
          const s = this.pc.connectionState ?? this.pc.iceConnectionState;
          if (s === 'disconnected' || s === 'failed') this.fail();
        }, DISCONNECT_GRACE);
      } else if (state === 'connected') {
        window.clearTimeout(this.disconnectTimer);
      }
    };
    this.pc.onconnectionstatechange = onState;
    this.pc.oniceconnectionstatechange = () => {
      if (this.pc.iceConnectionState === 'failed') this.fail();
    };

    if (role === 'receiver') {
      this.pc.ondatachannel = (e) => this.attachChannel(e.channel);
    }

    this.connectTimer = window.setTimeout(() => {
      if (!this.opened) this.fail();
    }, CONNECT_TIMEOUT);
  }

  /** Sender only: create the data channel and the offer. */
  async start() {
    const channel = this.pc.createDataChannel('files', { ordered: true });
    this.attachChannel(channel);
    try {
      await this.pc.setLocalDescription(await this.pc.createOffer());
      this.cb.onSignal({ kind: 'offer', sdp: this.pc.localDescription!.sdp });
    } catch {
      this.fail();
    }
  }

  async handleSignal(message: SignalMessage) {
    if (this.done) return;
    try {
      if (message.kind === 'offer' && this.role === 'receiver') {
        await this.pc.setRemoteDescription({ type: 'offer', sdp: message.sdp });
        await this.flushCandidates();
        await this.pc.setLocalDescription(await this.pc.createAnswer());
        this.cb.onSignal({ kind: 'answer', sdp: this.pc.localDescription!.sdp });
      } else if (message.kind === 'answer' && this.role === 'sender') {
        if (this.pc.signalingState !== 'have-local-offer') return;
        await this.pc.setRemoteDescription({ type: 'answer', sdp: message.sdp });
        await this.flushCandidates();
      } else if (message.kind === 'ice') {
        if (this.remoteDescriptionSet) await this.addCandidate(message.candidate);
        else this.pendingCandidates.push(message.candidate);
      }
    } catch {
      this.fail();
    }
  }

  /** Largest safe message for this connection, capped at 64 KiB. */
  get chunkSize(): number {
    const max = this.pc.sctp?.maxMessageSize;
    if (!max || !Number.isFinite(max)) return 16 * 1024;
    return Math.max(16 * 1024, Math.min(64 * 1024, max));
  }

  /** Reports whether traffic flows directly or through a TURN relay. */
  async getRoute(): Promise<RouteKind | null> {
    try {
      const stats = await this.pc.getStats();
      let pair: RTCIceCandidatePairStats | undefined;
      stats.forEach((r) => {
        if (r.type === 'transport' && r.selectedCandidatePairId) pair = stats.get(r.selectedCandidatePairId);
      });
      if (!pair) {
        stats.forEach((r) => {
          if (r.type === 'candidate-pair' && r.state === 'succeeded' && (r.nominated || r.selected)) pair = r;
        });
      }
      if (!pair) return null;
      const local = stats.get(pair.localCandidateId);
      const remote = stats.get(pair.remoteCandidateId);
      if (local?.candidateType === 'relay' || remote?.candidateType === 'relay') return 'relay';
      if (local?.candidateType === 'host' && remote?.candidateType === 'host') return 'direct-lan';
      return 'direct';
    } catch {
      return null;
    }
  }

  /**
   * Used after sending a final message (cancel, reject, complete): the other
   * side closes the channel once it has processed it, so wait for that rather
   * than cutting the connection while the message may still be in flight.
   */
  closeWhenPeerCloses(maxWaitMs = 6000) {
    const channel = this.channel;
    if (this.done || !channel || channel.readyState !== 'open') return this.close();
    const timer = window.setTimeout(() => this.close(), maxWaitMs);
    channel.addEventListener(
      'close',
      () => {
        window.clearTimeout(timer);
        this.close();
      },
      { once: true },
    );
  }

  close() {
    if (this.done) return;
    this.done = true;
    window.clearTimeout(this.connectTimer);
    window.clearTimeout(this.disconnectTimer);
    try {
      this.channel?.close();
    } catch {
      /* already closed */
    }
    this.pc.close();
  }

  private attachChannel(channel: RTCDataChannel) {
    this.channel = channel;
    channel.binaryType = 'arraybuffer';
    const open = () => {
      if (this.opened || this.done) return;
      this.opened = true;
      window.clearTimeout(this.connectTimer);
      this.cb.onOpen(channel);
    };
    if (channel.readyState === 'open') open();
    else channel.addEventListener('open', open, { once: true });
  }

  private async flushCandidates() {
    this.remoteDescriptionSet = true;
    const queued = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const c of queued) await this.addCandidate(c);
  }

  private async addCandidate(candidate: RTCIceCandidateInit) {
    try {
      await this.pc.addIceCandidate(candidate);
    } catch {
      // A single bad candidate (e.g. unsupported mDNS) shouldn't kill the connection.
    }
  }

  private fail() {
    if (this.done) return;
    // A failure after the channel opened is surfaced by the transfer layer as
    // "interrupted"; before that it is a connection failure.
    const code =
      !this.opened && this.ice.turnEnabled && !this.localCandidateTypes.has('relay') ? 'TURN_FAILED' : 'WEBRTC_FAILED';
    const opened = this.opened;
    this.close();
    this.cb.onFailed(new TransferError(opened ? 'INTERRUPTED' : code));
  }
}
