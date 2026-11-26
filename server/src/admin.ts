import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { loadavg } from 'node:os';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { AccountDoc, AccountStore } from './chat/accounts.js';
import { isUserId } from './chat/identity.js';
import { gifStats, resetGifBudget } from './gif.js';
import { WindowLimiter } from './rateLimit.js';
import type { RoomRegistry } from './rooms.js';
import { applySettings, bannedIds, publicSettings, settings, type SiteSettings } from './settings.js';

/**
 * Admin console API (/api/admin/*).
 *
 * The password lives only in the server environment (ADMIN_PASSWORD) and is
 * never sent to browsers. A correct password returns a random session token
 * that the console sends as `Authorization: Bearer …`. Sessions are kept in
 * memory, expire after 2 hours without use, and end when the server restarts.
 * Wrong passwords are rate limited per IP.
 *
 * Message content and files never reach this server, so the console can't see
 * them: it manages accounts, live rooms and site-wide switches.
 */

interface ChatAdmin {
  onlineCount(): number;
  isOnline(userId: string): boolean;
  onlineGroups(): number;
  inviteCount(): number;
  kick(userId: string, reason: 'deleted' | 'banned'): boolean;
  meterReset(userId: string, at: number): void;
  relayStats(): { enabled: boolean; mbPerUserPerHour: number; mbLastHour: number };
}

interface MicAdmin {
  roomCount(): number;
  adminRooms(): { participantCount: number; participants: unknown[] }[];
  adminClose(code: string): boolean;
  adminRemove(code: string, pid: string): boolean;
}

export interface AdminOptions {
  password: string;
  production: boolean;
  inactiveDays: number;
  accounts: Promise<AccountStore> | null;
  chat: ChatAdmin;
  mic: MicAdmin;
  postman: RoomRegistry;
}

const IDLE_MS = 2 * 60 * 60 * 1000;
const MAX_SESSION_MS = 12 * 60 * 60 * 1000;
const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();

