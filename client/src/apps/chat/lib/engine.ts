import { db } from './db';
import { canonical, randomId, sha256Hex } from './encoding';
import { TransferCancelled, receiveFile, sendFile } from './files';
import {
  MAX_GROUP_MEMBERS,
  authorKey,
  checkInvite,
  deriveGroup,
  inviteSignable,
  type GroupState,
  type SignedInvite,
} from './groups';
import { createIdentity, identityFromCode, isPublicJwk, keyMatchesId, sign, signable, verify, type Identity } from './identity';
import { AUTO_DOWNLOAD_LIMIT, MAX_FILE_SIZE, classify, imageInfo, isRealImage, mimeFor, sanitizeName, validateOutgoing, type FileClass } from './media';
import { PeerSession } from './peer';
import { ChatSignaling, lookupInvite, type AccountInfo, type AuthMode, type InviteLookup, type JoinRequest, type SignalData, type SignalingStatus } from './signaling';
import type {
  ChatEvent,
  Contact,
  ConvId,
  Conversation,
  EventKind,
  FileBody,
  FileTransferState,
  LocationBody,
  PeerStatus,
  Profile,
  PublicJwk,
  ReceiptStatus,
  Settings,
  StoredEvent,
  UserId,
} from './types';

const MAX_SESSIONS = 40;
const MAX_STRANGER_SESSIONS = 6;
const MAX_TEXT = 4000;
const TYPING_TTL = 4500;
const SYNC_BATCH = 100;
const USER_ID_RE = /^[A-Z2-9]{16}$/;
const CONV_RE = /^(dm:[A-Z2-9]{16}:[A-Z2-9]{16}|g:[A-Za-z0-9_-]{16,40})$/;

export interface LocalInvite {
  token: string;
  code: string;
  groupId: string;
  createdAt: number;
  expiresAt: number | null;
  maxUses: number | null;
  revoked: boolean;
}

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error' | 'success';
}

export type EngineStatus = 'loading' | 'onboarding' | 'ready' | 'expired' | 'unsupported' | 'error';

export function dmId(a: UserId, b: UserId): ConvId {
  return a < b ? `dm:${a}:${b}` : `dm:${b}:${a}`;
}

function eventSignable(e: Omit<ChatEvent, 'sig'>): string {
  return signable(['urfree-chat-event', e.v, e.id, e.conv, e.author, e.seq, e.ts, e.kind, e.body, e.replyTo]);
}

const rank: Record<ReceiptStatus, number> = { delivered: 1, read: 2 };

function sanitizeProfile(p: unknown): Profile | null {
  const o = p as Record<string, unknown> | null;
  if (!o || typeof o.name !== 'string') return null;
  const name = o.name.trim().slice(0, 60);
  if (!name) return null;
  const avatar =
    typeof o.avatar === 'string' &&
    ((o.avatar.startsWith('data:image/') && o.avatar.length <= 60_000) || /^(ill|gen):[a-z0-9-]{1,40}$/i.test(o.avatar))
      ? o.avatar
      : null;
  return {
    name,
    status: typeof o.status === 'string' ? o.status.slice(0, 140) : '',
    avatar,
    updatedAt: Number.isFinite(o.updatedAt) ? Number(o.updatedAt) : 0,
  };
}

/** Structural validation for any event received from a peer. */
function validEvent(e: unknown): e is ChatEvent {
  const x = e as ChatEvent | null;
  if (!x || x.v !== 1 || typeof x.id !== 'string' || x.id.length > 64 || typeof x.conv !== 'string' || !CONV_RE.test(x.conv)) return false;
  if (typeof x.author !== 'string' || !USER_ID_RE.test(x.author)) return false;
  if (!Number.isInteger(x.seq) || x.seq < 1 || x.seq > 1e9) return false;
  if (typeof x.ts !== 'number' || x.ts < 1.6e12 || x.ts > Date.now() + 24 * 3600_000) return false;
  if (typeof x.sig !== 'string' || x.sig.length > 100) return false;
  if (x.replyTo !== null && (typeof x.replyTo !== 'string' || x.replyTo.length > 64)) return false;
  if (!x.body || typeof x.body !== 'object' || Array.isArray(x.body)) return false;
  if (canonical(x.body).length > 64 * 1024) return false;
  const b = x.body as Record<string, unknown>;
  switch (x.kind) {
    case 'text':
      return typeof b.text === 'string' && b.text.length > 0 && b.text.length <= MAX_TEXT;
    case 'image':
    case 'file': {
      const cls = classify(String(b.name ?? ''));
      if (!cls || (x.kind === 'image' && cls !== 'image')) return false;
      if (typeof b.fileId !== 'string' || b.fileId.length > 64) return false;
      if (!Number.isInteger(b.size) || (b.size as number) < 1 || (b.size as number) > MAX_FILE_SIZE) return false;
      if (typeof b.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(b.sha256)) return false;
      if (b.thumb !== undefined && (typeof b.thumb !== 'string' || !b.thumb.startsWith('data:image/') || b.thumb.length > 12_000)) return false;
      if (b.caption !== undefined && (typeof b.caption !== 'string' || b.caption.length > 1000)) return false;
      return true;
    }
    case 'location':
      return (
        typeof b.lat === 'number' &&
        typeof b.lng === 'number' &&
        Math.abs(b.lat) <= 90 &&
        Math.abs(b.lng) <= 180 &&
        (b.label === undefined || (typeof b.label === 'string' && b.label.length <= 200)) &&
        (b.accuracy === undefined || (typeof b.accuracy === 'number' && b.accuracy >= 0))
      );
    case 'gif':
      return (
        typeof b.id === 'string' &&
        b.id.length <= 64 &&
        typeof b.url === 'string' &&
        b.url.length <= 600 &&
        /^https:\/\/(media\d*|i)\.giphy\.com\//.test(b.url) &&
        Number.isFinite(b.width) &&
        Number.isFinite(b.height) &&
        (b.width as number) > 0 &&
        (b.width as number) <= 2000 &&
        (b.height as number) > 0 &&
        (b.height as number) <= 2000 &&
        (b.title === undefined || (typeof b.title === 'string' && b.title.length <= 120))
      );
    case 'op':
      return x.conv.startsWith('g:') && typeof b.op === 'string';
    default:
      return false;
  }
}

interface FileRequest {
  rid: string;
  fileId: string;
  conv: ConvId;
  peer: UserId;
  tried: Set<UserId>;
  abort: AbortController;
}

/**
 * The chat engine: identity, storage, connections, sync and groups. UI
 * components read state from it and re-render when `version` changes.
 *
 * Delivery model:
 *  - Every message is a signed event with a per-author sequence number.
 *  - Live: new events are pushed to every connected participant.
 *  - Catch-up: whenever two participants connect they exchange "state
 *    vectors" and send each other whatever is missing. In groups any member
 *    can pass on missed messages; signatures prevent tampering.
 *  - Nothing goes through the server, so a message to someone offline waits
 *    (marked "waiting") until you're both online.
 */
export class ChatEngine {
  status: EngineStatus = 'loading';
  /** Browser features that are missing when status is "unsupported". */
  unsupportedReason: string[] = [];
  /** Whether the server keeps accounts (MongoDB configured). */
  accountsEnabled = false;
  /** Show the "save your login code" prompt once after sign-up. */
  showLoginCode = false;
  private authMode: AuthMode = 'resume';
  private registered = false;
  private loginWaiter: ((r: 'found' | 'not-found') => void) | null = null;
  /** Public keys from the account directory, verified against the user ID. */
  private directoryKeys = new Map<UserId, PublicJwk>();
  net: SignalingStatus = 'connecting';
  identity: Identity | null = null;
  profile: Profile | null = null;
  settings: Settings = { enterToSend: true, desktopNotifications: false, notificationPreview: true, notificationSound: true };

  contacts = new Map<UserId, Contact>();
  profiles = new Map<UserId, Profile>();
  convs = new Map<ConvId, Conversation>();
  groups = new Map<string, GroupState>();
  presence = new Map<UserId, boolean>();
  sessions = new Map<UserId, PeerSession>();
  typing = new Map<ConvId, Map<UserId, number>>();
  transfers = new Map<string, FileTransferState>();
  invites = new Map<string, LocalInvite[]>();
  toasts: Toast[] = [];
  activeConv: ConvId | null = null;

  private events = new Map<ConvId, StoredEvent[]>();
  private byId = new Map<string, StoredEvent>();
  private byFile = new Map<string, StoredEvent>();
  private seqs = new Map<ConvId, Map<UserId, Set<number>>>();
  private mySeq = new Map<ConvId, number>();
  private held = new Map<ConvId, ChatEvent[]>();
  private haveFiles = new Set<string>();
  private fileUrls = new Map<string, string>();
  private fileRequests = new Map<string, FileRequest>();
  private receiptQueue = new Map<UserId, { id: string; conv: ConvId; status: ReceiptStatus }[]>();
  private reconnect = new Map<UserId, { attempts: number; timer?: number }>();
  private lastConnectAsk = new Map<UserId, number>();
  private typingSent = new Map<ConvId, number>();
  private provisional = new Set<ConvId>();
  private groupLocks = new Map<string, Promise<void>>();
  private signaling: ChatSignaling | null = null;
  private listeners = new Set<() => void>();
  private writeQueue = new Map<string, { store: 'events' | 'convs' | 'contacts'; value: unknown }>();
  private writeTimer: number | undefined;
  private notifyQueued = false;
  private toastSeq = 0;
  version = 0;

  // ------------------------------------------------------------------ store

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = () => this.version;

  private notify() {
    if (this.notifyQueued) return;
    this.notifyQueued = true;
    queueMicrotask(() => {
      this.notifyQueued = false;
      this.version++;
      for (const l of this.listeners) l();
    });
  }

