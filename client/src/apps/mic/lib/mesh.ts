import type { IceConfig, SignalData } from './signaling';

export type LinkState = 'connecting' | 'connected' | 'reconnecting' | 'failed';
export type Quality = 'good' | 'fair' | 'poor';

const CONNECT_TIMEOUT = 25_000;
const RESTART_AFTER = 5_000;

/**
 * Audio connection to one other participant (mesh: one per peer).
 *
 * One audio transceiver carries the microphone; its track is swapped with
 * replaceTrack, so muting, switching microphones or enabling the mic later
 * never needs renegotiation. The participant with the lower ID always makes
 * the offer, which avoids both sides offering at once.
 */
export class PeerLink {
  readonly pc: RTCPeerConnection;
  readonly offerer: boolean;
  state: LinkState = 'connecting';
  remoteStream: MediaStream | null = null;
  quality: Quality | null = null;
  rttMs: number | null = null;
  lossPct: number | null = null;
  relayed = false;
  private transceiver: RTCRtpTransceiver | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];
  private remoteSet = false;
  private timer: number | undefined;
  private restartTimer: number | undefined;
  private restarts = 0;
  private lastLost = 0;
  private lastRecv = 0;
  private closed = false;

  constructor(
    selfPid: string,
    readonly peerPid: string,
    ice: IceConfig,
    private track: MediaStreamTrack | null,
    private readonly send: (data: SignalData) => void,
    private readonly onChange: () => void,
    private readonly onFailed: () => void,
  ) {
    this.offerer = selfPid < peerPid;
    this.pc = new RTCPeerConnection({ iceServers: ice.iceServers, iceTransportPolicy: ice.iceTransportPolicy });
    this.pc.onicecandidate = (e) => e.candidate && this.send({ kind: 'ice', candidate: e.candidate.toJSON() });
    this.pc.ontrack = (e) => {
      this.remoteStream = e.streams[0] ?? new MediaStream([e.track]);
      this.onChange();
    };
    this.pc.onconnectionstatechange = () => this.onState();
    this.timer = window.setTimeout(() => this.state === 'connecting' && this.fail(), CONNECT_TIMEOUT);
    if (this.offerer) {
      this.transceiver = this.pc.addTransceiver('audio', { direction: 'sendrecv', streams: [new MediaStream()] });
      void this.transceiver.sender.replaceTrack(track);
      void this.offer(false);
    }
  }

  private async offer(iceRestart: boolean) {
    try {
      await this.pc.setLocalDescription(await this.pc.createOffer({ iceRestart }));
      this.send({ kind: 'offer', sdp: this.pc.localDescription!.sdp });
    } catch {
      this.fail();
    }
  }

  async handle(data: SignalData) {
    if (this.closed) return;
    try {
      if (data.kind === 'offer' && !this.offerer) {
        await this.pc.setRemoteDescription({ type: 'offer', sdp: String(data.sdp) });
        this.transceiver ??= this.pc.getTransceivers()[0] ?? null;
        if (this.transceiver) {
          this.transceiver.direction = 'sendrecv';
          await this.transceiver.sender.replaceTrack(this.track);
        }
        await this.flushIce();
        await this.pc.setLocalDescription(await this.pc.createAnswer());
        this.send({ kind: 'answer', sdp: this.pc.localDescription!.sdp });
      } else if (data.kind === 'answer' && this.offerer && this.pc.signalingState === 'have-local-offer') {
        await this.pc.setRemoteDescription({ type: 'answer', sdp: String(data.sdp) });
        await this.flushIce();
      } else if (data.kind === 'ice' && data.candidate) {
        if (this.remoteSet) await this.pc.addIceCandidate(data.candidate as RTCIceCandidateInit).catch(() => {});
        else this.pendingIce.push(data.candidate as RTCIceCandidateInit);
      }
    } catch {
      this.fail();
    }
  }

  private async flushIce() {
    this.remoteSet = true;
    for (const c of this.pendingIce.splice(0)) await this.pc.addIceCandidate(c).catch(() => {});
  }

  private onState() {
    if (this.closed) return;
    const s = this.pc.connectionState;
    if (s === 'connected') {
      window.clearTimeout(this.timer);
      window.clearTimeout(this.restartTimer);
      this.state = 'connected';
      this.restarts = 0;
    } else if (s === 'disconnected') {
      this.state = 'reconnecting';
      // Give the network a moment, then the offerer restarts ICE.
      window.clearTimeout(this.restartTimer);
      this.restartTimer = window.setTimeout(() => this.restart(), RESTART_AFTER);
    } else if (s === 'failed') {
      this.state = 'reconnecting';
      this.restart();
    }
    this.onChange();
  }

  private restart() {
    if (this.closed || this.pc.connectionState === 'connected') return;
    if (++this.restarts > 3) return this.fail();
    if (this.offerer) void this.offer(true);
    // The answerer waits for the offerer's restart; if nothing recovers, the timer fails the link.
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.state !== 'connected' && this.fail(), CONNECT_TIMEOUT);
  }

  private fail() {
    if (this.closed) return;
    this.state = 'failed';
    this.onChange();
    this.onFailed();
  }

  /** Swap the outgoing microphone track (mute/unmute/device change) without renegotiating. */
  setTrack(track: MediaStreamTrack | null) {
    this.track = track;
    if (this.transceiver) void this.transceiver.sender.replaceTrack(track).catch(() => {});
  }

  /** Round-trip time and packet loss → a simple quality rating. */
  async sampleStats() {
    if (this.closed || this.state !== 'connected') return;
    try {
      const stats = await this.pc.getStats();
      let rtt: number | null = null;
      let lost = 0;
      let recv = 0;
      stats.forEach((r) => {
        if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded' && typeof r.currentRoundTripTime === 'number') {
          rtt = r.currentRoundTripTime * 1000;
          const local = stats.get(r.localCandidateId);
          const remote = stats.get(r.remoteCandidateId);
          this.relayed = local?.candidateType === 'relay' || remote?.candidateType === 'relay';
        }
        if (r.type === 'inbound-rtp' && r.kind === 'audio') {
          lost += r.packetsLost ?? 0;
          recv += r.packetsReceived ?? 0;
        }
      });
      const dLost = Math.max(0, lost - this.lastLost);
      const dRecv = Math.max(0, recv - this.lastRecv);
      this.lastLost = lost;
      this.lastRecv = recv;
      this.rttMs = rtt;
      this.lossPct = dLost + dRecv > 0 ? (dLost / (dLost + dRecv)) * 100 : 0;
      const r = rtt ?? 0;
      const l = this.lossPct;
      this.quality = r < 250 && l < 2 ? 'good' : r < 500 && l < 8 ? 'fair' : 'poor';
    } catch {
      /* ignore */
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    window.clearTimeout(this.timer);
    window.clearTimeout(this.restartTimer);
    this.pc.close();
  }
}
