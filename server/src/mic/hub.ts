import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Express } from 'express';
import type { Namespace, Server, Socket } from 'socket.io';
import { buildIceConfig } from '../ice.js';
import { TokenBucket, WindowLimiter } from '../rateLimit.js';
import { EXPIRY_CHOICES, PARTICIPANT_CHOICES, micConfig, publicMicConfig } from './config.js';
import { settings } from '../settings.js';

/**
 * Mic signaling hub (Socket.IO namespace "/mic").
 *
 * Holds temporary room state in memory and relays WebRTC offers, answers and
 * ICE candidates between participants of the same room. Audio never passes
 * through this server: participants connect to each other directly (mesh),
 * or through a TURN relay when a direct path isn't possible.
 */

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 6;
const PID_RE = /^[A-Za-z0-9_-]{8,32}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
const DEVICE_RE = /^[A-Za-z0-9_-]{16,64}$/;
const SIGNAL_KINDS = new Set(['offer', 'answer', 'ice']);

export type RoomStatus = 'ACTIVE' | 'LOCKED' | 'FULL' | 'CLOSED' | 'EXPIRED';

interface Participant {
  pid: string;
  socketId: string | null;
  name: string;
  avatar: string | null;
  muted: boolean;
  /** The host asked this participant to mute. Cleared when they unmute themselves. */
  hostMuted: boolean;
  joinedAt: number;
  deviceId: string;
  rejoinToken: string;
  /** Signaling connection dropped; seat kept for the reconnect grace period. */
  awaySince: number | null;
}

interface Room {
  id: string;
  code: string;
  name: string;
  description: string;
  maxParticipants: number;
  visibility: 'private' | 'public';
  password: { salt: Buffer; hash: Buffer } | null;
  expiresAt: number | null;
  locked: boolean;
  hostToken: string;
  hostPid: string | null;
  participants: Map<string, Participant>;
  bans: Map<string, number>;
  createdAt: number;
  emptySince: number | null;
}

type Ack = (response: Record<string, unknown>) => void;
const ackOf = (fn: unknown): Ack => (typeof fn === 'function' ? (fn as Ack) : () => {});
const token = (bytes = 24) => randomBytes(bytes).toString('base64url');

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.length <= max ? v : null;
}

function jsonSize(v: unknown): number {
  try {
    return JSON.stringify(v).length;
  } catch {
    return Infinity;
  }
}

/** Accepts "MIC-8K92PX", "mic 8k92px", "8K92PX" or a full invitation URL. */
export function normalizeRoomCode(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 200) return null;
  const fromUrl = input.match(/\/room\/([A-Za-z0-9-]+)/);
  let raw = (fromUrl ? fromUrl[1] : input).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (raw.startsWith('MIC') && raw.length === CODE_LENGTH + 3) raw = raw.slice(3);
  if (raw.length !== CODE_LENGTH || [...raw].some((c) => !CODE_ALPHABET.includes(c))) return null;
  return `MIC-${raw}`;
}

function parseProfile(v: unknown): { name: string; avatar: string | null } | null {
  const p = v as Record<string, unknown> | null;
  if (!p || typeof p.name !== 'string') return null;
  const name = p.name.trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!name) return null;
  const a = p.avatar;
  const avatar =
    typeof a === 'string' && ((a.startsWith('data:image/') && a.length <= 60_000) || /^(ill|gen):[a-z0-9-]{1,40}$/i.test(a)) ? a : null;
  return { name, avatar };
}

function hashPassword(password: string) {
  const salt = randomBytes(16);
  return { salt, hash: scryptSync(password, salt, 32) };
}

function checkPassword(room: Room, password: unknown): boolean {
  if (!room.password) return true;
  if (typeof password !== 'string' || password.length > 100) return false;
  const hash = scryptSync(password, room.password.salt, 32);
  return timingSafeEqual(hash, room.password.hash);
}

export interface MicHubOptions {
  clientIp: (socket: Socket) => string;
  production: boolean;
}

