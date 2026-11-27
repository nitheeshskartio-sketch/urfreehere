import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const projectRoot = resolve(here, '..', '..');

/**
 * Minimal .env loader (Node 18 has no --env-file). Real environment
 * variables always win over values from the file.
 */
function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvFile(resolve(projectRoot, '.env'));

const env = process.env;

function int(name: string, fallback: number): number {
  const v = Number.parseInt(env[name] ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function list(name: string, fallback: string[] = []): string[] {
  const v = env[name];
  if (v === undefined) return fallback;
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  port: int('PORT', 3001),
  host: env.HOST || '0.0.0.0',
  isProduction: env.NODE_ENV === 'production',
  /** Origins allowed to open a signaling socket. Empty = same origin only. */
  corsOrigins: list('CORS_ORIGINS'),
  /** Trust X-Forwarded-* headers (set when running behind a reverse proxy). */
  trustProxy: env.TRUST_PROXY === 'true' || env.TRUST_PROXY === '1',
  /** Redirect plain HTTP to HTTPS (needs TRUST_PROXY behind a TLS-terminating proxy). */
  forceHttps: env.FORCE_HTTPS === 'true' || env.FORCE_HTTPS === '1',
  /** Serve the built client from client/dist. */
  serveClient: env.SERVE_CLIENT !== 'false',
  clientDist: resolve(projectRoot, 'client', 'dist'),

  /** Password for the admin console (/admin). Empty disables it. Never sent to browsers. */
  adminPassword: env.ADMIN_PASSWORD || '',

  /**
   * Humble server relay: when two people can't connect directly (strict NATs,
   * no TURN), their messages and files are forwarded over the signaling socket.
   * Megabytes each user may relay per hour; 0 switches the relay off.
   */
  relayMbPerHour: Number.isFinite(Number(env.RELAY_MB_PER_HOUR)) && env.RELAY_MB_PER_HOUR !== '' && env.RELAY_MB_PER_HOUR !== undefined ? Math.max(0, Number(env.RELAY_MB_PER_HOUR)) : 200,

  /**
   * Web Push (notifications while Humble is closed). Leave empty to have the
   * server create keys once and keep them in MongoDB.
   */
  vapidPublicKey: env.VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: env.VAPID_PRIVATE_KEY || '',
  /** Contact for push services (an https URL or mailto:). */
  vapidSubject: env.VAPID_SUBJECT || 'https://urfreehere.onrender.com',

  chat: {
    /** MongoDB for Humble accounts (profiles only). Leave empty to run without accounts. */
    mongoUri: env.MONGODB_URI || '',
    mongoDb: env.MONGODB_DB || 'urfreehere',
    /** Accounts with no activity for this many days are deleted by a MongoDB TTL index. */
    inactiveDays: Number(env.ACCOUNT_INACTIVE_DAYS) > 0 ? Number(env.ACCOUNT_INACTIVE_DAYS) : 7,
    /** Where invite metadata is kept between restarts. Set CHAT_DATA_FILE=none to keep it in memory only. */
    dataFile:
      env.CHAT_DATA_FILE === 'none' ? null : resolve(projectRoot, env.CHAT_DATA_FILE || 'data/chat-invites.json'),
  },

  ice: {
    stunUrls: list('STUN_URLS', ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']),
    turnUrls: list('TURN_URLS'),
    /** Static TURN credentials (simple setups). */
    turnUsername: env.TURN_USERNAME || '',
    turnCredential: env.TURN_CREDENTIAL || '',
    /** Shared secret for time-limited TURN REST credentials (coturn `use-auth-secret`). Preferred. */
    turnSecret: env.TURN_SECRET || '',
    turnCredentialTtl: int('TURN_CREDENTIAL_TTL_SECONDS', 6 * 60 * 60),
    /** Cloudflare Realtime TURN (managed, free tier): key ID and API token from the Cloudflare dashboard. */
    cloudflareTurnKeyId: env.CLOUDFLARE_TURN_KEY_ID || '',
    cloudflareTurnToken: env.CLOUDFLARE_TURN_API_TOKEN || '',
    /** "all" (default) or "relay" to force TURN, useful for testing. */
    transportPolicy: env.ICE_TRANSPORT_POLICY === 'relay' ? ('relay' as const) : ('all' as const),
  },
};

export type Config = typeof config;
