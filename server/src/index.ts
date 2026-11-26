import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import express from 'express';
import { Server, type Socket } from 'socket.io';
import { AccountStore } from './chat/accounts.js';
import { attachChat } from './chat/hub.js';
import { attachMic } from './mic/hub.js';
import { attachGif } from './gif.js';
import { attachAdmin } from './admin.js';
import { settings } from './settings.js';
import { config } from './config.js';
import { buildIceConfig, startIce } from './ice.js';
import { TokenBucket, WindowLimiter } from './rateLimit.js';
import { RoomRegistry, type Role, type Room } from './rooms.js';
import { isToken, normalizeCode, parseSignal } from './validate.js';

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', true);

// --- HTTP hardening -------------------------------------------------------
app.use((req, res, next) => {
  if (config.forceHttps && req.protocol === 'http' && req.method === 'GET') {
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self)');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (config.forceHttps) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      // GIPHY media for GIFs and stickers in UR Chat.
      "img-src 'self' data: blob: https://*.giphy.com",
      "font-src 'self'",
      "media-src 'self' blob:",
      // 'self' covers same-origin WebSockets in modern browsers; ws:/wss: for older Safari.
      "connect-src 'self' ws: wss:",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'self'",
    ].join('; '),
  );
  next();
});

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size, chatOnline: chat.onlineCount(), micRooms: mic.roomCount() });
});

// Static client + SPA fallback are registered after the API routes (see below).


// --- Signaling ------------------------------------------------------------
const httpServer = createServer(app);
const io = new Server(httpServer, {
  serveClient: false,
  maxHttpBufferSize: 64 * 1024,
  pingInterval: 20_000,
  pingTimeout: 20_000,
  cors: config.corsOrigins.length ? { origin: config.corsOrigins } : undefined,
});

const rooms = new RoomRegistry({
  waitingTtlMs: config.rooms.waitingTtl * 1000,
  pairedTtlMs: config.rooms.pairedTtl * 1000,
  graceMs: config.rooms.reconnectGrace * 1000,
  maxRooms: config.rooms.maxRooms,
});

const windowMs = config.limits.windowSeconds * 1000;
const connectLimiter = new WindowLimiter(config.limits.connectionsPerWindow, windowMs);
const createLimiter = new WindowLimiter(config.limits.roomCreatesPerWindow, windowMs);
const joinLimiter = new WindowLimiter(config.limits.joinAttemptsPerWindow, windowMs);

function clientIp(socket: Socket): string {
  if (config.trustProxy) {
    const xff = socket.handshake.headers['x-forwarded-for'];
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return socket.handshake.address;
}

type Ack = (response: Record<string, unknown>) => void;
const ackOf = (fn: unknown): Ack => (typeof fn === 'function' ? (fn as Ack) : () => {});

io.use((socket, next) => {
  if (!connectLimiter.take(clientIp(socket))) return next(new Error('RATE_LIMITED'));
  next();
});

function roomResponse(room: Room, token: string) {
  return { ok: true, code: room.code, token, expiresAt: room.expiresAt, ice: buildIceConfig() };
}

function notifyPeerOfLeave(room: Room, role: Role) {
  if (role === 'host') {
    if (room.guest?.socketId) io.to(room.guest.socketId).emit('room:closed', { reason: 'host-left' });
  } else if (room.host.socketId) {
    io.to(room.host.socketId).emit('peer:left');
  }
}

function leaveCurrentRoom(socket: Socket) {
  const ref = rooms.lookup(socket.id);
  if (!ref) return;
  notifyPeerOfLeave(ref.room, ref.role);
  rooms.leave(ref.room, ref.role);
}

// --- STUN/TURN: fetch managed TURN credentials when configured ------------
startIce();

// --- UR Chat (namespace /chat + /api/chat) -------------------------------
const accountStore = config.chat.mongoUri
  ? AccountStore.connect(config.chat.mongoUri, config.chat.mongoDb, config.chat.inactiveDays)
  : null;
const chat = attachChat(io, app, {
  clientIp,
  dataFile: config.chat.dataFile,
  production: config.isProduction,
  accounts: accountStore,
  anthropicApiKey: config.anthropicApiKey,
  connectionHourlyLimit: config.connectionHourlyLimit,
});

// --- GIPHY proxy for UR Chat (key stays on the server) --------------------
attachGif(app, { production: config.isProduction });

// --- Mic voice rooms (namespace /mic + /api/mic) -------------------------
const mic = attachMic(io, app, { clientIp, production: config.isProduction });

// --- Admin console API (password only in the server environment) ---------
attachAdmin(app, {
  password: config.adminPassword,
  production: config.isProduction,
  inactiveDays: config.chat.inactiveDays,
  accounts: accountStore,
  chat,
  mic,
  postman: rooms,
});

// --- Static client + SPA fallback (after all API routes) ------------------
if (config.serveClient && existsSync(config.clientDist)) {
  app.use(
    '/assets',
    express.static(resolve(config.clientDist, 'assets'), { immutable: true, maxAge: '1y', index: false }),
  );
  app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
  // SPA fallback: any page URL (no file extension) gets the app shell; the
  // client router decides what to show, including its own 404 page.
  app.get(/^\/(?!socket\.io\/)[^.]*$/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(resolve(config.clientDist, 'index.html'));
  });
}

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

