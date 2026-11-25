import { io, type Socket } from 'socket.io-client';
import { sign, type Identity } from './identity';
import type { UserId } from './types';

export interface IceConfig {
  iceServers: RTCIceServer[];
  iceTransportPolicy: RTCIceTransportPolicy;
  turnEnabled: boolean;
}

export interface SignalData {
  kind: 'offer' | 'answer' | 'ice' | 'connect' | 'bye';
  [key: string]: unknown;
}

export interface JoinRequest {
  requestId: string;
  groupId: string;
  token: string;
  joinerId: UserId;
  joinEvent: Record<string, unknown>;
  profile: Record<string, unknown>;
  createdAt: number;
}

export interface InviteResult {
  groupId: string;
  accepted: boolean;
  by: UserId;
  reason?: string;
}

export type SignalingStatus = 'connecting' | 'online' | 'offline' | 'replaced' | 'missing';

export type AuthMode = 'create' | 'login' | 'resume';

/** Account as stored on the server (MongoDB): profile and basic details only. */
export interface AccountInfo {
  userId: UserId;
  publicKey: unknown;
  name: string;
  status: string;
  avatar: string | null;
  updatedAt: number;
}

export interface SignalingHandlers {
  onStatus(status: SignalingStatus): void;
  onSignal(from: UserId, data: SignalData): void;
  onPresence(userId: UserId, online: boolean): void;
  onJoinRequest(req: JoinRequest): void;
  onInviteResult(result: InviteResult): void;
  /** Logged in. `account` is null when the server runs without accounts. */
  onAuthed(account: AccountInfo | null, accountsEnabled: boolean): void;
}

const BASE: string = import.meta.env.VITE_SIGNALING_URL || '';
const TIMEOUT = 10_000;

/**
 * Connection to the UR Chat signaling hub. Carries presence, WebRTC
 * handshakes and invitation requests only — never message content.
 */
export class ChatSignaling {
  private socket: Socket;
  private watched = new Set<UserId>();
  private groups = new Set<string>();
  private authed = false;
  private replaced = false;
  ice: IceConfig | null = null;

  constructor(
    private readonly identity: Identity,
    private readonly handlers: SignalingHandlers,
    private readonly authInfo: () => { mode: AuthMode; profile: unknown },
  ) {
    this.socket = io(`${BASE}/chat`, {
      autoConnect: false,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
      timeout: TIMEOUT,
    });
    this.socket.on('connect', () => void this.authenticate());
    this.socket.on('disconnect', () => {
      this.authed = false;
      // Keep "signed in elsewhere" visible instead of a generic offline state.
      if (!this.replaced) handlers.onStatus('offline');
    });
    this.socket.on('connect_error', () => handlers.onStatus('offline'));
    this.socket.on('session:replaced', () => {
      this.authed = false;
      this.replaced = true;
      this.socket.io.opts.reconnection = false;
      handlers.onStatus('replaced');
    });
    this.socket.on('signal', (p: { from: UserId; data: SignalData }) => handlers.onSignal(p.from, p.data));
    this.socket.on('presence', (p: { userId: UserId; online: boolean }) => handlers.onPresence(p.userId, p.online));
    this.socket.on('group:join-request', (req: JoinRequest) => handlers.onJoinRequest(req));
    this.socket.on('invite:result', (r: InviteResult) => handlers.onInviteResult(r));
  }

  get online() {
    return this.authed;
  }

  start() {
    this.replaced = false;
    this.handlers.onStatus('connecting');
    this.socket.io.opts.reconnection = true;
    this.socket.connect();
  }

  /** Reconnect after another tab took over the session. */
  reclaim() {
    this.start();
  }