  toast(text: string, tone: Toast['tone'] = 'info') {
    const t = { id: ++this.toastSeq, text, tone };
    this.toasts = [...this.toasts, t].slice(-3);
    this.notify();
    window.setTimeout(() => this.dismissToast(t.id), tone === 'error' ? 6000 : 3500);
  }

  dismissToast(id: number) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.notify();
  }

  private queueWrite(store: 'events' | 'convs' | 'contacts', key: string, value: unknown) {
    this.writeQueue.set(`${store}:${key}`, { store, value });
    if (this.writeTimer === undefined) this.writeTimer = window.setTimeout(() => void this.flushWrites(), 60);
  }

  private async flushWrites() {
    window.clearTimeout(this.writeTimer);
    this.writeTimer = undefined;
    const batch = [...this.writeQueue.values()];
    this.writeQueue.clear();
    for (const store of ['events', 'convs', 'contacts'] as const) {
      await db.putMany(store, batch.filter((b) => b.store === store).map((b) => b.value)).catch(() => {
        this.toast('Could not save to this device. Storage may be full.', 'error');
      });
    }
  }

  private saveConv(c: Conversation) {
    this.convs.set(c.id, c);
    this.queueWrite('convs', c.id, c);
  }

  private saveContact(c: Contact) {
    this.contacts.set(c.userId, c);
    this.queueWrite('contacts', c.userId, c);
  }

  // ------------------------------------------------------------- lifecycle

  async init() {
    const missing: string[] = [];
    if (!('RTCPeerConnection' in window)) missing.push('WebRTC');
    if (!window.indexedDB) missing.push('IndexedDB storage');
    if (!crypto?.getRandomValues) missing.push('secure random numbers');
    if (missing.length) {
      this.unsupportedReason = missing;
      this.status = 'unsupported';
      return this.notify();
    }
    try {
      this.identity = (await db.get<Identity>('kv', 'identity')) ?? null;
      this.profile = (await db.get<Profile>('kv', 'profile')) ?? null;
      this.settings = { ...this.settings, ...((await db.get<Settings>('kv', 'settings')) ?? {}) };
      // Only an account the server confirmed it stored counts. (An older "registered" flag could be
      // set while the server ran without MongoDB; such devices simply register again.)
      this.registered = (await db.get<boolean>('kv', 'accountConfirmed')) ?? false;
      for (const c of await db.getAll<Contact>('contacts')) this.contacts.set(c.userId, c);
      for (const c of await db.getAll<Conversation>('convs')) this.convs.set(c.id, c);
      for (const [k, v] of Object.entries((await db.get<Record<string, Profile>>('kv', 'profiles')) ?? {})) this.profiles.set(k, v);
      for (const [k, v] of Object.entries((await db.get<Record<string, number>>('kv', 'seqs')) ?? {})) this.mySeq.set(k, v);
      for (const [k, v] of Object.entries((await db.get<Record<string, LocalInvite[]>>('kv', 'invites')) ?? {})) this.invites.set(k, v);
      for (const [k, v] of Object.entries((await db.get<Record<string, { id: string; conv: ConvId; status: ReceiptStatus }[]>>('kv', 'receipts')) ?? {}))
        this.receiptQueue.set(k, v);
      for (const k of await db.keys('files')) this.haveFiles.add(String(k));
      const all = await db.getAll<StoredEvent>('events');
      all.sort((a, b) => a.ts - b.ts);
      for (const e of all) this.index(e);
      for (const conv of this.convs.values()) if (conv.groupId) await this.rederive(conv.groupId);
    } catch (err) {
      console.error(err);
      this.status = 'error';
      return this.notify();
    }
    if (!this.identity || !this.profile) {
      this.status = 'onboarding';
      return this.notify();
    }
    this.status = 'ready';
    this.authMode = this.registered ? 'resume' : 'create';
    this.notify();
    this.start();
  }

  async createProfile(profile: Omit<Profile, 'updatedAt'>) {
    const identity = this.identity ?? (await createIdentity());
    const full: Profile = { ...profile, name: profile.name.trim().slice(0, 60), status: profile.status.trim().slice(0, 140), updatedAt: Date.now() };
    await db.put('kv', identity, 'identity');
    await db.put('kv', full, 'profile');
    this.identity = identity;
    this.profile = full;
    this.status = 'ready';
    this.authMode = 'create';
    this.showLoginCode = !!identity.loginCode;
    this.notify();
    this.restartSignaling();
  }

  /**
   * Signs in with a login code: recreates the keys, then asks the server for
   * the account. 'found' restores the profile; 'not-found' means the account
   * doesn't exist (or was removed after inactivity) and a profile can be set up
   * again with the same code.
   */
  async loginWithCode(code: string): Promise<'found' | 'not-found' | 'offline'> {
    const identity = await identityFromCode(code);
    this.identity = identity;
    this.authMode = 'login';
    const result = new Promise<'found' | 'not-found' | 'offline'>((resolve) => {
      this.loginWaiter = resolve;
      window.setTimeout(() => {
        if (this.loginWaiter === resolve) {
          this.loginWaiter = null;
          resolve('offline');
        }
      }, 15_000);
    });
    this.restartSignaling();
    return result;
  }

  /** Re-creates a removed account with the profile stored on this device. */
  reactivate() {
    this.authMode = 'create';
    this.status = 'ready';
    this.notify();
    this.restartSignaling();
  }

  dismissLoginCode() {
    this.showLoginCode = false;
    this.notify();
  }

  private restartSignaling() {
    this.signaling?.close();
    this.signaling = null;
    this.start();
  }

  private async onAuthed(account: AccountInfo | null, enabled: boolean) {
    this.accountsEnabled = enabled;
    let loginDone: ((r: 'found') => void) | null = null;
    if (this.authMode === 'login') {
      const waiter = this.loginWaiter;
      this.loginWaiter = null;
      loginDone = waiter;
      const profile = account ? sanitizeProfile(account) : null;
      if (!profile) {
        // Nothing to restore (no account, or the server keeps none): set up a profile.
        this.signaling?.close();
        this.signaling = null;
        waiter?.('not-found');
        return;
      }
      this.profile = profile;
      await db.put('kv', this.identity, 'identity');
      await db.put('kv', profile, 'profile');
    } else if (account && this.profile) {
      // Profile changed on another device: adopt the newer one.
      const remote = sanitizeProfile(account);
      if (remote && remote.updatedAt > this.profile.updatedAt) {
        this.profile = remote;
        await db.put('kv', remote, 'profile');
      }
    }
    if (account && !this.registered) {
      this.registered = true;
      await db.put('kv', true, 'accountConfirmed');
    }
    const wasLogin = this.authMode === 'login';
    // Without a confirmed account (server running without MongoDB) keep registering on each login.
    this.authMode = this.registered ? 'resume' : 'create';
    if (wasLogin) {
      this.status = 'ready';
      this.ensureSelfChat();
    }
    this.notify();
    if (wasLogin) loginDone?.('found');
    void this.refreshDirectory();
  }

  private onAccountMissing() {
    if (this.authMode === 'login') {
      const waiter = this.loginWaiter;
      this.loginWaiter = null;
      this.signaling?.close();
      this.signaling = null;
      waiter?.('not-found');
      return;
    }
    // My account was removed (e.g. 7 days without activity).
    this.signaling?.close();
    this.signaling = null;
    for (const s of [...this.sessions.values()]) s.close('expired');
    this.status = 'expired';
    this.notify();
  }

  // ------------------------------------------------------------- directory

  /** Looks up chat IDs in the account directory and remembers verified names, pictures and keys. */
  async lookupUsers(ids: UserId[]): Promise<{ enabled: boolean; found: Set<UserId> }> {
    const found = new Set<UserId>();
    const res = await this.signaling?.lookupProfiles(ids.filter((id) => id !== this.me));
    if (!res) return { enabled: false, found };
    for (const p of res.profiles) {
      // The ID is derived from the key, so the server can't hand out a wrong key unnoticed.
      if (!(await keyMatchesId(p.publicKey, p.userId))) continue;
      found.add(p.userId);
      this.directoryKeys.set(p.userId, p.publicKey as PublicJwk);
      this.setProfile(p.userId, p);
      const c = this.contacts.get(p.userId);
      if (c && !c.pub) this.saveContact({ ...c, pub: p.publicKey as PublicJwk });
    }
    return { enabled: res.enabled, found };
  }

  private async refreshDirectory() {
    const ids = [...this.relevantPeers()];
    for (let i = 0; i < ids.length; i += 100) await this.lookupUsers(ids.slice(i, i + 100));
  }

  private start() {
    if (!this.identity) return;
    if (this.status === 'ready') this.ensureSelfChat();
    if (this.signaling) return;
    this.signaling = new ChatSignaling(
      this.identity,
      {
      onAuthed: (account, enabled) => void this.onAuthed(account, enabled),
      onStatus: (s) => {
        if (s === 'missing') return this.onAccountMissing();
        this.net = s;
        if (s === 'online') {
          this.refreshWatch();
          this.announceGroups();
          void this.resendPendingJoins();
        }
        if (s === 'replaced') for (const sess of [...this.sessions.values()]) sess.close('replaced');
        this.notify();
      },
      onSignal: (from, data) => void this.onSignal(from, data),
      onPresence: (userId, online) => this.onPresence(userId, online),
      onJoinRequest: (req) => void this.onJoinRequest(req),
      onInviteResult: (r) => this.onInviteResult(r.groupId, r.accepted, r.by, r.reason),
      },
      () => ({ mode: this.authMode, profile: this.profile }),
    );
    this.signaling.start();
    if (this.listenersAttached) return;
    this.listenersAttached = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.activeConv) this.markRead(this.activeConv);
      if (document.visibilityState === 'hidden') void this.flushWrites();
    });
    window.addEventListener('pagehide', () => void this.flushWrites());
  }

  private listenersAttached = false;

  /** Take the session back after another tab replaced this one. */
  reclaim() {
    this.signaling?.reclaim();
  }

  // --------------------------------------------------------------- indexes

  private index(e: StoredEvent) {
    if (this.byId.has(e.id)) return;
    this.byId.set(e.id, e);
    let list = this.events.get(e.conv);
    if (!list) this.events.set(e.conv, (list = []));
    // Keep chronological order (events mostly arrive in order).
    let i = list.length;
    while (i > 0 && list[i - 1].ts > e.ts) i--;
    list.splice(i, 0, e);
    let authors = this.seqs.get(e.conv);
    if (!authors) this.seqs.set(e.conv, (authors = new Map()));
    let set = authors.get(e.author);
    if (!set) authors.set(e.author, (set = new Set()));
    set.add(e.seq);
    if ((e.kind === 'image' || e.kind === 'file') && !e.local.deleted) this.byFile.set((e.body as unknown as FileBody).fileId, e);
    if (this.identity && e.author === this.identity.userId) {
      this.mySeq.set(e.conv, Math.max(this.mySeq.get(e.conv) ?? 0, e.seq));
    }
  }

  /** Highest contiguous sequence per author: "I have everything up to here". */
  private vector(conv: ConvId): Record<UserId, number> {
    const out: Record<UserId, number> = {};
    for (const [author, set] of this.seqs.get(conv) ?? []) {
      let n = 0;
      while (set.has(n + 1)) n++;
      out[author] = n;
    }
    return out;
  }

  private hasSeq(conv: ConvId, author: UserId, seq: number) {
    return this.seqs.get(conv)?.get(author)?.has(seq) ?? false;
  }

  // -------------------------------------------------------------- queries

  get me(): UserId {
    return this.identity?.userId ?? '';
  }

  eventsOf(conv: ConvId): StoredEvent[] {
    const c = this.convs.get(conv);
    const cut = c?.clearedBefore ?? 0;
    return (this.events.get(conv) ?? []).filter((e) => !e.local.deleted && e.ts > cut);
  }

  event(id: string | null | undefined): StoredEvent | undefined {
    return id ? this.byId.get(id) : undefined;
  }

  profileOf(userId: UserId): Profile | undefined {
    if (userId === this.me) return this.profile ?? undefined;
    return this.profiles.get(userId);
  }

  nameOf(userId: UserId): string {
    if (userId === this.me) return 'You';
    return this.profiles.get(userId)?.name ?? `User ${userId.slice(0, 4)}`;
  }

  peerStatus(userId: UserId): PeerStatus {
    const s = this.sessions.get(userId);
    if (s?.state === 'open') return 'connected';
    if (s?.state === 'connecting') return 'connecting';
    return this.presence.get(userId) ? 'online' : 'offline';
  }

  routeOf(userId: UserId) {
    return this.sessions.get(userId)?.route ?? null;
  }

  group(conv: Conversation | undefined): GroupState | undefined {
    return conv?.groupId ? this.groups.get(conv.groupId) : undefined;
  }

  isMember(groupId: string, userId = this.me): boolean {
    return this.groups.get(groupId)?.members.has(userId) ?? false;
  }

  isAdmin(groupId: string, userId = this.me): boolean {
    return this.groups.get(groupId)?.members.get(userId)?.role === 'admin';
  }

  participants(conv: ConvId): UserId[] {
    if (conv.startsWith('dm:')) return conv.slice(3).split(':');
    const g = this.groups.get(conv.slice(2));
    return g ? [...g.members.keys()] : [];
  }

  /** The personal "(You)" chat: notes stored only on this device. */
  get selfConvId(): ConvId {
    return dmId(this.me, this.me);
  }

  isSelfChat(conv: ConvId | Conversation | undefined): boolean {
    const id = typeof conv === 'string' ? conv : conv?.id;
    return !!id && !!this.me && id === this.selfConvId;
  }

  /** Creates the personal chat once, pinned at the top like Teams. Nothing in it is ever sent. */
  private ensureSelfChat() {
    if (!this.me || this.convs.has(this.selfConvId)) return;
    this.saveConv({
      id: this.selfConvId,
      type: 'dm',
      peerId: this.me,
      pinned: true,
      muted: true,
      archived: false,
      unread: 0,
      lastTs: Date.now(),
      createdAt: Date.now(),
    });
  }

  convTitle(c: Conversation): string {
    if (this.isSelfChat(c)) return `${this.profile?.name ?? 'Me'} (You)`;
    if (c.type === 'dm') return this.nameOf(c.peerId!);
    const g = this.groups.get(c.groupId!);
    return g?.valid ? g.name : c.joining?.preview.name ?? 'Group';
  }

  convImage(c: Conversation): string | null {
    if (this.isSelfChat(c)) return this.profile?.avatar ?? null;
    if (c.type === 'dm') return this.profiles.get(c.peerId!)?.avatar ?? null;
    const g = this.groups.get(c.groupId!);
    return g?.valid ? g.image : c.joining?.preview.image ?? null;
  }

  lastEvent(conv: ConvId): StoredEvent | undefined {
    const list = this.eventsOf(conv);
    return list[list.length - 1];
  }

  describe(e: StoredEvent): string {
    const b = e.body as Record<string, unknown>;
    switch (e.kind) {
      case 'text':
        return String(b.text);
      case 'image':
        return b.caption ? `Photo: ${b.caption}` : 'Photo';
      case 'file':
        return sanitizeName(b.name);
      case 'location':
        return b.label ? `Location: ${b.label}` : 'Location';
      case 'gif':
        return b.sticker ? 'Sticker' : 'GIF';
      case 'op':
        return this.describeOp(e);
    }
  }

  describeOp(e: StoredEvent): string {
    const b = e.body as Record<string, unknown>;
    const who = this.nameOf(e.author);
    const target = typeof b.userId === 'string' ? this.nameOf(b.userId) : '';
    switch (b.op) {
      case 'create':
        return `${who} created the group "${b.name}"`;
      case 'add':
        return `${who} added ${target}`;
      case 'join':
        return `${who} joined using an invite`;
      case 'remove':
        return `${who} removed ${target}`;
      case 'leave':
        return `${who} left`;
      case 'update':
        return b.name ? `${who} renamed the group to "${b.name}"` : b.image !== undefined ? `${who} changed the group picture` : `${who} updated the group description`;
      case 'role':
        return b.role === 'admin' ? `${who} made ${target} an admin` : `${who} removed ${target} as admin`;
      case 'revoke':
        return `${who} reset the invite link`;
      case 'delete':
        return `${who} deleted the group`;
      default:
        return 'Group updated';
    }
  }

  /** Delivery status of my own message for the ticks. */
  deliveryOf(e: StoredEvent): 'waiting' | 'sent' | 'delivered' | 'read' {
    // Notes to yourself are "read" the moment they're saved.
    if (this.isSelfChat(e.conv)) return 'read';
    const others = this.participants(e.conv).filter((u) => u !== this.me);
    const statuses = others.map((u) => e.local.receipts[u]);
    if (others.length && statuses.every((s) => s === 'read')) return 'read';
    if (others.length && statuses.every((s) => s)) return 'delivered';
    return e.local.sent || statuses.some(Boolean) ? 'sent' : 'waiting';
  }

  typingIn(conv: ConvId): UserId[] {
    const now = Date.now();
    return [...(this.typing.get(conv) ?? [])].filter(([, until]) => until > now).map(([u]) => u);
  }

  requests(): Contact[] {
    return [...this.contacts.values()].filter((c) => c.state === 'request');
  }

  // ------------------------------------------------------------ presence

  private relevantPeers(): Set<UserId> {
    const set = new Set<UserId>();
    for (const c of this.contacts.values()) if (c.state !== 'blocked') set.add(c.userId);
    for (const g of this.groups.values()) {
      if (!g.members.has(this.me) || g.deleted) continue;
      for (const m of g.members.keys()) set.add(m);
    }
    set.delete(this.me);
    return set;
  }

  private refreshWatch() {
    this.signaling?.watch([...this.relevantPeers()]);
  }

  private announceGroups() {
    const ids = [...this.groups.values()].filter((g) => g.members.has(this.me) && !g.deleted).map((g) => g.groupId);
    this.signaling?.announceGroups(ids);
  }

  private onPresence(userId: UserId, online: boolean) {
    const was = this.presence.get(userId);
    this.presence.set(userId, online);
    if (online !== was) {
      const t = this.connectTimers.get(userId);
      if (t) window.clearTimeout(t.timer);
      this.connectTimers.delete(userId);
    }
    if (online) {
      // A connection attempt made while they were away can't succeed: start fresh.
      const s = this.sessions.get(userId);
      if (!was && s?.state === 'connecting') s.close('restart');
      this.maybeConnect(userId);
    }
    else {
      const r = this.reconnect.get(userId);
      if (r?.timer) window.clearTimeout(r.timer);
      this.reconnect.delete(userId);
    }
    this.notify();
  }

  // --------------------------------------------------------- connections

  private isBlocked(userId: UserId) {
    return this.contacts.get(userId)?.state === 'blocked';
  }

  private knownKey(userId: UserId): PublicJwk | undefined {
    const c = this.contacts.get(userId);
    if (c?.pub) return c.pub;
    const d = this.directoryKeys.get(userId);
    if (d) return d;
    for (const g of this.groups.values()) {
      const m = g.members.get(userId) ?? g.former.get(userId);
      if (m) return m.pub;
    }
    return undefined;
  }

  /** Opens a connection to a peer if useful and possible. Lower ID offers; the other side asks it to. */
  maybeConnect(peer: UserId) {
    if (!this.identity || peer === this.me || this.isBlocked(peer)) return;
    if (!this.signaling?.online || !this.signaling.ice) return;
    if (this.presence.get(peer) === false) return;
    const existing = this.sessions.get(peer);
    if (existing?.state === 'open') return;
    // Replace attempts that have been stuck for a while.
    if (existing?.state === 'connecting') {
      if (Date.now() - existing.createdAt < 10_000) return;
      existing.close('restart');
    }
    if (this.sessions.size >= MAX_SESSIONS) return;
    if (this.me < peer) {
      this.createSession(peer, true);
    } else {
      // The lower ID opens connections, so ask them to call us. If we asked very recently, or they
      // don't call back, try again shortly instead of giving up.
      const wait = 8000 - (Date.now() - (this.lastConnectAsk.get(peer) ?? 0));
      if (wait > 0) return this.scheduleConnect(peer, wait + 100);
      this.lastConnectAsk.set(peer, Date.now());
      void this.signaling.signal(peer, { kind: 'connect' });
      this.scheduleConnect(peer, 12_000);
    }
  }

  private connectTimers = new Map<UserId, { timer: number; tries: number }>();

  /** Retries a connection later while the peer is online and we still have no open channel. */
  private scheduleConnect(peer: UserId, delay: number) {
    const cur = this.connectTimers.get(peer);
    if (cur) window.clearTimeout(cur.timer);
    const tries = (cur?.tries ?? 0) + 1;
    if (tries > 15) return; // reset by the next presence change or opened connection
    const timer = window.setTimeout(() => {
      const s = this.sessions.get(peer);
      if (s?.state === 'open' || !this.presence.get(peer)) return;
      this.maybeConnect(peer);
    }, delay);
    this.connectTimers.set(peer, { timer, tries });
  }

  private createSession(peer: UserId, offerer: boolean): PeerSession {
    const sig = this.signaling!;
    const session: PeerSession = new PeerSession(
      this.identity!,
      peer,
      sig.ice!,
      offerer,
      {
        signal: (data) => void sig.signal(peer, data),
        onOpen: (s) => this.onSessionOpen(s),
        onMessage: (s, msg) => void this.onPeerMessage(s, msg),
        onClose: (s, reason) => this.onSessionClose(s, reason),
        onFileChannel: (s, ch) => this.onFileChannel(s, ch),
        onPeerKey: (_s, jwk) => this.learnKey(peer, jwk),
      },
      this.knownKey(peer),
    );
    this.sessions.set(peer, session);
    if (offerer) void session.start();
    this.notify();
    return session;
  }

  private learnKey(userId: UserId, jwk: PublicJwk) {
    const c = this.contacts.get(userId);
    if (c && !c.pub) this.saveContact({ ...c, pub: jwk });
  }

  private async onSignal(from: UserId, data: SignalData) {
    if (!this.identity || this.isBlocked(from) || !this.signaling?.ice) return;
    const existing = this.sessions.get(from);
    const relevant = this.relevantPeers().has(from);
    if (!relevant && !existing) {
      const strangers = [...this.sessions.keys()].filter((u) => !this.relevantPeers().has(u)).length;
      if (strangers >= MAX_STRANGER_SESSIONS) return;
    }
    if (data.kind === 'connect') {
      if (this.me < from && (!existing || existing.state === 'closed' || (existing.state === 'connecting' && Date.now() - existing.createdAt > 5000))) {
        existing?.close('restart');
        this.createSession(from, true);
      }
      return;
    }
    if (data.kind === 'offer') {
      if (this.me < from) return; // the lower ID always offers
      if (existing && existing.state !== 'closed') existing.close('replaced');
      const s = this.createSession(from, false);
      await s.handleSignal(data);
      return;
    }
    if (existing && existing.state !== 'closed') await existing.handleSignal(data);
  }

  private onSessionOpen(s: PeerSession) {
    this.reconnect.delete(s.peerId);
    const t = this.connectTimers.get(s.peerId);
    if (t) window.clearTimeout(t.timer);
    this.connectTimers.delete(s.peerId);
    s.send({ t: 'hello', v: 1, profile: this.profile });
    window.setTimeout(() => void s.detectRoute().then(() => this.notify()), 800);
    this.notify();
  }

  private onSessionClose(s: PeerSession, reason: string) {
    if (this.sessions.get(s.peerId) === s) this.sessions.delete(s.peerId);
    for (const req of this.fileRequests.values()) if (req.peer === s.peerId) req.abort.abort();
    this.notify();
    if (reason === 'replaced' || reason === 'restart' || this.isBlocked(s.peerId)) return;
    // Reconnect with backoff while the peer is still online and relevant.
    if (this.presence.get(s.peerId) && this.relevantPeers().has(s.peerId)) {
      const r = this.reconnect.get(s.peerId) ?? { attempts: 0 };
      r.attempts++;
      const delay = Math.min(60_000, 2000 * 2 ** Math.min(r.attempts, 5));
      if (r.timer) window.clearTimeout(r.timer);
      r.timer = window.setTimeout(() => this.maybeConnect(s.peerId), delay);
      this.reconnect.set(s.peerId, r);
    }
  }

  private sendTo(peer: UserId, msg: Record<string, unknown>): boolean {
    const s = this.sessions.get(peer);
    return s?.state === 'open' ? s.send(msg) : false;
  }

  // -------------------------------------------------------- peer protocol

  private async onPeerMessage(s: PeerSession, msg: Record<string, unknown>) {
    const peer = s.peerId;
    if (this.isBlocked(peer)) return;
    switch (msg.t) {
      case 'hello':
        this.setProfile(peer, msg.profile);
        this.afterHello(s);
        break;
      case 'profile':
        this.setProfile(peer, msg.profile);
        break;
      case 'sync': {
        const conv = String(msg.conv);
        this.onSyncRequest(peer, conv, msg.vector as Record<string, number>);
        // Catch-up is mutual: if they're syncing a conversation we also have, ask them too.
        if (this.convs.has(conv) && !s.asked.has(conv)) this.requestSync(s, conv);
        // A member is syncing a group we don't know yet: we may have been added while
        // offline. Fetch it provisionally; it's dropped if the log doesn't include us.
        else if (!this.convs.has(conv) && /^g:[A-Za-z0-9_-]{16,40}$/.test(conv)) this.onGroupHello(peer, conv.slice(2));
        // Same for a direct chat we don't have yet (e.g. signed in on a new device).
        else if (!this.convs.has(conv) && conv === dmId(this.me, peer)) {
          this.ensureDm(peer, this.contacts.get(peer)?.state === 'contact' ? 'contact' : 'request');
          this.requestSync(s, conv);
          this.notify();
        }
        break;
      }
      case 'events':
        if (Array.isArray(msg.events)) {
          for (const e of msg.events.slice(0, SYNC_BATCH * 2)) await this.ingest(e, peer);
        }
        if (msg.done) this.onSyncDone(String(msg.conv));
        break;
      case 'event':
        await this.ingest(msg.e, peer);
        break;
      case 'receipt':
        if (Array.isArray(msg.items)) this.onReceipts(peer, msg.items as { id: string; status: ReceiptStatus }[]);
        break;
      case 'typing':
        this.onTyping(peer, String(msg.conv));
        break;
      case 'group-hello':
        this.onGroupHello(peer, String(msg.groupId));
        break;
      case 'file-req':
        void this.serveFile(s, String(msg.fileId), String(msg.rid));
        break;
      case 'file-na':
        this.onFileUnavailable(String(msg.rid));
        break;
    }
  }

  private setProfile(peer: UserId, raw: unknown) {
    const p = sanitizeProfile(raw);
    if (!p) return;
    const cur = this.profiles.get(peer);
    if (cur && cur.updatedAt > p.updatedAt) return;
    this.profiles.set(peer, p);
    void db.put('kv', Object.fromEntries(this.profiles), 'profiles');
    this.notify();
  }

  /** Conversations both sides should keep in sync. */
  private sharedConvs(peer: UserId): ConvId[] {
    const out: ConvId[] = [];
    const dm = dmId(this.me, peer);
    if (this.convs.has(dm)) out.push(dm);
    for (const c of this.convs.values()) {
      if (c.type !== 'group' || !c.groupId) continue;
      const g = this.groups.get(c.groupId);
      if ((g?.members.has(peer) && g.members.has(this.me)) || c.joining || this.provisional.has(c.id)) out.push(c.id);
    }
    return out;
  }

  private requestSync(s: PeerSession, conv: ConvId) {
    s.asked.add(conv);
    s.send({ t: 'sync', conv, vector: this.vector(conv) });
  }

  private afterHello(s: PeerSession) {
    for (const conv of this.sharedConvs(s.peerId)) this.requestSync(s, conv);
    this.flushReceipts(s.peerId);
    this.resumeDownloads();
  }

  private mayRead(peer: UserId, conv: ConvId): boolean {
    if (this.isBlocked(peer)) return false;
    if (conv.startsWith('dm:')) return conv === dmId(this.me, peer) && this.convs.has(conv);
    const g = this.groups.get(conv.slice(2));
    return !!g && g.members.has(peer) && g.members.has(this.me);
  }

  private onSyncRequest(peer: UserId, conv: ConvId, vector: Record<string, number>) {
    if (!CONV_RE.test(conv)) return;
    if (!this.mayRead(peer, conv)) {
      this.sendTo(peer, { t: 'events', conv, events: [], done: true });
      return;
    }
    const want = (this.events.get(conv) ?? []).filter((e) => !e.local.deleted && e.seq > (Number(vector?.[e.author]) || 0));
    // Group operations first so the receiver can verify the messages that follow.
    want.sort((a, b) => (a.kind === 'op' ? 0 : 1) - (b.kind === 'op' ? 0 : 1) || a.ts - b.ts);
    const strip = (e: StoredEvent): ChatEvent => ({
      v: e.v,
      id: e.id,
      conv: e.conv,
      author: e.author,
      seq: e.seq,
      ts: e.ts,
      kind: e.kind,
      body: e.body,
      replyTo: e.replyTo,
      sig: e.sig,
    });
    if (!want.length) {
      this.sendTo(peer, { t: 'events', conv, events: [], done: true });
      return;
    }
    for (let i = 0; i < want.length; i += SYNC_BATCH) {
      const chunk = want.slice(i, i + SYNC_BATCH).map(strip);
      this.sendTo(peer, { t: 'events', conv, events: chunk, done: i + SYNC_BATCH >= want.length });
    }
    // They now have my messages: mark them as handed over.
    for (const e of want) if (e.author === this.me && !e.local.sent) this.markSent(e);
  }

  private onSyncDone(conv: ConvId) {
    if (this.provisional.has(conv)) {
      const c = this.convs.get(conv);
      // Someone said "you're in this group", but the log doesn't show it: drop it.
      if (c?.groupId && !this.isMember(c.groupId) && !c.joining) {
        this.convs.delete(conv);
        void db.delete('convs', conv);
      }
      this.provisional.delete(conv);
      this.notify();
    }
  }

  private markSent(e: StoredEvent) {
    e.local.sent = true;
    this.queueWrite('events', e.id, e);
  }

  // -------------------------------------------------------------- ingest

  /**
   * Validates, verifies and stores an event from a peer (or myself).
   * Group events whose author we can't verify yet are held until the
   * operation that adds the author arrives.
   */
  private async ingest(raw: unknown, from?: UserId): Promise<'new' | 'dup' | 'held' | 'rejected'> {
    if (!validEvent(raw) || !this.identity) return 'rejected';
    const e = raw;
    if (this.byId.has(e.id) || this.hasSeq(e.conv, e.author, e.seq)) return 'dup';
    if (this.isBlocked(e.author)) return 'rejected';

    let key: PublicJwk | null | undefined = null;
    if (e.conv.startsWith('dm:')) {
      const [a, b] = e.conv.slice(3).split(':');
      if (a >= b || (a !== this.me && b !== this.me) || (e.author !== a && e.author !== b)) return 'rejected';
      if (e.kind === 'op') return 'rejected';
      // In a direct chat only the two participants exchange events.
      if (from && from !== a && from !== b) return 'rejected';
      key = e.author === this.me ? this.identity.publicJwk : this.knownKey(e.author) ?? this.sessions.get(e.author)?.peerKey;
      if (!key) return 'rejected';
    } else {
      const groupId = e.conv.slice(2);
      const conv = this.convs.get(e.conv);
      if (!conv) return 'rejected';
      const b = e.body as Record<string, unknown>;
      if (e.kind === 'op' && (b.op === 'create' || b.op === 'join')) {
        if (!(await keyMatchesId(b.pub, e.author))) return 'rejected';
        key = b.pub as PublicJwk;
      } else {
        const g = this.groups.get(groupId);
        key = g ? authorKey(g, e.author, e.ts) : null;
        if (!key) {
          const list = this.held.get(e.conv) ?? [];
          if (list.length < 500 && !list.some((x) => x.id === e.id)) list.push(e);
          this.held.set(e.conv, list);
          return 'held';
        }
      }
    }

    const { sig, ...unsigned } = e;
    if (!(await verify(key, eventSignable(unsigned), sig))) return 'rejected';
    if (this.byId.has(e.id) || this.hasSeq(e.conv, e.author, e.seq)) return 'dup';

    const stored: StoredEvent = { ...e, local: { receipts: {}, sent: e.author === this.me } };
    this.store(stored);

    if (e.kind === 'op') {
      await this.rederive(e.conv.slice(2));
      await this.retryHeld(e.conv);
    }
    if (e.author !== this.me) this.onNewIncoming(stored);
    this.notify();
    return 'new';
  }

  private store(e: StoredEvent) {
    this.index(e);
    this.queueWrite('events', e.id, e);
    let conv = this.convs.get(e.conv);
    if (!conv && e.conv.startsWith('dm:')) conv = this.ensureDm(e.author === this.me ? e.conv.slice(3).split(':').find((u) => u !== this.me)! : e.author, 'request');
    if (!conv) return;
    const next = { ...conv };
    if (e.ts > next.lastTs) next.lastTs = e.ts;
    if (e.author !== this.me && e.kind !== 'op' && !(this.activeConv === e.conv && document.visibilityState === 'visible')) {
      next.unread += 1;
      if (next.archived && !next.muted) next.archived = false;
    }
    this.saveConv(next);
  }

  private async retryHeld(conv: ConvId) {
    const list = this.held.get(conv);
    if (!list?.length) return;
    this.held.delete(conv);
    for (const e of list) await this.ingest(e);
  }

  private async rederive(groupId: string) {
    // Serialise derivations per group; they are async.
    const prev = this.groupLocks.get(groupId) ?? Promise.resolve();
    const run = prev.then(async () => {
      const ops = (this.events.get(`g:${groupId}`) ?? []).filter((e) => e.kind === 'op');
      const before = this.groups.get(groupId);
      const state = await deriveGroup(groupId, ops);
      this.groups.set(groupId, state);
      const conv = this.convs.get(`g:${groupId}`);
      if (conv?.joining && state.members.has(this.me)) {
        this.saveConv({ ...conv, joining: undefined });
        this.toast(`You joined ${state.name}`, 'success');
      }
      const membersChanged =
        !before || before.members.size !== state.members.size || [...state.members.keys()].some((m) => !before.members.has(m));
      if (membersChanged || before?.deleted !== state.deleted) {
        this.refreshWatch();
        this.announceGroups();
        for (const m of state.members.keys()) if (this.presence.get(m)) this.maybeConnect(m);
      }
      if (state.members.has(this.me) && state.members.get(this.me)?.role === 'admin') this.refreshInvitePreviews(groupId);
    });
    this.groupLocks.set(groupId, run.catch(() => {}));
    await run;
  }

  private incomingListeners = new Set<(e: StoredEvent) => void>();

  /** Called for each newly received message (not group operations). Used for notifications. */
  onIncoming(fn: (e: StoredEvent) => void) {
    this.incomingListeners.add(fn);
    return () => void this.incomingListeners.delete(fn);
  }

  /** Total unread messages in conversations that aren't muted (for the tab badge). */
  unreadTotal(): number {
    let n = 0;
    for (const c of this.convs.values()) if (!c.muted && c.unread > 0) n += c.unread;
    return n;
  }

  private onNewIncoming(e: StoredEvent) {
    if (e.kind === 'op') return;
    for (const l of this.incomingListeners) l(e);
    const conv = this.convs.get(e.conv);
    const accepted = e.conv.startsWith('g:') || this.contacts.get(e.author)?.state === 'contact';
    const viewing = this.activeConv === e.conv && document.visibilityState === 'visible';
    this.queueReceipt(e, viewing && accepted ? 'read' : 'delivered');
    this.typing.get(e.conv)?.delete(e.author);
    if ((e.kind === 'image' || e.kind === 'file') && accepted && conv) {
      const b = e.body as unknown as FileBody;
      if (b.size <= AUTO_DOWNLOAD_LIMIT) void this.download(b.fileId);
    }
  }

  // ----------------------------------------------------------- receipts

  private queueReceipt(e: StoredEvent, status: ReceiptStatus) {
    const mine = e.local.receipts[this.me];
    if (mine && rank[mine] >= rank[status]) return;
    e.local.receipts[this.me] = status;
    this.queueWrite('events', e.id, e);
    const list = (this.receiptQueue.get(e.author) ?? []).filter((r) => r.id !== e.id);
    list.push({ id: e.id, conv: e.conv, status });
    this.receiptQueue.set(e.author, list.slice(-2000));
    this.flushReceipts(e.author);
  }

  private flushReceipts(peer: UserId) {
    const list = this.receiptQueue.get(peer);
    if (list?.length && this.sendTo(peer, { t: 'receipt', items: list.slice(0, 500) })) {
      const rest = list.slice(500);
      if (rest.length) this.receiptQueue.set(peer, rest);
      else this.receiptQueue.delete(peer);
    }
    void db.put('kv', Object.fromEntries(this.receiptQueue), 'receipts');
  }

  private onReceipts(peer: UserId, items: { id: string; status: ReceiptStatus }[]) {
    let changed = false;
    for (const it of items.slice(0, 1000)) {
      const e = this.byId.get(String(it.id));
      if (!e || e.author !== this.me || (it.status !== 'delivered' && it.status !== 'read')) continue;
      if (!this.participants(e.conv).includes(peer)) continue;
      const cur = e.local.receipts[peer];
      if (cur && rank[cur] >= rank[it.status]) continue;
      e.local.receipts[peer] = it.status;
      e.local.sent = true;
      this.queueWrite('events', e.id, e);
      changed = true;
    }
    if (changed) this.notify();
  }

  markRead(conv: ConvId) {
    const c = this.convs.get(conv);
    if (!c) return;
    // Nothing is read while the tab is in the background; it happens when the user comes back.
    if (document.visibilityState !== 'visible') return;
    if (c.unread) this.saveConv({ ...c, unread: 0 });
    const accepted = conv.startsWith('g:') || this.contacts.get(c.peerId!)?.state === 'contact';
    if (!accepted || document.visibilityState !== 'visible') return this.notify();
    for (const e of this.events.get(conv) ?? []) {
      if (e.author !== this.me && e.kind !== 'op' && e.local.receipts[this.me] !== 'read') this.queueReceipt(e, 'read');
    }
    this.notify();
  }

  setActive(conv: ConvId | null) {
    this.activeConv = conv;
    if (conv) {
      this.markRead(conv);
      for (const p of this.participants(conv)) if (p !== this.me) this.maybeConnect(p);
    }
  }

  // -------------------------------------------------------------- typing

  sendTyping(conv: ConvId) {
    const last = this.typingSent.get(conv) ?? 0;
    if (Date.now() - last < 2500) return;
    this.typingSent.set(conv, Date.now());
    for (const p of this.participants(conv)) if (p !== this.me) this.sendTo(p, { t: 'typing', conv });
  }

  private onTyping(peer: UserId, conv: ConvId) {
    if (!this.participants(conv).includes(peer)) return;
    let m = this.typing.get(conv);
    if (!m) this.typing.set(conv, (m = new Map()));
    m.set(peer, Date.now() + TYPING_TTL);
    this.notify();
    window.setTimeout(() => this.notify(), TYPING_TTL + 50);
  }

  // ------------------------------------------------------------- sending

  private nextSeq(conv: ConvId): number {
    const n = (this.mySeq.get(conv) ?? 0) + 1;
    this.mySeq.set(conv, n);
    void db.put('kv', Object.fromEntries(this.mySeq), 'seqs');
    return n;
  }

  private async makeEvent(conv: ConvId, kind: EventKind, body: Record<string, unknown>, replyTo: string | null = null): Promise<ChatEvent> {
    const unsigned = { v: 1 as const, id: randomId(), conv, author: this.me, seq: this.nextSeq(conv), ts: Date.now(), kind, body, replyTo };
    return { ...unsigned, sig: await sign(this.identity!, eventSignable(unsigned)) };
  }

  /** Stores my event and pushes it to every connected participant. */
  private async publish(e: ChatEvent) {
    const stored: StoredEvent = { ...e, local: { receipts: {}, sent: false } };
    this.store(stored);
    if (e.kind === 'op') await this.rederive(e.conv.slice(2));
    let pushed = false;
    for (const p of this.participants(e.conv)) {
      if (p === this.me) continue;
      if (this.sendTo(p, { t: 'event', e })) pushed = true;
      else this.maybeConnect(p);
    }
    if (pushed) this.markSent(stored);
    this.notify();
    return stored;
  }

  private canPost(conv: ConvId): string | null {
    const c = this.convs.get(conv);
    if (!c) return 'Conversation not found.';
    if (c.type === 'dm') {
      if (this.isBlocked(c.peerId!)) return 'Unblock this contact to send messages.';
      return null;
    }
    const g = this.groups.get(c.groupId!);
    if (c.joining) return 'You can send messages once you have been added to the group.';
    if (!g?.members.has(this.me)) return "You're no longer a member of this group.";
    if (g.deleted) return 'This group was deleted.';
    return null;
  }

  async sendText(conv: ConvId, text: string, replyTo: string | null = null) {
    const t = text.trim();
    if (!t) return;
    this.typingSent.delete(conv);
    const err = this.canPost(conv);
    if (err) return this.toast(err, 'error');
    for (let i = 0; i < t.length; i += MAX_TEXT) {
      await this.publish(await this.makeEvent(conv, 'text', { text: t.slice(i, i + MAX_TEXT) }, i === 0 ? replyTo : null));
    }
    this.acceptIfRequest(conv);
  }

  async sendGif(conv: ConvId, gif: { id: string; url: string; width: number; height: number; title?: string }, sticker: boolean, replyTo: string | null = null) {
    const err = this.canPost(conv);
    if (err) return this.toast(err, 'error');
    const body: Record<string, unknown> = { id: gif.id, url: gif.url, width: Math.round(gif.width), height: Math.round(gif.height) };
    if (gif.title) body.title = gif.title.slice(0, 120);
    if (sticker) body.sticker = true;
    await this.publish(await this.makeEvent(conv, 'gif', body, replyTo));
    this.acceptIfRequest(conv);
  }

  async sendLocation(conv: ConvId, loc: LocationBody, replyTo: string | null = null) {
    const err = this.canPost(conv);
    if (err) return this.toast(err, 'error');
    const body: Record<string, unknown> = { lat: +loc.lat.toFixed(6), lng: +loc.lng.toFixed(6) };
    if (loc.accuracy !== undefined) body.accuracy = Math.round(loc.accuracy);
    if (loc.label) body.label = loc.label.slice(0, 200);
    if (loc.current) body.current = true;
    await this.publish(await this.makeEvent(conv, 'location', body, replyTo));
  }

  async sendFiles(conv: ConvId, files: File[], as: FileClass, caption = '', replyTo: string | null = null) {
    const err = this.canPost(conv);
    if (err) return this.toast(err, 'error');
    for (const [i, file] of files.entries()) {
      const problem = validateOutgoing(file, as);
      if (problem) {
        this.toast(problem, 'error');
        continue;
      }
      try {
        const cls = classify(file.name)!;
        if (cls === 'image' && !(await isRealImage(file))) {
          this.toast(`${file.name} isn't a valid image.`, 'error');
          continue;
        }
        const fileId = randomId();
        const sha256 = await sha256Hex(await file.arrayBuffer());
        const body: Record<string, unknown> = {
          fileId,
          name: sanitizeName(file.name),
          size: file.size,
          type: mimeFor(file.name),
          sha256,
        };
        if (cls === 'image') Object.assign(body, await imageInfo(file).catch(() => ({})));
        if (caption && i === 0) body.caption = caption.slice(0, 1000);
        const blob = new Blob([file], { type: mimeFor(file.name) });
        await db.put('files', { fileId, blob });
        this.haveFiles.add(fileId);
        this.transfers.set(fileId, { status: 'done' });
        await this.publish(await this.makeEvent(conv, cls === 'image' ? 'image' : 'file', body, i === 0 ? replyTo : null));
      } catch {
        this.toast(`Couldn't prepare ${file.name}.`, 'error');
      }
    }
  }

  // --------------------------------------------------------------- files

  hasFile(fileId: string) {
    return this.haveFiles.has(fileId);
  }

  transferOf(fileId: string): FileTransferState {
    if (this.haveFiles.has(fileId)) return { status: 'done' };
    return this.transfers.get(fileId) ?? { status: 'missing' };
  }

  async fileUrl(fileId: string): Promise<string | null> {
    const cached = this.fileUrls.get(fileId);
    if (cached) return cached;
    const rec = await db.get<{ fileId: string; blob: Blob }>('files', fileId);
    if (!rec) return null;
    const e = this.byFile.get(fileId);
    const type = e ? mimeFor(String((e.body as Record<string, unknown>).name)) : 'application/octet-stream';
    // Images display inline; everything else is handed to the browser as an opaque download.
    const blob = e?.kind === 'image' ? rec.blob.slice(0, rec.blob.size, type) : rec.blob.slice(0, rec.blob.size, 'application/octet-stream');
    const url = URL.createObjectURL(blob);
    this.fileUrls.set(fileId, url);
    return url;
  }

  /** Fetches a file from whoever has it: the author first, then other participants. */
  async download(fileId: string) {
    if (this.haveFiles.has(fileId)) return;
    const e = this.byFile.get(fileId);
    if (!e) return;
    const cur = this.transfers.get(fileId);
    if (cur?.status === 'downloading') return;
    const req: FileRequest = { rid: '', fileId, conv: e.conv, peer: '', tried: new Set(), abort: new AbortController() };
    this.requestFrom(req);
  }

  private requestFrom(req: FileRequest) {
    const e = this.byFile.get(req.fileId);
    if (!e) return;
    const candidates = [e.author, ...this.participants(e.conv)].filter(
      (p, i, a) => p !== this.me && a.indexOf(p) === i && !req.tried.has(p) && this.sessions.get(p)?.state === 'open',
    );
    const peer = candidates[0];
    if (!peer) {
      this.transfers.set(req.fileId, req.tried.size ? { status: 'failed', reason: 'Nobody online has this file right now.' } : { status: 'missing' });
      return this.notify();
    }
    req.tried.add(peer);
    req.peer = peer;
    req.rid = randomId(12);
    req.abort = new AbortController();
    this.fileRequests.set(req.rid, req);
    this.transfers.set(req.fileId, { status: 'downloading', received: 0, total: Number((e.body as Record<string, unknown>).size) });
    this.sendTo(peer, { t: 'file-req', fileId: req.fileId, rid: req.rid });
    // If the peer never opens a channel, move on.
    window.setTimeout(() => {
      if (this.fileRequests.get(req.rid) === req && this.transfers.get(req.fileId)?.status === 'downloading' && (this.transfers.get(req.fileId) as { received: number }).received === 0) {
        this.fileRequests.delete(req.rid);
        this.requestFrom(req);
      }
    }, 20_000);
    this.notify();
  }

  private onFileUnavailable(rid: string) {
    const req = this.fileRequests.get(rid);
    if (!req) return;
    this.fileRequests.delete(rid);
    this.requestFrom(req);
  }

  cancelDownload(fileId: string) {
    for (const req of this.fileRequests.values()) if (req.fileId === fileId) req.abort.abort();
  }

  private resumeDownloads() {
    for (const e of this.byFile.values()) {
      if (e.author === this.me || this.haveFiles.has((e.body as unknown as FileBody).fileId)) continue;
      const b = e.body as unknown as FileBody;
      const t = this.transfers.get(b.fileId);
      const accepted = e.conv.startsWith('g:') || this.contacts.get(e.author)?.state === 'contact';
      if (accepted && b.size <= AUTO_DOWNLOAD_LIMIT && (!t || t.status === 'missing')) void this.download(b.fileId);
    }
  }

  private onFileChannel(s: PeerSession, channel: RTCDataChannel) {
    const rid = channel.label.slice(5);
    const req = this.fileRequests.get(rid);
    if (!req || req.peer !== s.peerId) return channel.close();
    const e = this.byFile.get(req.fileId);
    if (!e) return channel.close();
    const b = e.body as unknown as FileBody;
    receiveFile(
      channel,
      { size: b.size, sha256: b.sha256 },
      (received) => {
        this.transfers.set(req.fileId, { status: 'downloading', received, total: b.size });
        this.notify();
      },
      req.abort.signal,
    )
      .then(async (blob) => {
        this.fileRequests.delete(rid);
        if (e.kind === 'image' && !(await isRealImage(blob))) {
          this.transfers.set(req.fileId, { status: 'failed', reason: "This file isn't a valid image." });
          return this.notify();
        }
        await db.put('files', { fileId: req.fileId, blob });
        this.haveFiles.add(req.fileId);
        this.transfers.set(req.fileId, { status: 'done' });
        this.notify();
      })
      .catch((err) => {
        this.fileRequests.delete(rid);
        if (err instanceof TransferCancelled) {
          this.transfers.set(req.fileId, { status: 'cancelled' });
          this.notify();
        } else {
          this.requestFrom(req);
        }
      });
  }

  private async serveFile(s: PeerSession, fileId: string, rid: string) {
    const e = this.byFile.get(fileId);
    if (!e || !this.mayRead(s.peerId, e.conv) || !/^[A-Za-z0-9_-]{8,32}$/.test(rid)) {
      return void s.send({ t: 'file-na', rid });
    }
    const rec = await db.get<{ fileId: string; blob: Blob }>('files', fileId);
    if (!rec) return void s.send({ t: 'file-na', rid });
    const channel = s.openFileChannel(`file:${rid}`);
    const max = s.pc.sctp?.maxMessageSize;
    const chunk = max && Number.isFinite(max) ? Math.max(16 * 1024, Math.min(64 * 1024, max)) : 16 * 1024;
    sendFile(channel, rec.blob, chunk).catch(() => channel.close());
  }

  // ------------------------------------------------------ conversations

  private ensureDm(peer: UserId, state: 'contact' | 'request'): Conversation {
    const id = dmId(this.me, peer);
    const existing = this.convs.get(id);
    if (!this.contacts.has(peer)) {
      this.saveContact({ userId: peer, state, addedAt: Date.now(), pub: this.sessions.get(peer)?.peerKey ?? undefined });
      this.refreshWatch();
    }
    if (existing) return existing;
    const conv: Conversation = {
      id,
      type: 'dm',
      peerId: peer,
      pinned: false,
      muted: false,
      archived: false,
      unread: 0,
      lastTs: Date.now(),
      createdAt: Date.now(),
    };
    this.saveConv(conv);
    return conv;
  }

  startDirectChat(peer: UserId): ConvId | null {
    if (peer === this.me) {
      this.ensureSelfChat();
      return this.selfConvId;
    }
    const c = this.contacts.get(peer);
    if (c?.state === 'request') this.saveContact({ ...c, state: 'contact' });
    const conv = this.ensureDm(peer, 'contact');
    this.refreshWatch();
    this.maybeConnect(peer);
    void this.lookupUsers([peer]);
    this.notify();
    return conv.id;
  }

  private acceptIfRequest(conv: ConvId) {
    const c = this.convs.get(conv);
    if (c?.type === 'dm') {
      const contact = this.contacts.get(c.peerId!);
      if (contact?.state === 'request') this.acceptRequest(c.peerId!);
    }
  }

  acceptRequest(peer: UserId) {
    const c = this.contacts.get(peer);
    if (!c) return;
    this.saveContact({ ...c, state: 'contact' });
    const conv = dmId(this.me, peer);
    if (this.activeConv === conv) this.markRead(conv);
    this.resumeDownloads();
    this.notify();
  }

  blockUser(peer: UserId) {
    const c = this.contacts.get(peer) ?? { userId: peer, addedAt: Date.now(), state: 'blocked' as const };
    this.saveContact({ ...c, state: 'blocked' });
    this.sessions.get(peer)?.close('blocked');
    this.notify();
  }

  unblockUser(peer: UserId) {
    const c = this.contacts.get(peer);
    if (!c) return;
    this.saveContact({ ...c, state: 'contact' });
    this.refreshWatch();
    this.maybeConnect(peer);
    this.notify();
  }

  updateConv(conv: ConvId, patch: Partial<Pick<Conversation, 'pinned' | 'muted' | 'archived'>>) {
    const c = this.convs.get(conv);
    if (c) this.saveConv({ ...c, ...patch });
    this.notify();
  }

  /** Removes message content from this device. Sequence numbers are kept so sync doesn't re-download them. */
  async deleteLocal(ids: string[]) {
    for (const id of ids) {
      const e = this.byId.get(id);
      if (!e || e.kind === 'op') continue;
      if (e.kind === 'image' || e.kind === 'file') await this.dropFile((e.body as unknown as FileBody).fileId);
      e.local.deleted = true;
      e.body = {};
      this.queueWrite('events', e.id, e);
    }
    this.notify();
  }

  async clearHistory(conv: ConvId) {
    const c = this.convs.get(conv);
    if (!c) return;
    await this.deleteLocal((this.events.get(conv) ?? []).filter((e) => e.kind !== 'op').map((e) => e.id));
    this.saveConv({ ...c, clearedBefore: Date.now(), unread: 0 });
    this.notify();
  }

  private async dropFile(fileId: string) {
    this.haveFiles.delete(fileId);
    this.byFile.delete(fileId);
    const url = this.fileUrls.get(fileId);
    if (url) URL.revokeObjectURL(url);
    this.fileUrls.delete(fileId);
    await db.delete('files', fileId).catch(() => {});
  }

  // -------------------------------------------------------------- profile

  async updateProfile(patch: Partial<Omit<Profile, 'updatedAt'>>) {
    if (!this.profile) return;
    const p: Profile = { ...this.profile, ...patch, updatedAt: Date.now() };
    p.name = p.name.trim().slice(0, 60) || this.profile.name;
    p.status = p.status.trim().slice(0, 140);
    this.profile = p;
    await db.put('kv', p, 'profile');
    for (const s of this.sessions.values()) s.send({ t: 'profile', profile: p });
    void this.signaling?.updateProfile(p);
    this.notify();
  }

  async updateSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    await db.put('kv', this.settings, 'settings');
    this.notify();
  }

  async deleteAllData(redirect = '/chat') {
    for (const s of this.sessions.values()) s.close('wipe');
    this.signaling?.close();
    for (const url of this.fileUrls.values()) URL.revokeObjectURL(url);
    await db.destroy();
    window.location.assign(redirect);
  }

  /**
   * Signs out of this device: removes the identity, chats and files stored here.
   * The account itself stays on the server, so the login code signs back in.
   */
  signOut() {
    return this.deleteAllData('/chat/login');
  }

  // --------------------------------------------------------------- groups

  async createGroup(input: { name: string; description: string; image: string | null; members: UserId[] }): Promise<ConvId> {
    const groupId = randomId(16);
    const id = `g:${groupId}`;
    this.saveConv({ id, type: 'group', groupId, pinned: false, muted: false, archived: false, unread: 0, lastTs: Date.now(), createdAt: Date.now() });
    await this.publish(
      await this.makeEvent(id, 'op', {
        op: 'create',
        name: input.name.trim().slice(0, 80),
        description: input.description.trim().slice(0, 500),
        image: input.image,
        pub: this.identity!.publicJwk,
      }),
    );
    if (input.members.length) await this.addMembers(groupId, input.members);
    return id;
  }

  private async groupOp(groupId: string, body: Record<string, unknown>) {
    const g = this.groups.get(groupId);
    if (!g?.members.has(this.me)) throw new Error("You're not a member of this group.");
    await this.publish(await this.makeEvent(`g:${groupId}`, 'op', body));
  }

  canAdd(userId: UserId): boolean {
    return !!this.knownKey(userId);
  }

  async addMembers(groupId: string, userIds: UserId[]) {
    const g = this.groups.get(groupId);
    if (!g || !this.isAdmin(groupId)) return this.toast('Only admins can add participants.', 'error');
    for (const u of userIds) {
      if (g.members.has(u)) continue;
      if (this.groups.get(groupId)!.members.size >= MAX_GROUP_MEMBERS) {
        this.toast(`Groups are limited to ${MAX_GROUP_MEMBERS} participants.`, 'error');
        break;
      }
      const pub = this.knownKey(u);
      if (!pub) {
        this.toast(`Chat with ${this.nameOf(u)} once before adding them, so their identity can be verified.`, 'error');
        continue;
      }
      await this.groupOp(groupId, { op: 'add', userId: u, pub });
      // Tell them, so they fetch the group.
      if (!this.sendTo(u, { t: 'group-hello', groupId })) this.pendingGroupHello(u, groupId);
    }
  }

  private pendingHellos = new Map<UserId, Set<string>>();

  private pendingGroupHello(peer: UserId, groupId: string) {
    const set = this.pendingHellos.get(peer) ?? new Set();
    set.add(groupId);
    this.pendingHellos.set(peer, set);
    this.maybeConnect(peer);
    const tryLater = (n: number) =>
      window.setTimeout(() => {
        if (this.sendTo(peer, { t: 'group-hello', groupId })) set.delete(groupId);
        else if (n < 30) tryLater(n + 1);
      }, 2000);
    tryLater(0);
  }

  private onGroupHello(peer: UserId, groupId: string) {
    if (!/^[A-Za-z0-9_-]{16,40}$/.test(groupId)) return;
    const id = `g:${groupId}`;
    if (!this.convs.has(id)) {
      this.saveConv({ id, type: 'group', groupId, pinned: false, muted: false, archived: false, unread: 0, lastTs: Date.now(), createdAt: Date.now() });
      this.provisional.add(id);
    }
    const s = this.sessions.get(peer);
    if (s?.state === 'open') this.requestSync(s, id);
  }

  removeMember(groupId: string, userId: UserId) {
    return this.groupOp(groupId, { op: 'remove', userId });
  }

  setRole(groupId: string, userId: UserId, role: 'admin' | 'member') {
    return this.groupOp(groupId, { op: 'role', userId, role });
  }

  updateGroup(groupId: string, patch: { name?: string; description?: string; image?: string | null }) {
    return this.groupOp(groupId, patch.image === undefined ? { op: 'update', ...patch } : { op: 'update', ...patch });
  }

  async leaveGroup(groupId: string) {
    await this.groupOp(groupId, { op: 'leave' });
    this.announceGroups();
  }

  async deleteGroup(groupId: string) {
    await this.groupOp(groupId, { op: 'delete' });
    for (const inv of this.invites.get(groupId) ?? []) if (!inv.revoked) await this.signaling?.revokeInvite(inv.token).catch(() => {});
  }

  /** Removes a group (that I left, or that was deleted) from this device. */
  async forgetConversation(conv: ConvId) {
    const c = this.convs.get(conv);
    if (!c) return;
    await this.clearHistory(conv);
    this.saveConv({ ...c, archived: true, clearedBefore: Date.now(), unread: 0 });
    this.notify();
  }

  // -------------------------------------------------------------- invites

  invitesOf(groupId: string): LocalInvite[] {
    return (this.invites.get(groupId) ?? []).filter((i) => !i.revoked);
  }

  private saveInvites() {
    void db.put('kv', Object.fromEntries(this.invites), 'invites');
  }

  private previewOf(g: GroupState) {
    return { name: g.name, description: g.description, image: g.image && g.image.length <= 48 * 1024 ? g.image : null, memberCount: g.members.size };
  }

  async createInvite(groupId: string, opts: { expiresAt: number | null; maxUses: number | null }): Promise<LocalInvite> {
    const g = this.groups.get(groupId);
    if (!g || !this.isAdmin(groupId)) throw new Error('Only admins can create invitations.');
    if (!(await this.waitOnline()) || !this.signaling) throw new Error("You're offline. Connect to the internet to create an invitation.");
    const token = randomId(18);
    const unsigned = { v: 1 as const, groupId, token, by: this.me, expiresAt: opts.expiresAt, maxUses: opts.maxUses };
    const signedInvite: SignedInvite = { ...unsigned, sig: await sign(this.identity!, inviteSignable(unsigned)) };
    const admins = [...g.members.values()].filter((m) => m.role === 'admin').map((m) => m.userId);
    const { code } = await this.signaling.createInvite({
      groupId,
      token,
      signedInvite: signedInvite as unknown as Record<string, unknown>,
      preview: this.previewOf(g),
      managers: admins,
      expiresAt: opts.expiresAt,
      maxUses: opts.maxUses,
    });
    const inv: LocalInvite = { token, code, groupId, createdAt: Date.now(), expiresAt: opts.expiresAt, maxUses: opts.maxUses, revoked: false };
    this.invites.set(groupId, [...(this.invites.get(groupId) ?? []), inv]);
    this.saveInvites();
    this.notify();
    return inv;
  }

  async revokeInvite(groupId: string, token: string) {
    await this.signaling?.revokeInvite(token).catch(() => {});
    await this.groupOp(groupId, { op: 'revoke', token });
    this.invites.set(groupId, (this.invites.get(groupId) ?? []).map((i) => (i.token === token ? { ...i, revoked: true } : i)));
    this.saveInvites();
    this.notify();
  }

  private previewTimers = new Map<string, number>();

  private refreshInvitePreviews(groupId: string) {
    const mine = this.invitesOf(groupId);
    if (!mine.length) return;
    window.clearTimeout(this.previewTimers.get(groupId));
    this.previewTimers.set(
      groupId,
      window.setTimeout(() => {
        const g = this.groups.get(groupId);
        if (!g) return;
        for (const inv of mine) void this.signaling?.updateInvitePreview(inv.token, this.previewOf(g));
      }, 1500),
    );
  }

  lookupInvite(key: string): Promise<InviteLookup & { signedInvite?: SignedInvite }> {
    return lookupInvite(key);
  }

  /** Waits (briefly) for the signaling connection, e.g. right after the page opened. */
  private async waitOnline(timeoutMs = 10_000): Promise<boolean> {
    const until = Date.now() + timeoutMs;
    while (!this.signaling?.online) {
      if (Date.now() > until || this.net === 'replaced' || this.status !== 'ready') return false;
      await new Promise((r) => window.setTimeout(r, 200));
    }
    return true;
  }

  /** Joiner side: sign a join operation and ask the group (via the hub) to add us. */
  async joinGroup(key: string, info: InviteLookup & { signedInvite?: SignedInvite }): Promise<ConvId> {
    if (!(await this.waitOnline()) || !this.signaling) throw new Error("You're offline. Connect to the internet to join.");
    const id = `g:${info.groupId}`;
    if (this.isMember(info.groupId)) return id;
    if (!info.signedInvite) throw new Error('This invitation is incomplete.');
    const join = await this.makeEvent(id, 'op', { op: 'join', invite: info.signedInvite, pub: this.identity!.publicJwk });
    const res = await this.signaling.joinGroup(key, join as unknown as Record<string, unknown>, { ...this.profile });
    const existing = this.convs.get(id);
    this.saveConv({
      ...(existing ?? { id, type: 'group', groupId: info.groupId, pinned: false, muted: false, unread: 0, createdAt: Date.now() }),
      archived: false,
      lastTs: Date.now(),
      clearedBefore: existing?.clearedBefore,
      joining: { token: info.token, joinEventId: join.id, requestId: res.requestId, requestedAt: Date.now(), preview: info.preview, status: 'pending' },
    } as Conversation);
    this.store({ ...join, local: { receipts: {}, sent: false } });
    this.notify();
    return id;
  }

  /**
   * Re-sends join requests that are still pending (e.g. we were offline when a
   * member accepted). Any online member can then add us and send the group.
   */
  private async resendPendingJoins() {
    for (const c of this.convs.values()) {
      const j = c.joining;
      if (!j || j.status !== 'pending' || !c.groupId) continue;
      const ev = j.joinEventId ? this.byId.get(j.joinEventId) : undefined;
      if (!ev) continue;
      const { local: _local, ...join } = ev;
      try {
        await this.signaling!.joinGroup(j.token, join as unknown as Record<string, unknown>, { ...this.profile });
      } catch (err) {
        const code = (err as Error).message;
        if (code === 'REVOKED' || code === 'EXPIRED' || code === 'NOT_FOUND' || code === 'USED_UP') {
          this.saveConv({ ...c, joining: { ...j, status: 'rejected', reason: 'The invitation is no longer valid.' } });
          this.notify();
        }
      }
    }
  }

  private onInviteResult(groupId: string, accepted: boolean, by: UserId, reason?: string) {
    const id = `g:${groupId}`;
    const c = this.convs.get(id);
    if (!c?.joining) return;
    if (!accepted) {
      this.saveConv({ ...c, joining: { ...c.joining, status: 'rejected', reason } });
      this.toast(reason ?? 'Your request to join was declined.', 'error');
      return this.notify();
    }
    this.presence.set(by, true);
    this.signaling?.watch([by]);
    const s = this.sessions.get(by);
    if (s?.state === 'open') s.send({ t: 'sync', conv: id, vector: this.vector(id) });
    else this.maybeConnect(by);
    this.notify();
  }

  /** Member side: validate a join request routed by the hub and add the joiner. */
  private async onJoinRequest(req: JoinRequest) {
    const g = this.groups.get(req.groupId);
    if (!g || !g.members.has(this.me)) return;
    if (g.deleted) return void this.signaling?.joinHandled(req.groupId, req.requestId, false, 'This group was deleted.');
    if (g.members.size >= MAX_GROUP_MEMBERS && !g.members.has(req.joinerId)) {
      return void this.signaling?.joinHandled(req.groupId, req.requestId, false, 'This group is full.');
    }
    const ev = req.joinEvent as unknown as ChatEvent;
    if (!g.members.has(req.joinerId)) {
      const b = (ev?.body ?? {}) as Record<string, unknown>;
      if (ev?.author !== req.joinerId || ev.conv !== `g:${req.groupId}` || b.op !== 'join') {
        return void this.signaling?.joinHandled(req.groupId, req.requestId, false, 'Invalid request.');
      }
      const problem = await checkInvite(g, b.invite, Date.now());
      if (problem) return void this.signaling?.joinHandled(req.groupId, req.requestId, false, problem);
      if ((b.invite as SignedInvite).token !== req.token) return void this.signaling?.joinHandled(req.groupId, req.requestId, false, 'Invalid request.');
      await this.ingest(ev);
    }
    if (!this.groups.get(req.groupId)?.members.has(req.joinerId)) {
      return void this.signaling?.joinHandled(req.groupId, req.requestId, false, 'The request could not be verified.');
    }
    this.setProfile(req.joinerId, req.profile);
    // Share the join with everyone connected, then bring the newcomer up to date.
    const stored = this.byId.get(ev.id);
    if (stored) for (const p of this.participants(stored.conv)) if (p !== this.me && p !== req.joinerId) this.sendTo(p, { t: 'event', e: ev });
    void this.signaling?.joinHandled(req.groupId, req.requestId, true);
    this.presence.set(req.joinerId, true);
    if (!this.sendTo(req.joinerId, { t: 'group-hello', groupId: req.groupId })) this.pendingGroupHello(req.joinerId, req.groupId);
  }
}

export const engine = new ChatEngine();

export function isUserIdFormat(v: string) {
  return USER_ID_RE.test(v);
}

export { isPublicJwk };
