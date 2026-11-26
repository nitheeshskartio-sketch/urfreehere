export interface GifItem {
  id: string;
  title: string;
  preview: { url: string; width: number; height: number };
  full: { url: string; width: number; height: number };
}

export type GifError = 'LIMIT_REACHED' | 'UNAUTHORIZED' | 'NOT_CONFIGURED' | 'UPSTREAM' | 'OFFLINE';

export class GifLoadError extends Error {
  constructor(
    readonly code: GifError,
    readonly retryAfter?: number,
  ) {
    super(code);
  }
}

const BASE: string = import.meta.env.VITE_SIGNALING_URL || '';
const cache = new Map<string, GifItem[]>();

/** Trending (empty query) or search results, via the server's GIPHY proxy. Cached per session. */
export async function loadGifs(kind: 'gifs' | 'stickers', q: string): Promise<GifItem[]> {
  const key = `${kind}:${q.trim().toLowerCase()}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/gif/${kind}?q=${encodeURIComponent(q.trim())}`);
  } catch {
    throw new GifLoadError('OFFLINE');
  }
  const body = (await res.json().catch(() => ({}))) as { items?: GifItem[]; error?: GifError; retryAfter?: number };
  if (!res.ok || !body.items) throw new GifLoadError(body.error ?? 'UPSTREAM', body.retryAfter);
  cache.set(key, body.items);
  return body.items;
}

export function gifErrorText(err: GifLoadError): { title: string; message: string } {
  switch (err.code) {
    case 'LIMIT_REACHED': {
      const mins = err.retryAfter ? Math.max(1, Math.ceil(err.retryAfter / 60)) : null;
      return {
        title: 'GIFs are taking a short break',
        message: `The GIF feature isn't available right now because the hourly GIF limit was reached.${mins ? ` Try again in about ${mins} minute${mins === 1 ? '' : 's'}.` : ' Try again later.'}`,
      };
    }
    case 'UNAUTHORIZED':
      return { title: 'GIFs unavailable', message: "The GIF feature isn't available: the GIPHY API key wasn't accepted (unauthorized)." };
    case 'NOT_CONFIGURED':
      return { title: 'GIFs not set up', message: "GIFs aren't enabled on this server yet." };
    case 'OFFLINE':
      return { title: "You're offline", message: 'Connect to the internet to browse GIFs.' };
    default:
      return { title: "Couldn't load GIFs", message: 'GIPHY did not respond. Try again in a moment.' };
  }
}
