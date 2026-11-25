import { createHash, createPublicKey, randomBytes, verify, type KeyObject } from 'node:crypto';

/**
 * Chat identities are ECDSA P-256 key pairs generated in the browser. The
 * user ID is derived from the public key, so an ID can't be claimed without
 * the matching private key. Must stay identical to client/src/apps/chat/lib/identity.ts.
 */
export const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols, no I/O/0/1
export const ID_LENGTH = 16;
const ID_RE = new RegExp(`^[${ID_ALPHABET}]{${ID_LENGTH}}$`);

export interface PublicJwk {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
}

export function isUserId(v: unknown): v is string {
  return typeof v === 'string' && ID_RE.test(v);
}

export function parsePublicJwk(v: unknown): PublicJwk | null {
  if (!v || typeof v !== 'object') return null;
  const k = v as Record<string, unknown>;
  const b64 = /^[A-Za-z0-9_-]{43}$/;
  if (k.kty !== 'EC' || k.crv !== 'P-256' || typeof k.x !== 'string' || typeof k.y !== 'string') return null;
  if (!b64.test(k.x) || !b64.test(k.y)) return null;
  return { kty: 'EC', crv: 'P-256', x: k.x, y: k.y };
}

function base32(bytes: Uint8Array, length: number): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < length) {
      out += ID_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  return out;
}

export function userIdFromJwk(jwk: PublicJwk): string {
  const digest = createHash('sha256').update(`${jwk.crv}:${jwk.x}:${jwk.y}`).digest();
  return base32(digest.subarray(0, 10), ID_LENGTH);
}

export function keyFromJwk(jwk: PublicJwk): KeyObject | null {
  try {
    return createPublicKey({ key: { ...jwk }, format: 'jwk' });
  } catch {
    return null;
  }
}

/** Verifies a WebCrypto ECDSA P-256 / SHA-256 signature (raw r||s, base64url). */
export function verifySignature(key: KeyObject, data: string, signatureB64url: string): boolean {
  try {
    const sig = Buffer.from(signatureB64url, 'base64url');
    if (sig.length !== 64) return false;
    return verify('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' }, sig);
  } catch {
    return false;
  }
}

export function newNonce(): string {
  return randomBytes(24).toString('base64url');
}

export const AUTH_PREFIX = 'urfree-chat-auth:';
