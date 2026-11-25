import { randomBytes } from 'node:crypto';
import type { Express } from 'express';
import type { Namespace, Server, Socket } from 'socket.io';
import { buildIceConfig } from '../ice.js';
import { TokenBucket, WindowLimiter } from '../rateLimit.js';
import {
  AUTH_PREFIX,
  isUserId,
  keyFromJwk,
  newNonce,
  parsePublicJwk,
  userIdFromJwk,
  verifySignature,
  type PublicJwk,
} from './identity.js';
import { InviteStore, type InvitePreview, type JoinRequest } from './invites.js';

/**
 * UR Chat signaling hub (Socket.IO namespace "/chat").
 *
 * Responsibilities, and nothing more:
 *  - authenticate a socket as the owner of a chat ID (signed challenge)
 *  - presence for IDs a client explicitly watches
 *  - relay WebRTC offers/answers/ICE between authenticated users
 *  - group invitations: metadata, preview, join requests routed to online members
 *
 * Chat messages and files never pass through this server.
 */

export interface ChatHubOptions {
  clientIp: (socket: Socket) => string;
  dataFile: string | null;
  production: boolean;
}

interface Session {
  userId: string;
  publicKey: PublicJwk;
  socket: Socket;
  watching: Set<string>;
  groups: Set<string>;
}

const MAX_WATCH = 1000;
const MAX_GROUPS = 300;
const MAX_SIGNAL_BYTES = 40 * 1024;
const SIGNAL_KINDS = new Set(['offer', 'answer', 'ice', 'connect', 'bye']);
const GROUP_ID_RE = /^[A-Za-z0-9_-]{16,40}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{22,64}$/;

type Ack = (response: Record<string, unknown>) => void;
const ackOf = (fn: unknown): Ack => (typeof fn === 'function' ? (fn as Ack) : () => {});

function jsonSize(v: unknown): number {
  try {
    return JSON.stringify(v).length;
  } catch {
    return Infinity;
  }
}

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.length <= max ? v : null;
}

function parsePreview(v: unknown): InvitePreview | null {
  if (!v || typeof v !== 'object') return null;
  const p = v as Record<string, unknown>;
  const name = str(p.name, 80);
  const description = str(p.description ?? '', 500);
  const image = p.image == null ? null : str(p.image, 48 * 1024);
  if (!name || description === null || (p.image != null && (!image || !image.startsWith('data:image/')))) return null;
  const memberCount = Number.isInteger(p.memberCount) ? Math.max(0, Math.min(1000, p.memberCount as number)) : 0;
  return { name, description, image, memberCount };
}