  private request<T extends Record<string, unknown>>(event: string, payload: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      this.socket.timeout(TIMEOUT).emit(event, payload, (err: Error | null, res: T & { ok: boolean; error?: string }) => {
        if (err) return reject(new Error('SIGNALING_UNAVAILABLE'));
        if (!res.ok) return reject(new Error(res.error ?? 'FAILED'));
        resolve(res);
      });
    });
  }

  private async authenticate() {
    try {
      const { nonce } = await this.request<{ nonce: string }>('auth:hello', {
        userId: this.identity.userId,
        publicKey: this.identity.publicJwk,
      });
      const signature = await sign(this.identity, `urfree-chat-auth:${nonce}`);
      const res = await this.request<{ ice: IceConfig; account: AccountInfo | null; accounts: boolean }>('auth:prove', {
        signature,
        ...this.authInfo(),
      });
      this.ice = res.ice;
      this.authed = true;
      this.handlers.onAuthed(res.account ?? null, !!res.accounts);
      this.handlers.onStatus('online');
      // Restore subscriptions after every (re)connect.
      if (this.watched.size) void this.flushWatch([...this.watched]);
      if (this.groups.size) void this.request('groups:announce', { groupIds: [...this.groups] }).catch(() => {});
    } catch (err) {
      const code = (err as Error).message;
      if (code === 'ACCOUNT_NOT_FOUND') {
        // The account doesn't exist (never created, or removed after inactivity).
        this.socket.io.opts.reconnection = false;
        this.socket.disconnect();
        this.handlers.onStatus('missing');
        return;
      }
      this.handlers.onStatus('offline');
      // The account service may be starting or briefly unavailable: try again shortly.
      if (code === 'ACCOUNTS_STARTING' || code === 'ACCOUNTS_UNAVAILABLE') {
        window.setTimeout(() => this.socket.connected && void this.authenticate(), 3000);
      }
    }
  }

  async updateProfile(profile: unknown) {
    if (!this.authed) return;
    await this.request('profile:update', { profile }).catch(() => {});
  }

  /** Public profiles from the account directory. `enabled` is false when the server has no accounts. */
  async lookupProfiles(ids: UserId[]): Promise<{ enabled: boolean; profiles: AccountInfo[] }> {
    if (!this.authed || !ids.length) return { enabled: false, profiles: [] };
    try {
      return await this.request<{ enabled: boolean; profiles: AccountInfo[] }>('profile:lookup', { ids });
    } catch {
      return { enabled: false, profiles: [] };
    }
  }

  private async flushWatch(ids: UserId[]) {
    if (!this.authed || !ids.length) return;
    try {
      const { online } = await this.request<{ online: UserId[] }>('presence:watch', { ids });
      const on = new Set(online);
      for (const id of ids) this.handlers.onPresence(id, on.has(id));
    } catch {
      /* retried on reconnect */
    }
  }

  watch(ids: UserId[]) {
    const fresh = ids.filter((id) => id !== this.identity.userId && !this.watched.has(id));
    for (const id of fresh) this.watched.add(id);
    void this.flushWatch(fresh);
  }

  announceGroups(groupIds: string[]) {
    const next = new Set(groupIds);
    const same = next.size === this.groups.size && [...next].every((g) => this.groups.has(g));
    this.groups = next;
    if (!same && this.authed) void this.request('groups:announce', { groupIds: [...next] }).catch(() => {});
  }

  async signal(to: UserId, data: SignalData): Promise<boolean> {
    if (!this.authed) return false;
    try {
      await this.request('signal', { to, data });
      return true;
    } catch {
      return false;
    }
  }

  createInvite(input: {
    groupId: string;
    token: string;
    signedInvite: Record<string, unknown>;
    preview: Record<string, unknown>;
    managers: UserId[];
    expiresAt: number | null;
    maxUses: number | null;
  }) {
    return this.request<{ code: string }>('invite:create', input);
  }

  revokeInvite(token: string) {
    return this.request('invite:revoke', { token });
  }

  updateInvitePreview(token: string, preview: Record<string, unknown>) {
    return this.request('invite:preview', { token, preview }).catch(() => {});
  }

  joinGroup(key: string, joinEvent: Record<string, unknown>, profile: Record<string, unknown>) {
    return this.request<{ groupId: string; requestId: string; membersOnline: number }>('invite:join', {
      key,
      joinEvent,
      profile,
    });
  }

  joinHandled(groupId: string, requestId: string, accepted: boolean, reason?: string) {
    return this.request('group:join-handled', { groupId, requestId, accepted, reason }).catch(() => {});
  }

  close() {
    this.socket.removeAllListeners();
    this.socket.disconnect();
  }
}

export interface InviteLookup {
  token: string;
  groupId: string;
  preview: { name: string; description: string; image: string | null; memberCount: number };
  status: 'active' | 'expired' | 'revoked' | 'used-up';
  expiresAt: number | null;
}

export async function lookupInvite(key: string): Promise<InviteLookup> {
  const res = await fetch(`${BASE}/api/chat/invites/${encodeURIComponent(key)}`);
  if (res.status === 404) throw new Error('NOT_FOUND');
  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (!res.ok) throw new Error('UNAVAILABLE');
  return res.json();
}
