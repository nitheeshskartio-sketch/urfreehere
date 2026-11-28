/**
 * Chat lock: a PIN (stored only as a salted PBKDF2 hash) and, where the device
 * has one, fingerprint / face unlock through a passkey made on this device.
 *
 * This keeps a locked chat out of sight from someone picking up an unlocked
 * phone. It isn't encryption: the messages stay in this browser's storage.
 */
import type { ChatLockConfig } from './types';

const ITERATIONS = 150_000;

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const fromB64url = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256);
  return b64url(bits);
}

export const PIN_RE = /^\d{4,8}$/;

export async function makeLock(pin: string, credId?: string): Promise<ChatLockConfig> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: b64url(salt), hash: await derive(pin, salt), ...(credId ? { credId } : {}) };
}

export async function checkPin(cfg: ChatLockConfig, pin: string): Promise<boolean> {
  if (!PIN_RE.test(pin)) return false;
  const h = await derive(pin, fromB64url(cfg.salt));
  // Constant-time-ish compare.
  let diff = h.length ^ cfg.hash.length;
  for (let i = 0; i < Math.min(h.length, cfg.hash.length); i++) diff |= h.charCodeAt(i) ^ cfg.hash.charCodeAt(i);
  return diff === 0;
}

/** Does this device have fingerprint / face / device-PIN unlock for passkeys? */
export async function biometricAvailable(): Promise<boolean> {
  try {
    return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
}

/** Makes a passkey on this device for unlocking chats. Returns its ID, or null if cancelled. */
export async function enrollBiometric(name: string): Promise<string | null> {
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'Humble chat lock' },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: `${name || 'Humble'} (chat lock)`, displayName: name || 'Humble' },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        timeout: 60_000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null;
    return cred ? b64url(cred.rawId) : null;
  } catch {
    return null;
  }
}

/** Asks for fingerprint / face. True when the person passed. */
export async function verifyBiometric(credId: string): Promise<boolean> {
  try {
    const got = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: fromB64url(credId) }],
        userVerification: 'required',
        timeout: 60_000,
      },
    });
    return !!got;
  } catch {
    return false;
  }
}
