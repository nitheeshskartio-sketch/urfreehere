import type { Socket } from 'socket.io-client';
import { LevelMeter, SpeakingDetector, VAD, audioContext, getMicStream, listDevices, micErrorMessage, micSupported } from './audio';
import { PeerLink, type LinkState, type Quality } from './mesh';
import { MicError, connectMic, request, type IceConfig, type ParticipantInfo, type RoomInfo, type SignalData } from './signaling';

export type ParticipantStatus = 'CONNECTING' | 'CONNECTED' | 'SPEAKING' | 'MUTED' | 'RECONNECTING' | 'DISCONNECTED';

export interface Participant extends ParticipantInfo {
  self: boolean;
  speaking: boolean;
  link: LinkState | null;
  quality: Quality | null;
  relayed: boolean;
}

export type EndReason = 'left' | 'removed' | 'host' | 'expired' | 'empty' | 'replaced';
export type Phase = 'idle' | 'joining' | 'in-room' | 'ended';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

export interface Profile {
  name: string;
  avatar: string | null;
}

type MicPermission = 'unknown' | 'granted' | 'denied' | 'unavailable';

const hostKey = (code: string) => `mic.host.${code}`;
const rejoinKey = (code: string) => `mic.rejoin.${code}`;

export function rememberHostToken(code: string, token: string) {
  localStorage.setItem(hostKey(code), token);
}

/** Card / list state derived from signaling, the audio link and speaking detection. */
export function statusOf(p: Participant): ParticipantStatus {
  if (p.status === 'reconnecting') return 'RECONNECTING';
  if (!p.self) {
    if (p.link === 'failed') return 'DISCONNECTED';
    if (p.link === 'reconnecting') return 'RECONNECTING';
    if (p.link !== 'connected') return 'CONNECTING';
  }
  if (p.muted) return 'MUTED';
  if (p.speaking) return 'SPEAKING';
  return 'CONNECTED';
}

/**
 * One voice room session: microphone, mesh audio links, speaking detection,
 * playback and host actions. Components subscribe and re-render on change.
 */
export class RoomClient {
  phase: Phase = 'idle';
  error: MicError | null = null;
  endReason: EndReason | null = null;
  room: RoomInfo | null = null;
  selfPid: string | null = null;
  participants = new Map<string, Participant>();
  toasts: Toast[] = [];
  socketOnline = false;