io.on('connection', (socket) => {
  const ip = clientIp(socket);
  const signalBucket = new TokenBucket(config.limits.signalsPerSecond, config.limits.signalsPerSecond * 4);

  socket.on('room:create', (_payload: unknown, ackFn: unknown) => {
    const ack = ackOf(ackFn);
    if (!createLimiter.take(ip)) return ack({ ok: false, error: 'RATE_LIMITED' });
    if (!settings.postmanEnabled) return ack({ ok: false, error: 'PAUSED' });
    leaveCurrentRoom(socket);
    const room = rooms.create(socket.id);
    if (!room) return ack({ ok: false, error: 'SERVER_BUSY' });
    ack(roomResponse(room, room.host.token));
  });

  socket.on('room:join', (payload: unknown, ackFn: unknown) => {
    const ack = ackOf(ackFn);
    if (!joinLimiter.take(ip)) return ack({ ok: false, error: 'RATE_LIMITED' });
    const code = normalizeCode((payload as { code?: unknown } | null)?.code);
    if (!code) return ack({ ok: false, error: 'INVALID_CODE' });

    leaveCurrentRoom(socket);
    const result = rooms.join(code, socket.id);
    if ('error' in result) return ack({ ok: false, error: result.error });

    const { room } = result;
    ack(roomResponse(room, room.guest!.token));
    if (room.host.socketId) io.to(room.host.socketId).emit('peer:joined');
  });

  socket.on('room:resume', (payload: unknown, ackFn: unknown) => {
    const ack = ackOf(ackFn);
    const p = payload as { code?: unknown; token?: unknown } | null;
    const code = normalizeCode(p?.code);
    if (!code || !isToken(p?.token)) return ack({ ok: false, error: 'INVALID_CODE' });
    const result = rooms.resume(code, p!.token as string, socket.id);
    if (!result) return ack({ ok: false, error: 'ROOM_NOT_FOUND' });
    const peerPresent = result.role === 'host' ? !!result.room.guest : true;
    ack({ ok: true, role: result.role, peerPresent, expiresAt: result.room.expiresAt });
  });

  socket.on('room:leave', () => leaveCurrentRoom(socket));

  socket.on('signal', (payload: unknown) => {
    if (!signalBucket.take()) return;
    const ref = rooms.lookup(socket.id);
    if (!ref) return;
    const message = parseSignal(payload);
    if (!message) return;
    const target = rooms.peerSocket(ref.room, ref.role);
    if (target) io.to(target).emit('signal', message);
  });

  socket.on('disconnect', () => rooms.markAway(socket.id));
});

// --- Housekeeping ---------------------------------------------------------
setInterval(() => {
  const { expired, abandoned } = rooms.sweep();
  for (const room of expired) {
    for (const seat of [room.host, room.guest]) {
      if (seat?.socketId) io.to(seat.socketId).emit('room:closed', { reason: 'expired' });
    }
  }
  for (const { room, role } of abandoned) notifyPeerOfLeave(room, role);
  connectLimiter.sweep();
  createLimiter.sweep();
  joinLimiter.sweep();
}, 10_000).unref();

httpServer.listen(config.port, config.host, () => {
  const ice = buildIceConfig();
  console.log(`[signaling] listening on http://${config.host}:${config.port}`);
  console.log(`[signaling] TURN ${ice.turnEnabled ? 'enabled' : 'not configured'} · ICE policy ${ice.iceTransportPolicy}`);
});

function shutdown() {
  io.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
