import { createHmac, randomBytes } from 'node:crypto';
import { config } from './config.js';

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceConfig {
  iceServers: IceServer[];
  iceTransportPolicy: 'all' | 'relay';
  turnEnabled: boolean;
}

/**
 * Builds the ICE configuration handed to a peer when it creates or joins a room.
 *
 * With TURN_SECRET set, credentials follow the TURN REST API convention used by
 * coturn (`use-auth-secret`): username = "<expiry>:<random>", credential =
 * base64(HMAC-SHA1(secret, username)). They expire, so leaked credentials are
 * of limited use.
 */
export function buildIceConfig(): IceConfig {
  const { ice } = config;
  const iceServers: IceServer[] = [];

  if (ice.stunUrls.length) iceServers.push({ urls: ice.stunUrls });

  let turnEnabled = false;
  if (cloudflare) {
    // Cloudflare's servers already include STUN; keep ours too as a fallback.
    iceServers.push(...cloudflare.servers);
    turnEnabled = true;
  } else if (ice.turnUrls.length) {
    if (ice.turnSecret) {
      const expiry = Math.floor(Date.now() / 1000) + ice.turnCredentialTtl;
      const username = `${expiry}:${randomBytes(6).toString('hex')}`;
      const credential = createHmac('sha1', ice.turnSecret).update(username).digest('base64');
      iceServers.push({ urls: ice.turnUrls, username, credential });
      turnEnabled = true;
    } else if (ice.turnUsername && ice.turnCredential) {
      iceServers.push({ urls: ice.turnUrls, username: ice.turnUsername, credential: ice.turnCredential });
      turnEnabled = true;
    } else {
      console.warn('[ice] TURN_URLS is set but no TURN_SECRET or TURN_USERNAME/TURN_CREDENTIAL; TURN disabled.');
    }
  }

  return {
    iceServers,
    iceTransportPolicy: turnEnabled ? ice.transportPolicy : 'all',
    turnEnabled,
  };
}

// --- Cloudflare Realtime TURN ------------------------------------------------
// Short-lived credentials are fetched from Cloudflare by the server (the API
// token never reaches browsers), cached, and refreshed well before they expire.

const CF_TTL_SECONDS = 24 * 60 * 60;
let cloudflare: { servers: IceServer[]; expiresAt: number } | null = null;

async function refreshCloudflare(): Promise<number> {
  const { cloudflareTurnKeyId: keyId, cloudflareTurnToken: token } = config.ice;
  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: CF_TTL_SECONDS }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { iceServers?: unknown };
    const servers = (Array.isArray(body.iceServers) ? body.iceServers : [body.iceServers]).filter(
      (s): s is IceServer => !!s && typeof s === 'object' && 'urls' in s,
    );
    if (!servers.some((s) => s.username && s.credential)) throw new Error('no TURN credentials in the response');
    const first = !cloudflare;
    cloudflare = { servers, expiresAt: Date.now() + CF_TTL_SECONDS * 1000 };
    if (first) console.log('[ice] Cloudflare TURN enabled');
    return CF_TTL_SECONDS * 1000 * 0.5; // refresh at half-life
  } catch (err) {
    console.error('[ice] Cloudflare TURN credentials failed:', (err as Error).message);
    // Keep using unexpired credentials; otherwise fall back to the other settings.
    if (cloudflare && cloudflare.expiresAt < Date.now() + 60 * 60 * 1000) cloudflare = null;
    return 5 * 60 * 1000;
  }
}

/** Starts fetching Cloudflare TURN credentials when configured. Call once at start-up. */
export function startIce() {
  if (!config.ice.cloudflareTurnKeyId || !config.ice.cloudflareTurnToken) return;
  const loop = async () => setTimeout(loop, await refreshCloudflare()).unref();
  void loop();
}