  mic = {
    permission: 'unknown' as MicPermission,
    error: '' as string,
    muted: true,
    deviceId: '' as string,
  };
  output = { deviceId: '', volume: 1 };
  devices: { inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] } = { inputs: [], outputs: [] };

  private socket: Socket | null = null;
  private ice: IceConfig | null = null;
  private stream: MediaStream | null = null;
  private track: MediaStreamTrack | null = null;
  private links = new Map<string, PeerLink>();
  private audios = new Map<string, HTMLAudioElement>();
  private meters = new Map<string, { meter: LevelMeter; detector: SpeakingDetector; stream: MediaStream }>();
  private loops: number[] = [];
  private listeners = new Set<() => void>();
  private toastSeq = 0;
  private joinArgs: { code: string; profile: Profile; password?: string; deviceId: string } | null = null;
  version = 0;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  private notify() {
    this.version++;
    for (const l of this.listeners) l();
  }

  toast(text: string, tone: Toast['tone'] = 'info') {
    // Avoid piling up identical notices.
    if (this.toasts.some((t) => t.text === text)) return;
    const t = { id: ++this.toastSeq, text, tone };
    this.toasts = [...this.toasts, t].slice(-3);
    this.notify();
    window.setTimeout(() => {
      this.toasts = this.toasts.filter((x) => x.id !== t.id);
      this.notify();
    }, tone === 'error' ? 6000 : 3500);
  }

  get self(): Participant | undefined {
    return this.selfPid ? this.participants.get(this.selfPid) : undefined;
  }

  get isHost(): boolean {
    return !!this.selfPid && this.room?.hostPid === this.selfPid;
  }

  // ------------------------------------------------------------ microphone

  /** Asks for the microphone. Only ever called from a user action. */
  async enableMic(): Promise<boolean> {
    if (this.track && this.track.readyState === 'live') return true;
    if (!micSupported()) {
      this.mic.permission = 'unavailable';
      this.mic.error = micErrorMessage({ name: 'InsecureContext' });
      this.notify();
      return false;
    }
    try {
      audioContext();
      this.stream = await getMicStream(this.mic.deviceId || undefined);
      this.track = this.stream.getAudioTracks()[0] ?? null;
      this.mic.permission = 'granted';
      this.mic.error = '';
      if (this.track) {
        this.track.enabled = !this.mic.muted;
        this.mic.deviceId = this.track.getSettings().deviceId ?? this.mic.deviceId;
        this.track.onended = () => {
          this.toast('Your microphone was disconnected.', 'error');
          this.setMuted(true);
        };
      }
      for (const l of this.links.values()) l.setTrack(this.track);
      this.attachMeter(this.selfPid ?? '__self', this.stream);
      void this.refreshDevices();
      this.notify();
      return true;
    } catch (err) {
      const name = (err as DOMException)?.name;
      this.mic.permission = name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable';
      this.mic.error = micErrorMessage(err);
      this.notify();
      return false;
    }
  }

  async toggleMute() {
    if (this.mic.muted) {
      if (!(await this.enableMic())) return;
      this.setMuted(false);
    } else this.setMuted(true);
  }

  private setMuted(muted: boolean) {
    this.mic.muted = muted;
    // Disabled tracks send silence: nothing from the microphone leaves the device.
    if (this.track) this.track.enabled = !muted;
    const me = this.self;
    if (me) {
      me.muted = muted;
      if (!muted) me.hostMuted = false;
      if (muted) me.speaking = false;
    }
    this.socket?.emit('state', { muted });
    this.notify();
  }

  async setInputDevice(deviceId: string) {
    this.mic.deviceId = deviceId;
    if (!this.track) return this.notify();
    const old = this.stream;
    try {
      const stream = await getMicStream(deviceId);
      const track = stream.getAudioTracks()[0];
      track.enabled = !this.mic.muted;
      this.stream = stream;
      this.track = track;
      for (const l of this.links.values()) l.setTrack(track);
      this.attachMeter(this.selfPid ?? '__self', stream);
      old?.getTracks().forEach((t) => t.stop());
    } catch (err) {
      this.toast(micErrorMessage(err), 'error');
    }
    this.notify();
  }

  async setOutputDevice(deviceId: string) {
    this.output.deviceId = deviceId;
    for (const a of this.audios.values()) {
      await (a as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId?.(deviceId).catch(() => {});
    }
    this.notify();
  }

  setVolume(volume: number) {
    this.output.volume = Math.max(0, Math.min(1, volume));
    for (const a of this.audios.values()) a.volume = this.output.volume;
    this.notify();
  }

  async refreshDevices() {
    this.devices = await listDevices().catch(() => ({ inputs: [], outputs: [] }));
    this.notify();
  }

  // ------------------------------------------------------------------ join

  async join(args: { code: string; profile: Profile; password?: string; withMic: boolean; deviceId: string }) {
    this.phase = 'joining';
    this.error = null;
    this.notify();
    audioContext();
    if (args.withMic) {
      // Permission is asked here, after the user pressed Join; a denial still lets them listen.
      if (await this.enableMic()) this.mic.muted = false;
      if (this.track) this.track.enabled = !this.mic.muted;
    }
    this.joinArgs = { code: args.code, profile: args.profile, password: args.password, deviceId: args.deviceId };
    this.socket ??= this.createSocket();
    try {
      await this.emitJoin();
      this.phase = 'in-room';
      this.startLoops();
    } catch (err) {
      this.error = err instanceof MicError ? err : new MicError('UNREACHABLE');
      this.phase = 'idle';
      this.teardown(false);
    }
    this.notify();
  }

  private createSocket(): Socket {
    const s = connectMic();
    s.on('connect', () => {
      const wasOffline = !this.socketOnline;
      this.socketOnline = true;
      // Automatic rejoin after a network drop: same seat, peers rebuild audio links.
      if (this.phase === 'in-room' && wasOffline) {
        this.emitJoin().catch((err: MicError) => this.end(err.code === 'NOT_FOUND' || err.code === 'CLOSED' ? 'host' : 'left'));
      }
      this.notify();
    });
    s.on('disconnect', () => {
      this.socketOnline = false;
      this.notify();
    });
    s.on('room:update', (room: RoomInfo) => this.onRoomUpdate(room));
    s.on('participant:joined', (p: ParticipantInfo) => {
      this.upsert(p);
      this.toast(`${p.name} joined the room.`);
      this.ensureLink(p.pid);
    });
    s.on('participant:reconnected', (p: ParticipantInfo) => {
      this.upsert(p);
      this.dropLink(p.pid);
      this.ensureLink(p.pid);
    });
    s.on('participant:updated', (p: ParticipantInfo) => this.upsert(p));
    s.on('participant:left', (p: { pid: string; name: string; reason: string }) => {
      this.dropLink(p.pid);
      this.participants.delete(p.pid);
      if (p.reason === 'removed') this.toast(`${p.name} was removed from the room.`);
      else this.toast(`${p.name} left the room.`);
      this.notify();
    });
    s.on('signal', (m: { from: string; data: SignalData }) => {
      if (!this.participants.has(m.from)) return;
      const link = this.links.get(m.from) ?? this.ensureLink(m.from);
      void link?.handle(m.data);
    });
    s.on('mute-request', (m: { by: string }) => {
      this.setMuted(true);
      const me = this.self;
      if (me) me.hostMuted = true;
      this.toast(`${m.by} (host) muted you. You can unmute when you want to speak.`);
    });
    s.on('kicked', (m: { reason: string }) => this.end(m.reason === 'replaced' ? 'replaced' : 'removed'));
    s.on('room:closed', (m: { reason: EndReason }) => this.end(m.reason === 'expired' ? 'expired' : m.reason === 'empty' ? 'empty' : 'host'));
    return s;
  }

  private async emitJoin() {
    const a = this.joinArgs!;
    const code = this.room?.code ?? a.code;
    let rejoin: { pid: string; token: string } | undefined;
    try {
      rejoin = JSON.parse(sessionStorage.getItem(rejoinKey(code)) ?? 'null') ?? undefined;
    } catch {
      rejoin = undefined;
    }
    const res = await request<{
      self: { pid: string; rejoinToken: string };
      room: RoomInfo;
      participants: ParticipantInfo[];
      ice: IceConfig;
    }>(this.socket!, 'room:join', {
      code,
      profile: a.profile,
      password: a.password,
      deviceId: a.deviceId,
      hostToken: localStorage.getItem(hostKey(code)) ?? undefined,
      rejoin,
      muted: this.mic.muted,
    });
    this.ice = res.ice;
    this.selfPid = res.self.pid;
    sessionStorage.setItem(rejoinKey(res.room.code), JSON.stringify({ pid: res.self.pid, token: res.self.rejoinToken }));
    this.room = res.room;
    // Rebuild the participant list and audio links from the server's view.
    const keep = new Set(res.participants.map((p) => p.pid));
    for (const pid of [...this.participants.keys()]) if (!keep.has(pid)) this.participants.delete(pid);
    for (const pid of [...this.links.keys()]) this.dropLink(pid);
    for (const p of res.participants) this.upsert(p, false);
    if (this.stream && this.meters.has('__self')) {
      const m = this.meters.get('__self')!;
      this.meters.delete('__self');
      this.meters.set(res.self.pid, m);
    }
    for (const p of res.participants) if (p.pid !== res.self.pid && p.status === 'connected') this.ensureLink(p.pid);
    this.notify();
  }

  private onRoomUpdate(room: RoomInfo) {
    const old = this.room;
    if (old && old.code !== room.code) {
      // The host changed the room code: move stored tokens and update the address.
      const host = localStorage.getItem(hostKey(old.code));
      if (host) {
        localStorage.setItem(hostKey(room.code), host);
        localStorage.removeItem(hostKey(old.code));
      }
      const rj = sessionStorage.getItem(rejoinKey(old.code));
      if (rj) sessionStorage.setItem(rejoinKey(room.code), rj);
      window.history.replaceState(null, '', `/room/${room.code}`);
      this.toast(`New room code: ${room.code}`);
    }
    if (old && old.hostPid !== room.hostPid && room.hostPid === this.selfPid) this.toast("You're now the host of this room.");
    this.room = room;
    for (const p of this.participants.values()) p.isHost = p.pid === room.hostPid;
    this.notify();
  }

  private upsert(info: ParticipantInfo, notify = true) {
    const cur = this.participants.get(info.pid);
    const self = info.pid === this.selfPid;
    const next: Participant = {
      ...info,
      self,
      speaking: cur?.speaking ?? false,
      link: cur?.link ?? null,
      quality: cur?.quality ?? null,
      relayed: cur?.relayed ?? false,
    };
    if (self) {
      // My own mic state is authoritative locally.
      next.muted = this.mic.muted;
    }
    if (next.muted) next.speaking = false;
    this.participants.set(info.pid, next);
    if (notify) this.notify();
  }

  // ----------------------------------------------------------------- links

  private ensureLink(pid: string): PeerLink | undefined {
    if (pid === this.selfPid || !this.ice || !this.selfPid) return undefined;
    const existing = this.links.get(pid);
    if (existing && existing.state !== 'failed') return existing;
    existing?.close();
    const link: PeerLink = new PeerLink(
      this.selfPid,
      pid,
      this.ice,
      this.track,
      (data) => this.socket?.emit('signal', { to: pid, data }),
      () => this.onLinkChange(pid, link),
      () => {
        // Rebuild a failed link once the peer is still here.
        window.setTimeout(() => {
          if (this.links.get(pid) === link && this.participants.has(pid) && this.phase === 'in-room') {
            this.dropLink(pid);
            this.ensureLink(pid);
          }
        }, 2000);
      },
    );
    this.links.set(pid, link);
    const p = this.participants.get(pid);
    if (p) p.link = 'connecting';
    this.notify();
    return link;
  }

  private onLinkChange(pid: string, link: PeerLink) {
    if (this.links.get(pid) !== link) return;
    const p = this.participants.get(pid);
    if (p) p.link = link.state;
    if (link.remoteStream && !this.audios.has(pid)) this.attachAudio(pid, link.remoteStream);
    this.notify();
  }

  private attachAudio(pid: string, stream: MediaStream) {
    const audio = new Audio();
    audio.autoplay = true;
    audio.srcObject = stream;
    audio.volume = this.output.volume;
    const withSink = audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    if (this.output.deviceId && withSink.setSinkId) void withSink.setSinkId(this.output.deviceId).catch(() => {});
    audio.play().catch(() => this.toast('Tap anywhere to enable sound.', 'info'));
    this.audios.set(pid, audio);
    // Chrome only feeds remote WebRTC audio to Web Audio when it is also attached to a media element.
    this.attachMeter(pid, stream);
  }

  private attachMeter(pid: string, stream: MediaStream) {
    this.meters.get(pid)?.meter.dispose();
    try {
      this.meters.set(pid, { meter: new LevelMeter(stream), detector: new SpeakingDetector(), stream });
    } catch {
      /* Web Audio unavailable */
    }
  }

  private dropLink(pid: string) {
    this.links.get(pid)?.close();
    this.links.delete(pid);
    const a = this.audios.get(pid);
    if (a) {
      a.pause();
      a.srcObject = null;
    }
    this.audios.delete(pid);
    this.meters.get(pid)?.meter.dispose();
    this.meters.delete(pid);
    const p = this.participants.get(pid);
    if (p) {
      p.link = null;
      p.speaking = false;
    }
  }

  /** Called from a click if the browser blocked autoplay. */
  resumeAudio() {
    audioContext();
    for (const a of this.audios.values()) void a.play().catch(() => {});
  }

  // ------------------------------------------------------------ live loops

  private startLoops() {
    this.stopLoops();
    // Speaking detection from real audio levels: my microphone and every received stream.
    this.loops.push(
      window.setInterval(() => {
        const now = performance.now();
        let changed = false;
        for (const [pid, m] of this.meters) {
          const p = this.participants.get(pid === '__self' ? this.selfPid ?? '' : pid);
          if (!p) continue;
          const silent = p.muted || (p.self && !this.track?.enabled);
          const speaking = silent ? (m.detector.reset(), false) : m.detector.update(m.meter.db(), now);
          if (speaking !== p.speaking) {
            p.speaking = speaking;
            changed = true;
          }
        }
        if (changed) this.notify();
      }, VAD.intervalMs),
    );
    this.loops.push(
      window.setInterval(async () => {
        for (const [pid, link] of this.links) {
          await link.sampleStats();
          const p = this.participants.get(pid);
          if (p) {
            p.quality = link.quality;
            p.relayed = link.relayed;
          }
        }
        this.notify();
      }, 2000),
    );
  }

  private stopLoops() {
    for (const id of this.loops) window.clearInterval(id);
    this.loops = [];
  }

  // ------------------------------------------------------------------ host

  private hostRequest(event: string, payload: unknown = {}) {
    if (!this.socket) return Promise.reject(new MicError('UNREACHABLE'));
    return request<Record<string, unknown>>(this.socket, event, payload).catch((err: MicError) => {
      this.toast(err.code === 'INVALID_LIMIT' ? 'That participant limit is not allowed.' : "That didn't work. Try again.", 'error');
      throw err;
    });
  }

  updateRoom(patch: { name?: string; description?: string; maxParticipants?: number }) {
    return this.hostRequest('host:update', patch);
  }
  setLocked(locked: boolean) {
    return this.hostRequest('host:lock', { locked });
  }
  requestMute(pid: string) {
    return this.hostRequest('host:mute', { pid });
  }
  removeParticipant(pid: string) {
    return this.hostRequest('host:remove', { pid });
  }
  regenerateCode() {
    return this.hostRequest('host:regenerate');
  }
  closeRoom() {
    return this.hostRequest('host:close');
  }

  // ------------------------------------------------------------------- end

  leave() {
    this.socket?.emit('leave');
    this.end('left');
  }

  private end(reason: EndReason) {
    if (this.room) sessionStorage.removeItem(rejoinKey(this.room.code));
    this.endReason = reason;
    this.phase = 'ended';
    this.teardown(true);
    this.notify();
  }

  private teardown(closeSocket: boolean) {
    this.stopLoops();
    for (const pid of [...this.links.keys()]) this.dropLink(pid);
    for (const m of this.meters.values()) m.meter.dispose();
    this.meters.clear();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.track = null;
    this.mic.muted = true;
    if (closeSocket) {
      this.socket?.removeAllListeners();
      this.socket?.disconnect();
      this.socket = null;
    }
  }

  /** Create a room (separate short-lived connection; the creator then joins like everyone else). */
  static async createRoom(settings: Record<string, unknown>): Promise<{ code: string; hostToken: string; room: RoomInfo }> {
    const s = connectMic();
    try {
      const res = await request<{ code: string; hostToken: string; room: RoomInfo }>(s, 'room:create', settings);
      rememberHostToken(res.code, res.hostToken);
      return res;
    } finally {
      s.disconnect();
    }
  }
}

// ---- local profile ------------------------------------------------------------

export function loadProfile(): Profile | null {
  try {
    const p = JSON.parse(localStorage.getItem('mic.profile') ?? 'null');
    return p && typeof p.name === 'string' && p.name.trim() ? p : null;
  } catch {
    return null;
  }
}

export function saveProfile(p: Profile) {
  localStorage.setItem('mic.profile', JSON.stringify(p));
}

/** Random per-browser ID used only for temporary bans after removal. */
export function deviceId(): string {
  let id = localStorage.getItem('mic.device');
  if (!id) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('mic.device', id);
  }
  return id;
}