export function attachMic(io: Server, app: Express, opts: MicHubOptions) {
  const nsp: Namespace = io.of('/mic');
  const rooms = new Map<string, Room>(); // by id
  const byCode = new Map<string, string>(); // code -> room id
  /** Codes of rooms that ended, so visitors get "expired" or "closed" rather than "not found". */
  const ended = new Map<string, { reason: 'expired' | 'closed' | 'revoked'; at: number }>();
  /** socket.id -> where that socket sits */
  const seats = new Map<string, { roomId: string; pid: string }>();

  const windowMs = 10 * 60 * 1000;
  const scale = opts.production ? 1 : 25;
  const createLimiter = new WindowLimiter(20 * scale, windowMs);
  const joinLimiter = new WindowLimiter(40 * scale, windowMs);
  const lookupLimiter = new WindowLimiter(150 * scale, windowMs);
  const connectLimiter = new WindowLimiter(120 * scale, windowMs);

  const statusOf = (room: Room): RoomStatus => {
    if (room.expiresAt && room.expiresAt <= Date.now()) return 'EXPIRED';
    if (room.locked) return 'LOCKED';
    if (room.participants.size >= room.maxParticipants) return 'FULL';
    return 'ACTIVE';
  };

  const roomView = (room: Room) => ({
    code: room.code,
    name: room.name,
    description: room.description,
    maxParticipants: room.maxParticipants,
    participantCount: room.participants.size,
    visibility: room.visibility,
    hasPassword: !!room.password,
    locked: room.locked,
    status: statusOf(room),
    expiresAt: room.expiresAt,
    hostPid: room.hostPid,
    createdAt: room.createdAt,
  });

  const participantView = (p: Participant, room: Room) => ({
    pid: p.pid,
    name: p.name,
    avatar: p.avatar,
    muted: p.muted,
    hostMuted: p.hostMuted,
    isHost: room.hostPid === p.pid,
    status: p.awaySince ? 'reconnecting' : 'connected',
    joinedAt: p.joinedAt,
  });

  const emitRoom = (room: Room, event: string, payload: unknown, exceptPid?: string) => {
    for (const p of room.participants.values()) {
      if (p.socketId && p.pid !== exceptPid) nsp.to(p.socketId).emit(event, payload);
    }
  };

  const broadcastRoom = (room: Room) => emitRoom(room, 'room:update', roomView(room));

  const findRoom = (code: string | null) => (code ? rooms.get(byCode.get(code) ?? '') : undefined);

  const endRoom = (room: Room, reason: 'expired' | 'closed' | 'empty' | 'host') => {
    emitRoom(room, 'room:closed', { reason });
    for (const p of room.participants.values()) {
      if (p.socketId) {
        seats.delete(p.socketId);
        nsp.sockets.get(p.socketId)?.leave(room.id);
      }
    }
    rooms.delete(room.id);
    byCode.delete(room.code);
    ended.set(room.code, { reason: reason === 'expired' ? 'expired' : 'closed', at: Date.now() });
  };

  /** Picks the longest-present connected participant as the new host. */
  const reassignHost = (room: Room) => {
    if (room.hostPid && room.participants.has(room.hostPid)) return;
    const next = [...room.participants.values()].filter((p) => !p.awaySince).sort((a, b) => a.joinedAt - b.joinedAt)[0];
    room.hostPid = next?.pid ?? null;
  };

  const removeParticipant = (room: Room, pid: string, reason: 'left' | 'disconnected' | 'removed') => {
    const p = room.participants.get(pid);
    if (!p) return;
    room.participants.delete(pid);
    if (p.socketId) seats.delete(p.socketId);
    emitRoom(room, 'participant:left', { pid, name: p.name, reason });
    if (room.hostPid === pid) {
      room.hostPid = null;
      reassignHost(room);
    }
    if (room.participants.size === 0) room.emptySince = Date.now();
    broadcastRoom(room);
  };

  // ---- REST ----------------------------------------------------------------
  app.get('/api/mic/config', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.json(publicMicConfig());
  });

  app.get('/api/mic/rooms/:code', (req, res) => {
    if (!lookupLimiter.take(req.ip ?? 'unknown')) return res.status(429).json({ error: 'RATE_LIMITED' });
    const code = normalizeRoomCode(String(req.params.code ?? ''));
    if (!code) return res.status(400).json({ error: 'INVALID_CODE' });
    res.setHeader('Cache-Control', 'no-store');
    const room = findRoom(code);
    if (!room) {
      const gone = ended.get(code);
      return res.status(gone ? 410 : 404).json({ error: gone ? gone.reason.toUpperCase() : 'NOT_FOUND' });
    }
    if (statusOf(room) === 'EXPIRED') return res.status(410).json({ error: 'EXPIRED' });
    const v = roomView(room);
    res.json({ ...v, hostPid: undefined });
  });

  app.get('/api/mic/rooms', (req, res) => {
    if (!micConfig.allowPublicRooms) return res.json({ rooms: [] });
    if (!lookupLimiter.take(req.ip ?? 'unknown')) return res.status(429).json({ error: 'RATE_LIMITED' });
    const list = [...rooms.values()]
      .filter((r) => r.visibility === 'public' && statusOf(r) !== 'EXPIRED')
      .sort((a, b) => b.participants.size - a.participants.size)
      .slice(0, 50)
      .map((r) => ({ ...roomView(r), hostPid: undefined }));
    res.json({ rooms: list });
  });

  // ---- sockets -------------------------------------------------------------
  nsp.use((socket, next) => {
    if (!connectLimiter.take(opts.clientIp(socket))) return next(new Error('RATE_LIMITED'));
    next();
  });

  nsp.on('connection', (socket) => {
    const ip = opts.clientIp(socket);
    const bucket = new TokenBucket(80, 400);

    const current = () => {
      const seat = seats.get(socket.id);
      const room = seat ? rooms.get(seat.roomId) : undefined;
      const me = room?.participants.get(seat!.pid);
      return room && me ? { room, me } : null;
    };

    const asHost = (ack: Ack) => {
      const c = current();
      if (!c) return ack({ ok: false, error: 'NOT_IN_ROOM' }), null;
      if (c.room.hostPid !== c.me.pid) return ack({ ok: false, error: 'NOT_HOST' }), null;
      return c;
    };

    socket.on('room:create', (payload: unknown, ackFn: unknown) => {
      const ack = ackOf(ackFn);
      if (!createLimiter.take(ip)) return ack({ ok: false, error: 'RATE_LIMITED' });
      if (rooms.size >= micConfig.maxRooms) return ack({ ok: false, error: 'SERVER_BUSY' });
      if (!settings.micCreateEnabled) return ack({ ok: false, error: 'DISABLED' });
      const p = (payload ?? {}) as Record<string, unknown>;
      const name = str(p.name, 60)?.trim() || 'Voice room';
      const description = str(p.description ?? '', 300)?.trim() ?? '';
      const max = Number(p.maxParticipants ?? micConfig.defaultRoomParticipants);
      // The global limit is enforced here, whatever the client sends.
      if (!Number.isInteger(max) || max < 2 || max > micConfig.globalMaxRoomParticipants) {
        return ack({ ok: false, error: 'INVALID_LIMIT', max: micConfig.globalMaxRoomParticipants });
      }
      const visibility = p.visibility === 'public' && micConfig.allowPublicRooms ? 'public' : 'private';
      const password = str(p.password ?? '', 100) ?? '';
      if (password && !micConfig.allowRoomPassword) return ack({ ok: false, error: 'PASSWORDS_DISABLED' });
      const expiry = p.expiryMinutes === null ? null : Number(p.expiryMinutes ?? micConfig.defaultRoomExpiryMinutes);
      if (expiry === null ? !micConfig.allowNoExpiry : !EXPIRY_CHOICES.includes(expiry)) return ack({ ok: false, error: 'INVALID_EXPIRY' });

      let code: string;
      do {
        code = 'MIC-';
        for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      } while (byCode.has(code) || ended.has(code));

      const room: Room = {
        id: token(12),
        code,
        name,
        description,
        maxParticipants: max,
        visibility,
        password: password ? hashPassword(password) : null,
        expiresAt: expiry === null || expiry === 0 ? null : Date.now() + expiry * 60_000,
        locked: false,
        hostToken: token(),
        hostPid: null,
        participants: new Map(),
        bans: new Map(),
        createdAt: Date.now(),
        emptySince: Date.now(),
      };
      rooms.set(room.id, room);
      byCode.set(code, room.id);
      ack({ ok: true, code, hostToken: room.hostToken, room: roomView(room) });
    });

    socket.on('room:join', (payload: unknown, ackFn: unknown) => {
      const ack = ackOf(ackFn);
      if (!joinLimiter.take(ip)) return ack({ ok: false, error: 'RATE_LIMITED' });
      const p = (payload ?? {}) as Record<string, unknown>;
      const code = normalizeRoomCode(p.code);
      if (!code) return ack({ ok: false, error: 'INVALID_CODE' });
      const room = findRoom(code);
      if (!room) {
        const gone = ended.get(code);
        return ack({ ok: false, error: gone ? gone.reason.toUpperCase() : 'NOT_FOUND' });
      }
      if (statusOf(room) === 'EXPIRED') return ack({ ok: false, error: 'EXPIRED' });
      const profile = parseProfile(p.profile);
      if (!profile) return ack({ ok: false, error: 'INVALID_PROFILE' });
      const deviceId = typeof p.deviceId === 'string' && DEVICE_RE.test(p.deviceId) ? p.deviceId : null;
      if (!deviceId) return ack({ ok: false, error: 'INVALID_DEVICE' });

      const isCreator = typeof p.hostToken === 'string' && TOKEN_RE.test(p.hostToken) && timingSafeEqual(Buffer.from(p.hostToken.padEnd(64)), Buffer.from(room.hostToken.padEnd(64)));

      // Rejoin after a refresh or network drop: same seat, no duplicate entry.
      const rj = p.rejoin as { pid?: unknown; token?: unknown } | undefined;
      let me: Participant | undefined;
      if (rj && typeof rj.pid === 'string' && PID_RE.test(rj.pid) && typeof rj.token === 'string') {
        const seat = room.participants.get(rj.pid);
        if (seat && seat.rejoinToken === rj.token) me = seat;
      }

      // Leave any room this socket is already in.
      const prev = current();
      if (prev && prev.me !== me) removeParticipant(prev.room, prev.me.pid, 'left');

      if (!me) {
        const ban = room.bans.get(deviceId);
        if (ban && ban > Date.now()) return ack({ ok: false, error: 'BANNED', until: ban });
        if (room.locked && !isCreator) return ack({ ok: false, error: 'LOCKED' });
        // Capacity is a hard limit, including for the creator.
        if (room.participants.size >= room.maxParticipants) return ack({ ok: false, error: 'FULL' });
        if (!isCreator && !checkPassword(room, p.password)) {
          return ack({ ok: false, error: p.password ? 'WRONG_PASSWORD' : 'PASSWORD_REQUIRED' });
        }
        me = {
          pid: token(9),
          socketId: socket.id,
          name: profile.name,
          avatar: profile.avatar,
          muted: p.muted !== false,
          hostMuted: false,
          joinedAt: Date.now(),
          deviceId,
          rejoinToken: token(),
          awaySince: null,
        };
        room.participants.set(me.pid, me);
        room.emptySince = null;
        if (isCreator || !room.hostPid) room.hostPid = me.pid;
        seats.set(socket.id, { roomId: room.id, pid: me.pid });
        void socket.join(room.id);
        emitRoom(room, 'participant:joined', participantView(me, room), me.pid);
      } else {
        // Reattach: drop a stale socket for the same seat (e.g. an old tab).
        if (me.socketId && me.socketId !== socket.id) {
          const old = nsp.sockets.get(me.socketId);
          seats.delete(me.socketId);
          old?.emit('kicked', { reason: 'replaced' });
          old?.disconnect(true);
        }
        me.socketId = socket.id;
        me.awaySince = null;
        me.name = profile.name;
        me.avatar = profile.avatar;
        if (typeof p.muted === 'boolean') me.muted = p.muted;
        if (isCreator) room.hostPid = me.pid;
        seats.set(socket.id, { roomId: room.id, pid: me.pid });
        void socket.join(room.id);
        // Peers rebuild their audio connections to this participant.
        emitRoom(room, 'participant:reconnected', participantView(me, room), me.pid);
      }
      broadcastRoom(room);
      ack({
        ok: true,
        self: { pid: me.pid, rejoinToken: me.rejoinToken },
        room: roomView(room),
        participants: [...room.participants.values()].map((x) => participantView(x, room)),
        ice: buildIceConfig(),
      });
    });

    socket.on('state', (payload: unknown) => {
      const c = current();
      if (!c || !bucket.take()) return;
      const muted = (payload as { muted?: unknown } | null)?.muted;
      if (typeof muted !== 'boolean') return;
      c.me.muted = muted;
      if (!muted) c.me.hostMuted = false;
      emitRoom(c.room, 'participant:updated', participantView(c.me, c.room));
    });

    socket.on('signal', (payload: unknown) => {
      const c = current();
      if (!c || !bucket.take()) return;
      const p = payload as { to?: unknown; data?: { kind?: unknown } } | null;
      if (typeof p?.to !== 'string' || !p.data || typeof p.data !== 'object' || !SIGNAL_KINDS.has(p.data.kind as string)) return;
      if (jsonSize(p.data) > 40 * 1024) return;
      const target = c.room.participants.get(p.to);
      // Only between members of the same room; the server stamps the sender.
      if (target?.socketId) nsp.to(target.socketId).emit('signal', { from: c.me.pid, data: p.data });
    });

    socket.on('leave', () => {
      const c = current();
      if (c) removeParticipant(c.room, c.me.pid, 'left');
      void socket.leave(c?.room.id ?? '');
    });

    // ---- host controls --------------------------------------------------
    socket.on('host:update', (payload: unknown, ackFn: unknown) => {
      const ack = ackOf(ackFn);
      const c = asHost(ack);
      if (!c) return;
      const p = (payload ?? {}) as Record<string, unknown>;
      if (p.name !== undefined) {
        const name = str(p.name, 60)?.trim();
        if (!name) return ack({ ok: false, error: 'INVALID_NAME' });
        c.room.name = name;
      }
      if (p.description !== undefined) {
        const d = str(p.description, 300);
        if (d === null) return ack({ ok: false, error: 'INVALID_DESCRIPTION' });
        c.room.description = d.trim();
      }
      if (p.maxParticipants !== undefined) {
        const max = Number(p.maxParticipants);
        if (!Number.isInteger(max) || max < 2 || max > micConfig.globalMaxRoomParticipants) {
          return ack({ ok: false, error: 'INVALID_LIMIT', max: micConfig.globalMaxRoomParticipants });
        }
        // Lowering below the current count blocks new joins; nobody is removed.
        c.room.maxParticipants = max;
      }
      broadcastRoom(c.room);
      ack({ ok: true });
    });

    socket.on('host:lock', (payload: unknown, ackFn: unknown) => {
      const ack = ackOf(ackFn);
      const c = asHost(ack);
      if (!c) return;
      if (!micConfig.allowHostRoomLock) return ack({ ok: false, error: 'LOCK_DISABLED' });
      c.room.locked = !!(payload as { locked?: unknown } | null)?.locked;
      broadcastRoom(c.room);
      ack({ ok: true });
    });

    socket.on('host:mute', (payload: unknown, ackFn: unknown) => {
      const ack = ackOf(ackFn);
      const c = asHost(ack);
      if (!c) return;
      const target = c.room.participants.get(String((payload as { pid?: unknown } | null)?.pid ?? ''));
      if (!target || target.pid === c.me.pid) return ack({ ok: false, error: 'NOT_FOUND' });
      // Browsers don't let anyone control another person's microphone: this asks their app to mute.
      target.hostMuted = true;
      if (target.socketId) nsp.to(target.socketId).emit('mute-request', { by: c.me.name });
      emitRoom(c.room, 'participant:updated', participantView(target, c.room));
      ack({ ok: true });
    });

    socket.on('host:remove', (payload: unknown, ackFn: unknown) => {
      const ack = ackOf(ackFn);
      const c = asHost(ack);
      if (!c) return;
      const target = c.room.participants.get(String((payload as { pid?: unknown } | null)?.pid ?? ''));
      if (!target || target.pid === c.me.pid) return ack({ ok: false, error: 'NOT_FOUND' });
      if (micConfig.removalBanMinutes > 0) c.room.bans.set(target.deviceId, Date.now() + micConfig.removalBanMinutes * 60_000);
      if (target.socketId) {
        nsp.to(target.socketId).emit('kicked', { reason: 'removed', banMinutes: micConfig.removalBanMinutes });
        nsp.sockets.get(target.socketId)?.leave(c.room.id);
      }
      removeParticipant(c.room, target.pid, 'removed');
      ack({ ok: true });
    });

    socket.on('host:regenerate', (_payload: unknown, ackFn: unknown) => {
      const ack = ackOf(ackFn);
      const c = asHost(ack);
      if (!c) return;
      let code: string;
      do {
        code = 'MIC-';
        for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      } while (byCode.has(code) || ended.has(code));
      byCode.delete(c.room.code);
      ended.set(c.room.code, { reason: 'revoked', at: Date.now() });
      c.room.code = code;
      byCode.set(code, c.room.id);
      broadcastRoom(c.room);
      ack({ ok: true, code });
    });

    socket.on('host:close', (_payload: unknown, ackFn: unknown) => {
      const ack = ackOf(ackFn);
      const c = asHost(ack);
      if (!c) return;
      ack({ ok: true });
      endRoom(c.room, 'host');
    });

    socket.on('disconnect', () => {
      const c = current();
      seats.delete(socket.id);
      if (!c || c.me.socketId !== socket.id) return;
      // Keep the seat for a short while so a refresh or network blip doesn't drop them.
      c.me.socketId = null;
      c.me.awaySince = Date.now();
      emitRoom(c.room, 'participant:updated', participantView(c.me, c.room));
    });
  });

  // ---- housekeeping --------------------------------------------------------
  setInterval(() => {
    const now = Date.now();
    for (const room of [...rooms.values()]) {
      if (room.expiresAt && room.expiresAt <= now) {
        endRoom(room, 'expired');
        continue;
      }
      for (const p of [...room.participants.values()]) {
        if (p.awaySince && now - p.awaySince > micConfig.reconnectGraceSeconds * 1000) removeParticipant(room, p.pid, 'disconnected');
      }
      if (room.participants.size === 0 && room.emptySince) {
        const idle = now - room.emptySince;
        const limit = room.expiresAt ? micConfig.emptyRoomGraceSeconds * 1000 : micConfig.persistentRoomIdleDays * 86_400_000;
        if (idle > limit) endRoom(room, 'empty');
      }
      for (const [d, until] of room.bans) if (until <= now) room.bans.delete(d);
    }
    for (const [code, e] of ended) if (now - e.at > 24 * 3600_000) ended.delete(code);
    createLimiter.sweep();
    joinLimiter.sweep();
    lookupLimiter.sweep();
    connectLimiter.sweep();
  }, 5_000).unref();

  return {
    roomCount: () => rooms.size,
    /** Admin console: every live room with who is in it (no audio ever passes through here). */
    adminRooms: () =>
      [...rooms.values()].map((room) => ({
        ...roomView(room),
        participants: [...room.participants.values()].map((p) => participantView(p, room)),
      })),
    adminClose(code: string) {
      const room = findRoom(normalizeRoomCode(code));
      if (!room) return false;
      endRoom(room, 'closed');
      return true;
    },
    adminRemove(code: string, pid: string) {
      const room = findRoom(normalizeRoomCode(code));
      const target = room?.participants.get(pid);
      if (!room || !target) return false;
      if (target.socketId) {
        nsp.to(target.socketId).emit('kicked', { reason: 'removed', banMinutes: 0 });
        nsp.sockets.get(target.socketId)?.leave(room.id);
      }
      removeParticipant(room, pid, 'removed');
      return true;
    },
  };
}

export { PARTICIPANT_CHOICES };
