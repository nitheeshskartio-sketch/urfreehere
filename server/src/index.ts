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
      // GIPHY media for GIFs and stickers.
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
  res.json({ ok: true, chatOnline: chat.onlineCount(), voiceRooms: mic.roomCount() });
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

function clientIp(socket: Socket): string {
  if (config.trustProxy) {
    const xff = socket.handshake.headers['x-forwarded-for'];
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return socket.handshake.address;
}

// --- STUN/TURN: fetch managed TURN credentials when configured ------------
startIce();

// --- Humble chat (namespace /chat + /api/chat) ----------------------------
const accountStore = config.chat.mongoUri
  ? AccountStore.connect(config.chat.mongoUri, config.chat.mongoDb, config.chat.inactiveDays)
  : null;
const chat = attachChat(io, app, {
  clientIp,
  dataFile: config.chat.dataFile,
  production: config.isProduction,
  accounts: accountStore,
  relayMbPerHour: config.relayMbPerHour,
  push: { publicKey: config.vapidPublicKey, privateKey: config.vapidPrivateKey, subject: config.vapidSubject },
});

// --- GIPHY proxy for Humble (key stays on the server) ---------------------
attachGif(app, { production: config.isProduction });

// --- Voice calls in chats (namespace /mic + /api/mic) ----------------------
const mic = attachMic(io, app, { clientIp, production: config.isProduction });

// --- Admin console API (password only in the server environment) ---------
attachAdmin(app, {
  password: config.adminPassword,
  production: config.isProduction,
  inactiveDays: config.chat.inactiveDays,
  accounts: accountStore,
  chat,
  mic,
});

// --- Static client + SPA fallback (after all API routes) ------------------
if (config.serveClient && existsSync(config.clientDist)) {
  app.use(
    '/assets',
    express.static(resolve(config.clientDist, 'assets'), { immutable: true, maxAge: '1y', index: false }),
  );
  app.use(
    express.static(config.clientDist, {
      index: false,
      maxAge: '1h',
      // The service worker and app manifest must never be cached, so updates reach installed apps.
      setHeaders: (res, path) => {
        if (path.endsWith('sw.js') || path.endsWith('.webmanifest')) res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );
  // SPA fallback: any page URL (no file extension) gets the app shell; the
  // client router decides what to show, including its own 404 page.
  app.get(/^\/(?!socket\.io\/)[^.]*$/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(resolve(config.clientDist, 'index.html'));
  });
}

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

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