export function attachAdmin(app: Express, opts: AdminOptions) {
  const sessions = new Map<string, { created: number; seen: number; ip: string }>();
  const loginLimiter = new WindowLimiter(opts.production ? 8 : 100, 15 * 60 * 1000);
  const log: { at: number; ip: string; action: string }[] = [];
  const started = Date.now();
  const expected = opts.password ? digest(opts.password) : null;

  let accounts: AccountStore | null = null;
  let accountsError: string | null = null;
  opts.accounts
    ?.then(async (a) => {
      accounts = a;
      // Restore saved switches, the banner and the ban list.
      const saved = await a.loadSetting<Partial<SiteSettings>>('site').catch(() => null);
      if (saved) applySettings(saved);
      for (const b of await a.listBans().catch(() => [])) bannedIds.add(b._id);
    })
    .catch((err: Error) => {
      accountsError = err.message;
    });

  const audit = (req: Request, action: string) => {
    log.unshift({ at: Date.now(), ip: req.ip ?? 'unknown', action });
    if (log.length > 300) log.length = 300;
    console.log(`[admin] ${action}`);
  };

  const saveSettings = () => void accounts?.saveSetting('site', settings).catch(() => {});

  // --- Public: banner and feature switches for every visitor ---------------
  app.get('/api/site', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.json(publicSettings());
  });

  const router = express.Router();
  router.use(express.json({ limit: '32kb' }));
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.post('/login', (req, res) => {
    const ip = req.ip ?? 'unknown';
    if (!expected) return res.status(503).json({ error: 'NOT_CONFIGURED' });
    if (!loginLimiter.take(ip)) return res.status(429).json({ error: 'RATE_LIMITED' });
    const pw = typeof req.body?.password === 'string' ? req.body.password.slice(0, 200) : '';
    if (!timingSafeEqual(digest(pw), expected)) {
      console.warn(`[admin] wrong password from ${ip}`);
      return res.status(401).json({ error: 'WRONG_PASSWORD' });
    }
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    sessions.set(token, { created: now, seen: now, ip });
    audit(req, 'Signed in');
    res.json({ token, idleMinutes: IDLE_MS / 60_000 });
  });

  const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const s = token ? sessions.get(token) : undefined;
    const now = Date.now();
    if (!s || now - s.seen > IDLE_MS || now - s.created > MAX_SESSION_MS) {
      if (s) sessions.delete(token);
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    s.seen = now;
    next();
  };
  router.use(requireAdmin);

  router.post('/logout', (req, res) => {
    sessions.delete((req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''));
    res.json({ ok: true });
  });

  const needAccounts = (res: Response): AccountStore | null => {
    if (!accounts) {
      res.status(503).json({ error: opts.accounts ? (accountsError ? 'ACCOUNTS_UNAVAILABLE' : 'ACCOUNTS_STARTING') : 'ACCOUNTS_DISABLED' });
      return null;
    }
    return accounts;
  };

  const accountView = (d: AccountDoc) => ({
    userId: d._id,
    name: d.name,
    status: d.status,
    avatar: d.avatar,
    createdAt: d.createdAt.getTime(),
    lastActiveAt: d.lastActiveAt.getTime(),
    removalAt: d.lastActiveAt.getTime() + opts.inactiveDays * 86_400_000,
    online: opts.chat.isOnline(d._id),
    banned: bannedIds.has(d._id),
  });

  // --- Overview ---------------------------------------------------------------
  router.get('/overview', async (_req, res) => {
    const mem = process.memoryUsage();
    const micRooms = opts.mic.adminRooms();
    const accountStats = accounts ? await accounts.stats().catch(() => null) : null;
    res.json({
      server: {
        startedAt: started,
        uptimeSeconds: Math.round(process.uptime()),
        node: process.version,
        memoryMb: Math.round(mem.rss / 1048576),
        heapMb: Math.round(mem.heapUsed / 1048576),
        load: loadavg().map((n) => Math.round(n * 100) / 100),
        adminSessions: sessions.size,
      },
      accounts: {
        mode: accounts ? 'connected' : opts.accounts ? (accountsError ? 'error' : 'starting') : 'disabled',
        inactiveDays: opts.inactiveDays,
        ...accountStats,
        banned: bannedIds.size,
      },
      chat: { online: opts.chat.onlineCount(), groupsOnline: opts.chat.onlineGroups(), invites: opts.chat.inviteCount(), relay: opts.chat.relayStats() },
      mic: { rooms: micRooms.length, people: micRooms.reduce((n, r) => n + r.participantCount, 0) },
      postman: opts.postman.stats(),
      gif: gifStats(),
      settings,
    });
  });

  // --- Profiles ---------------------------------------------------------------
  router.get('/accounts', async (req, res) => {
    const a = needAccounts(res);
    if (!a) return;
    const q = String(req.query.q ?? '').trim().slice(0, 80);
    const page = Math.max(0, Number.parseInt(String(req.query.page ?? '0'), 10) || 0);
    const size = Math.min(100, Math.max(5, Number.parseInt(String(req.query.size ?? '25'), 10) || 25));
    const sort = req.query.sort === 'created' || req.query.sort === 'name' ? req.query.sort : 'active';
    try {
      const { items, total } = await a.list(q, page * size, size, sort);
      res.json({ items: items.map(accountView), total, page, size });
    } catch {
      res.status(503).json({ error: 'ACCOUNTS_UNAVAILABLE' });
    }
  });

  const idParam = (req: Request, res: Response): string | null => {
    const id = String(req.params.id ?? '');
    if (!isUserId(id)) {
      res.status(400).json({ error: 'INVALID_ID' });
      return null;
    }
    return id;
  };

  router.patch('/accounts/:id', async (req, res) => {
    const a = needAccounts(res);
    const id = idParam(req, res);
    if (!a || !id) return;
    const b = (req.body ?? {}) as Record<string, unknown>;
    const patch: { name?: string; status?: string; avatar?: null } = {};
    if (typeof b.name === 'string') {
      const name = b.name.trim().slice(0, 60);
      if (!name) return res.status(400).json({ error: 'INVALID_NAME' });
      patch.name = name;
    }
    if (typeof b.status === 'string') patch.status = b.status.trim().slice(0, 140);
    if (b.removeAvatar === true) patch.avatar = null;
    const doc = await a.adminEdit(id, patch).catch(() => null);
    if (!doc) return res.status(404).json({ error: 'NOT_FOUND' });
    audit(req, `Edited profile ${doc.name} (${id})`);
    res.json({ account: accountView(doc) });
  });

  router.post('/accounts/:id/keep-alive', async (req, res) => {
    const a = needAccounts(res);
    const id = idParam(req, res);
    if (!a || !id) return;
    if (!(await a.keepAlive(id).catch(() => false))) return res.status(404).json({ error: 'NOT_FOUND' });
    audit(req, `Reset inactivity timer for ${id}`);
    res.json({ ok: true });
  });

  router.post('/accounts/:id/reset-meter', async (req, res) => {
    const a = needAccounts(res);
    const id = idParam(req, res);
    if (!a || !id) return;
    const at = await a.resetMeter(id).catch(() => null);
    if (!at) return res.status(404).json({ error: 'NOT_FOUND' });
    opts.chat.meterReset(id, at);
    audit(req, `Cleared likes and dislikes for ${id}`);
    res.json({ ok: true, at });
  });

  const ban = async (req: Request, id: string, reason: string, name: string | null) => {
    bannedIds.add(id);
    await accounts?.ban(id, reason, name);
    opts.chat.kick(id, 'banned');
    audit(req, `Suspended ${name ?? id}${reason ? `: ${reason}` : ''}`);
  };

  router.delete('/accounts/:id', async (req, res) => {
    const a = needAccounts(res);
    const id = idParam(req, res);
    if (!a || !id) return;
    const doc = await a.get(id).catch(() => null);
    const removed = await a.remove(id).catch(() => false);
    if (!removed) return res.status(404).json({ error: 'NOT_FOUND' });
    if (req.query.ban === '1') await ban(req, id, String(req.query.reason ?? '').slice(0, 200), doc?.name ?? null);
    else opts.chat.kick(id, 'deleted');
    audit(req, `Deleted profile ${doc?.name ?? ''} (${id})`);
    res.json({ ok: true });
  });

  router.post('/accounts/purge-inactive', async (req, res) => {
    const a = needAccounts(res);
    if (!a) return;
    const days = Number(req.body?.days);
    if (!Number.isFinite(days) || days < 1 || days > 3650) return res.status(400).json({ error: 'INVALID_DAYS' });
    const n = await a.removeInactive(days).catch(() => null);
    if (n === null) return res.status(503).json({ error: 'ACCOUNTS_UNAVAILABLE' });
    audit(req, `Deleted ${n} profile(s) inactive for ${days}+ days`);
    res.json({ deleted: n });
  });

  // --- Suspensions --------------------------------------------------------------
  router.get('/bans', async (_req, res) => {
    const list = accounts ? await accounts.listBans().catch(() => []) : [...bannedIds].map((_id) => ({ _id, reason: '', name: null, at: null }));
    res.json({ items: list.map((b) => ({ userId: b._id, reason: b.reason, name: b.name, at: b.at ? new Date(b.at).getTime() : null })) });
  });

  router.post('/bans', async (req, res) => {
    const raw = String(req.body?.userId ?? '').replace(/[-\s]/g, '');
    if (!isUserId(raw)) return res.status(400).json({ error: 'INVALID_ID' });
    const doc = accounts ? await accounts.get(raw).catch(() => null) : null;
    await ban(req, raw, String(req.body?.reason ?? '').slice(0, 200), doc?.name ?? null);
    res.json({ ok: true });
  });

  router.delete('/bans/:id', async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    bannedIds.delete(id);
    await accounts?.unban(id).catch(() => {});
    audit(req, `Lifted suspension of ${id}`);
    res.json({ ok: true });
  });

  // --- Mic rooms ----------------------------------------------------------------
  router.get('/mic', (_req, res) => res.json({ rooms: opts.mic.adminRooms() }));

  router.post('/mic/:code/close', (req, res) => {
    if (!opts.mic.adminClose(String(req.params.code))) return res.status(404).json({ error: 'NOT_FOUND' });
    audit(req, `Closed Mic room ${req.params.code}`);
    res.json({ ok: true });
  });

  router.post('/mic/:code/remove', (req, res) => {
    if (!opts.mic.adminRemove(String(req.params.code), String(req.body?.pid ?? ''))) return res.status(404).json({ error: 'NOT_FOUND' });
    audit(req, `Removed someone from Mic room ${req.params.code}`);
    res.json({ ok: true });
  });

  // --- Switches and announcement ------------------------------------------------
  router.put('/settings', (req, res) => {
    const before = { ...settings };
    const b = (req.body ?? {}) as Partial<SiteSettings>;
    if (b.announcement && typeof b.announcement === 'object') b.announcement = { ...b.announcement, updatedAt: Date.now() };
    applySettings(b);
    const names = { signupsOpen: 'new accounts', gifsEnabled: 'GIFs', micCreateEnabled: 'new Mic rooms', postmanEnabled: 'Postman transfers' } as const;
    let changed = false;
    for (const k of Object.keys(names) as (keyof typeof names)[]) {
      if (settings[k] !== before[k]) {
        changed = true;
        audit(req, `Turned ${names[k]} ${settings[k] ? 'on' : 'off'}`);
      }
    }
    if (JSON.stringify(settings.announcement) !== JSON.stringify(before.announcement)) {
      changed = true;
      audit(req, settings.announcement ? `Published announcement: "${settings.announcement.text.slice(0, 80)}"` : 'Removed the announcement');
    }
    if (changed) saveSettings();
    res.json({ settings });
  });

  router.post('/gif/reset', (req, res) => {
    resetGifBudget();
    audit(req, 'Reset the GIF hourly budget');
    res.json({ gif: gifStats() });
  });

  router.get('/log', (_req, res) => res.json({ items: log }));

  app.use('/api/admin', router);

  setInterval(() => {
    const now = Date.now();
    loginLimiter.sweep();
    for (const [t, s] of sessions) if (now - s.seen > IDLE_MS || now - s.created > MAX_SESSION_MS) sessions.delete(t);
  }, 60_000).unref();
}