export function attachChat(io: Server, app: Express, opts: ChatHubOptions) {
  const nsp: Namespace = io.of('/chat');
  const invites = new InviteStore(opts.dataFile);
  const sessions = new Map<string, Session>(); // userId -> session
  const watchers = new Map<string, Set<string>>(); // watched userId -> watcher userIds
  const groupMembers = new Map<string, Set<string>>(); // groupId -> online userIds that announced it

  const windowMs = 10 * 60 * 1000;
  const scale = opts.production ? 1 : 20;
  const connectLimiter = new WindowLimiter(120 * scale, windowMs);
  const lookupLimiter = new WindowLimiter(120 * scale, windowMs);
  const joinLimiter = new WindowLimiter(20 * scale, windowMs);
  const inviteLimiter = new WindowLimiter(30 * scale, windowMs);

  // --- REST: public invite preview (no auth needed to see what you're joining)
  app.get('/api/chat/invites/:key', (req, res) => {
    const ip = req.ip ?? 'unknown';
    if (!lookupLimiter.take(ip)) return res.status(429).json({ error: 'RATE_LIMITED' });
    const key = String(req.params.key ?? '');
    if (key.length > 64) return res.status(400).json({ error: 'INVALID' });
    const inv = invites.find(key);
    if (!inv) return res.status(404).json({ error: 'NOT_FOUND' });
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      token: inv.token,
      groupId: inv.groupId,
      preview: inv.preview,
      status: invites.status(inv),
      expiresAt: inv.expiresAt,
      // Signed by a group admin; the joiner embeds it in a signed join request.
      signedInvite: inv.signedInvite,
    });
  });

  const emitTo = (userId: string, event: string, payload: unknown) => {
    sessions.get(userId)?.socket.emit(event, payload);
  };

  const notifyPresence = (userId: string, online: boolean) => {
    for (const w of watchers.get(userId) ?? []) emitTo(w, 'presence', { userId, online });
  };

  const deliverPending = (groupId: string, toUserId?: string) => {
    for (const req of invites.pendingFor(groupId)) {
      if (toUserId) emitTo(toUserId, 'group:join-request', req);
      else for (const m of groupMembers.get(groupId) ?? []) emitTo(m, 'group:join-request', req);
    }
  };

  nsp.use((socket, next) => {
    if (!connectLimiter.take(opts.clientIp(socket))) return next(new Error('RATE_LIMITED'));
    next();
  });

  nsp.on('connection', (socket) => {
    const ip = opts.clientIp(socket);
    const bucket = new TokenBucket(60, 240);
    let session: Session | null = null;
    let pendingAuth: { userId: string; jwk: PublicJwk; nonce: string } | null = null;

    // Step 1: client says who it is; we answer with a challenge.
    socket.on('auth:hello', (payload: unknown, ackFn: unknown) => {
      const ack = ackOf(ackFn);
      const p = payload as { userId?: unknown; publicKey?: unknown } | null;
      const jwk = parsePublicJwk(p?.publicKey);
      if (!jwk || !isUserId(p?.userId) || userIdFromJwk(jwk) !== p!.userId) return ack({ ok: false, error: 'BAD_IDENTITY' });
      pendingAuth = { userId: p!.userId as string, jwk, nonce: newNonce() };
      ack({ ok: true, nonce: pendingAuth.nonce });
    });

    // Step 2: client proves it holds the private key.
    socket.on('auth:prove', (payload: unknown, ackFn: unknown) => {
      const ack = ackOf(ackFn);
      if (!pendingAuth) return ack({ ok: false, error: 'NO_CHALLENGE' });
      const key = keyFromJwk(pendingAuth.jwk);
      const sig = str((payload as { signature?: unknown } | null)?.signature, 200);
      if (!key || !sig || !verifySignature(key, AUTH_PREFIX + pendingAuth.nonce, sig)) {
        pendingAuth = null;
        return ack({ ok: false, error: 'BAD_SIGNATURE' });
      }
      const { userId, jwk } = pendingAuth;
      pendingAuth = null;

      // One live session per identity: a newer tab takes over.
      const previous = sessions.get(userId);
      if (previous && previous.socket.id !== socket.id) {
        previous.socket.emit('session:replaced');
        previous.socket.disconnect(true);
      }
      session = { userId, publicKey: jwk, socket, watching: new Set(), groups: new Set() };
      sessions.set(userId, session);
      notifyPresence(userId, true);
      ack({ ok: true, ice: buildIceConfig() });
    });

    const authed = (ack: Ack): Session | null => {
      if (!session) ack({ ok: false, error: 'UNAUTHENTICATED' });
      return session;
    };

    socket.on('presence:watch', (payload: unknown, ackFn: unknown) => {
      const ack = ackOf(ackFn);
      const s = authed(ack);
      if (!s || !bucket.take()) return;
      const ids = Array.isArray((payload as { ids?: unknown } | null)?.ids) ? ((payload as { ids: unknown[] }).ids) : [];
      const online: string[] = [];
      for (const id of ids.slice(0, MAX_WATCH)) {
        if (!isUserId(id) || id === s.userId) continue;
        if (s.watching.size >= MAX_WATCH && !s.watching.has(id)) break;
        s.watching.add(id);
        let set = watchers.get(id);
        if (!set) watchers.set(id, (set = new Set()));
        set.add(s.userId);
        if (sessions.has(id)) online.push(id);
      }
      ack({ ok: true, online });
    });

    socket.on('signal', (payload: unknown, ackFn: unknown) => {
      const ack = ackOf(ackFn);
      const s = authed(ack);
      if (!s) return;
      if (!bucket.take()) return ack({ ok: false, error: 'RATE_LIMITED' });
      const p = payload as { to?: unknown; data?: { kind?: unknown } } | null;
      if (!isUserId(p?.to) || !p?.data || typeof p.data !== 'object' || !SIGNAL_KINDS.has(p.data.kind as string)) {
        return ack({ ok: false, error: 'INVALID' });
      }
      if (jsonSize(p.data) > MAX_SIGNAL_BYTES) return ack({ ok: false, error: 'TOO_LARGE' });
      const target = sessions.get(p.to as string);
      if (!target) return ack({ ok: false, error: 'OFFLINE' });
      // The server stamps the authenticated sender; clients never trust a self-declared "from".
      target.socket.emit('signal', { from: s.userId, data: p.data });
      ack({ ok: true });
    });

    socket.on('groups:announce', (payload: unknown, ackFn: unknown) => {
      const ack = ackOf(ackFn);
      const s = authed(ack);
      if (!s || !bucket.take()) return;
      const ids = Array.isArray((payload as { groupIds?: unknown } | null)?.groupIds)
        ? (payload as { groupIds: unknown[] }).groupIds
        : [];
      const next = new Set(ids.filter((g): g is string => typeof g === 'string' && GROUP_ID_RE.test(g)).slice(0, MAX_GROUPS));
      for (const g of s.groups) if (!next.has(g)) groupMembers.get(g)?.delete(s.userId);
      for (const g of next) {
        let set = groupMembers.get(g);
        if (!set) groupMembers.set(g, (set = new Set()));
        set.add(s.userId);
        deliverPending(g, s.userId);
      }
      s.groups = next;
      ack({ ok: true });
    });

    socket.on('invite:create', (payload: unknown, ackFn: unknown) => {
      const ack = ackOf(ackFn);
      const s = authed(ack);
      if (!s) return;
      if (!inviteLimiter.take(s.userId)) return ack({ ok: false, error: 'RATE_LIMITED' });
      const p = (payload ?? {}) as Record<string, unknown>;
      const preview = parsePreview(p.preview);
      const managers = Array.isArray(p.managers) ? p.managers.filter(isUserId).slice(0, 32) : [];
      const expiresAt = p.expiresAt == null ? null : Number(p.expiresAt);
      const maxUses = p.maxUses == null ? null : Number(p.maxUses);
      if (
        typeof p.groupId !== 'string' ||
        !GROUP_ID_RE.test(p.groupId) ||
        typeof p.token !== 'string' ||
        !TOKEN_RE.test(p.token) ||
        !preview ||
        !p.signedInvite ||
        typeof p.signedInvite !== 'object' ||
        jsonSize(p.signedInvite) > 2048 ||
        (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= Date.now())) ||
        (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000))
      ) {
        return ack({ ok: false, error: 'INVALID' });
      }
      const inv = invites.create({
        token: p.token,
        groupId: p.groupId,
        creatorId: s.userId,
        managers: [...new Set([s.userId, ...managers])],
        signedInvite: p.signedInvite as Record<string, unknown>,
        preview,
        expiresAt,
        maxUses,
      });
      if (!inv) return ack({ ok: false, error: 'DUPLICATE' });
      ack({ ok: true, code: inv.code });
    });

    socket.on('invite:revoke', (payload: unknown, ackFn: unknown) => {
      const ack = ackOf(ackFn);
      const s = authed(ack);
      if (!s) return;
      const inv = invites.find(String((payload as { token?: unknown } | null)?.token ?? ''));
      if (!inv) return ack({ ok: false, error: 'NOT_FOUND' });
      if (!inv.managers.includes(s.userId)) return ack({ ok: false, error: 'FORBIDDEN' });
      invites.revoke(inv);
      ack({ ok: true });
    });

    socket.on('invite:preview', (payload: unknown, ackFn: unknown) => {
      const ack = ackOf(ackFn);
      const s = authed(ack);
      if (!s || !bucket.take()) return;
      const p = (payload ?? {}) as Record<string, unknown>;
      const inv = invites.find(String(p.token ?? ''));
      const preview = parsePreview(p.preview);
      if (!inv || !preview) return ack({ ok: false, error: 'INVALID' });
      if (!inv.managers.includes(s.userId)) return ack({ ok: false, error: 'FORBIDDEN' });
      invites.updatePreview(inv, preview);
      ack({ ok: true });
    });

    socket.on('invite:join', (payload: unknown, ackFn: unknown) => {
      const ack = ackOf(ackFn);
      const s = authed(ack);
      if (!s) return;
      if (!joinLimiter.take(ip)) return ack({ ok: false, error: 'RATE_LIMITED' });
      const p = (payload ?? {}) as Record<string, unknown>;
      const inv = invites.find(String(p.key ?? ''));
      if (!inv) return ack({ ok: false, error: 'NOT_FOUND' });
      const status = invites.status(inv);
      // A person retrying (e.g. after reconnecting) may continue even if the invite has since filled up.
      if (status !== 'active' && !(status === 'used-up' && invites.hasJoined(inv, s.userId))) {
        return ack({ ok: false, error: status.toUpperCase().replace('-', '_') });
      }
      const joinEvent = p.joinEvent as Record<string, unknown> | undefined;
      if (!joinEvent || typeof joinEvent !== 'object' || jsonSize(joinEvent) > 8 * 1024 || joinEvent.author !== s.userId) {
        return ack({ ok: false, error: 'INVALID' });
      }
      const profile = (p.profile && typeof p.profile === 'object' ? p.profile : {}) as Record<string, unknown>;
      if (jsonSize(profile) > 48 * 1024) return ack({ ok: false, error: 'INVALID' });

      invites.consume(inv, s.userId);
      const req: JoinRequest = {
        requestId: randomBytes(12).toString('base64url'),
        groupId: inv.groupId,
        token: inv.token,
        joinerId: s.userId,
        joinEvent,
        profile,
        createdAt: Date.now(),
      };
      invites.addPending(req);
      const online = [...(groupMembers.get(inv.groupId) ?? [])].filter((m) => m !== s.userId);
      for (const m of online) emitTo(m, 'group:join-request', req);
      ack({ ok: true, groupId: inv.groupId, requestId: req.requestId, membersOnline: online.length });
    });

    // A member added the joiner (or rejected the request): stop routing it.
    socket.on('group:join-handled', (payload: unknown, ackFn: unknown) => {
      const ack = ackOf(ackFn);
      const s = authed(ack);
      if (!s) return;
      const p = (payload ?? {}) as Record<string, unknown>;
      if (typeof p.groupId !== 'string' || !s.groups.has(p.groupId)) return ack({ ok: false, error: 'FORBIDDEN' });
      const req = invites.resolvePending(p.groupId, String(p.requestId ?? ''));
      if (!req) return ack({ ok: true, already: true });
      const accepted = p.accepted !== false;
      emitTo(req.joinerId, 'invite:result', {
        groupId: req.groupId,
        accepted,
        by: s.userId,
        reason: accepted ? undefined : str(p.reason, 200) ?? 'rejected',
      });
      ack({ ok: true });
    });

    socket.on('disconnect', () => {
      if (!session || sessions.get(session.userId)?.socket.id !== socket.id) return;
      sessions.delete(session.userId);
      for (const id of session.watching) watchers.get(id)?.delete(session.userId);
      for (const g of session.groups) groupMembers.get(g)?.delete(session.userId);
      notifyPresence(session.userId, false);
    });
  });

  setInterval(() => {
    invites.sweep();
    connectLimiter.sweep();
    lookupLimiter.sweep();
    joinLimiter.sweep();
    inviteLimiter.sweep();
    for (const [id, set] of watchers) if (!set.size) watchers.delete(id);
    for (const [g, set] of groupMembers) if (!set.size) groupMembers.delete(g);
  }, 60_000).unref();

  return { onlineCount: () => sessions.size };
}
