import type { Express } from 'express';
import { WindowLimiter } from './rateLimit.js';

/**
 * GIPHY proxy for UR Chat's GIF and sticker picker.
 *
 * The API key stays on the server. All browsers share one GIPHY budget
 * (GIPHY_HOURLY_LIMIT calls per rolling hour, 100 for a beta key), so results
 * are cached and the budget is counted here. When it runs out, or GIPHY
 * rejects the key, the browser gets a clear error to show instead of GIFs.
 */
const env = process.env;
const KEY = env.GIPHY_API_KEY || '';
const HOURLY_LIMIT = Math.max(1, Number.parseInt(env.GIPHY_HOURLY_LIMIT || '100', 10) || 100);
const RATING = ['g', 'pg', 'pg-13', 'r'].includes(env.GIPHY_RATING || '') ? env.GIPHY_RATING! : 'g';
const HOUR = 60 * 60 * 1000;
const LIMIT = 24;

interface GifItem {
  id: string;
  title: string;
  preview: { url: string; width: number; height: number };
  full: { url: string; width: number; height: number };
}

type Upstream = { ok: true; items: GifItem[] } | { ok: false; status: number; error: string; retryAfter?: number };

const calls: number[] = []; // timestamps of upstream calls in the last hour
const cache = new Map<string, { at: number; items: GifItem[] }>();
let unauthorizedUntil = 0;
let upstreamLimitedUntil = 0;

function budgetLeft(now: number) {
  while (calls.length && now - calls[0] > HOUR) calls.shift();
  return HOURLY_LIMIT - calls.length;
}

function image(i: Record<string, { url?: string; webp?: string; width?: string; height?: string }> | undefined, key: string) {
  const v = i?.[key];
  const url = v?.webp || v?.url;
  if (!url) return null;
  return { url, width: Number(v.width) || 200, height: Number(v.height) || 200 };
}

function trim(data: unknown[]): GifItem[] {
  const out: GifItem[] = [];
  for (const d of data as { id?: string; title?: string; images?: Record<string, { url?: string; webp?: string; width?: string; height?: string }> }[]) {
    const preview = image(d.images, 'fixed_width_small') ?? image(d.images, 'fixed_width');
    const full = image(d.images, 'fixed_width') ?? image(d.images, 'downsized');
    if (!d.id || !preview || !full) continue;
    out.push({ id: d.id, title: (d.title ?? '').slice(0, 120), preview, full });
  }
  return out;
}

async function fetchGiphy(kind: 'gifs' | 'stickers', q: string): Promise<Upstream> {
  const now = Date.now();
  if (!KEY) return { ok: false, status: 503, error: 'NOT_CONFIGURED' };
  if (unauthorizedUntil > now) return { ok: false, status: 503, error: 'UNAUTHORIZED' };
  if (upstreamLimitedUntil > now) return { ok: false, status: 429, error: 'LIMIT_REACHED', retryAfter: Math.ceil((upstreamLimitedUntil - now) / 1000) };

  const key = `${kind}:${q.toLowerCase()}`;
  const hit = cache.get(key);
  // Trending stays fresh for 15 minutes, searches for an hour.
  if (hit && now - hit.at < (q ? HOUR : 15 * 60 * 1000)) return { ok: true, items: hit.items };

  if (budgetLeft(now) <= 0) {
    // Serve stale results rather than nothing, if we have them.
    if (hit) return { ok: true, items: hit.items };
    return { ok: false, status: 429, error: 'LIMIT_REACHED', retryAfter: Math.ceil((calls[0] + HOUR - now) / 1000) };
  }

  const params = new URLSearchParams({ api_key: KEY, limit: String(LIMIT), rating: RATING, bundle: 'messaging_non_clips' });
  if (q) params.set('q', q);
  const url = `https://api.giphy.com/v1/${kind}/${q ? 'search' : 'trending'}?${params}`;
  calls.push(now);
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  } catch {
    return { ok: false, status: 502, error: 'UPSTREAM' };
  }
  if (res.status === 401 || res.status === 403) {
    unauthorizedUntil = now + 10 * 60 * 1000; // don't keep hammering with a bad key
    console.warn('[gif] GIPHY rejected the API key (HTTP %d)', res.status);
    return { ok: false, status: 503, error: 'UNAUTHORIZED' };
  }
  if (res.status === 429) {
    upstreamLimitedUntil = now + 15 * 60 * 1000;
    return { ok: false, status: 429, error: 'LIMIT_REACHED', retryAfter: 15 * 60 };
  }
  if (!res.ok) return { ok: false, status: 502, error: 'UPSTREAM' };
  const body = (await res.json().catch(() => null)) as { data?: unknown[] } | null;
  const items = trim(Array.isArray(body?.data) ? body!.data : []);
  cache.set(key, { at: now, items });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return { ok: true, items };
}

export function attachGif(app: Express, opts: { production: boolean }) {
  // Per-IP limit so one visitor can't use up the shared hourly budget.
  const perIp = new WindowLimiter(opts.production ? 40 : 400, 10 * 60 * 1000);
  setInterval(() => perIp.sweep(), 60_000).unref();

  app.get('/api/gif/:kind', async (req, res) => {
    const kind = req.params.kind === 'stickers' ? 'stickers' : req.params.kind === 'gifs' ? 'gifs' : null;
    if (!kind) return res.status(404).json({ error: 'NOT_FOUND' });
    const q = String(req.query.q ?? '').trim().replace(/\s+/g, ' ').slice(0, 50);
    if (!perIp.take(req.ip ?? 'unknown')) return res.status(429).json({ error: 'LIMIT_REACHED', retryAfter: 600 });
    const r = await fetchGiphy(kind, q);
    res.setHeader('Cache-Control', 'no-store');
    if (!r.ok) return res.status(r.status).json({ error: r.error, retryAfter: r.retryAfter });
    res.json({ items: r.items });
  });
}

/** Only GIPHY's media hosts may appear in GIF messages. */
export const GIPHY_MEDIA = /^https:\/\/(media\d*|i)\.giphy\.com\//;
