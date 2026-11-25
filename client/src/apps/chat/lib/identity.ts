import { generateKeys, sha256, signBytes, verifyBytes } from './cryptoCompat';
import { b64url, base32, canonical, fromB64url, ID_LENGTH } from './encoding';
import type { PublicJwk, UserId } from './types';

export interface Identity {
  userId: UserId;
  publicJwk: PublicJwk;
  /** Web Crypto key (non-extractable) when created on a secure page. */
  privateKey?: CryptoKey;
  publicKey?: CryptoKey;
  /** Raw key when created on a plain-HTTP page (local network development). */
  priv?: Uint8Array;
}

const enc = new TextEncoder();

export async function userIdFromJwk(jwk: PublicJwk): Promise<UserId> {
  const digest = await sha256(enc.encode(`${jwk.crv}:${jwk.x}:${jwk.y}`));
  return base32(digest.subarray(0, 10), ID_LENGTH);
}

/** New identity. On secure pages the private key is non-extractable: it can sign but never be read out. */
export async function createIdentity(): Promise<Identity> {
  const keys = await generateKeys();
  const publicJwk: PublicJwk = { kty: 'EC', crv: 'P-256', x: b64url(keys.x), y: b64url(keys.y) };
  return { userId: await userIdFromJwk(publicJwk), publicJwk, privateKey: keys.privateKey, publicKey: keys.publicKey, priv: keys.priv };
}

export async function sign(identity: Identity, data: string): Promise<string> {
  return b64url(await signBytes(identity, enc.encode(data)));
}

export async function verify(jwk: PublicJwk, data: string, signature: string): Promise<boolean> {
  try {
    return await verifyBytes(fromB64url(jwk.x), fromB64url(jwk.y), enc.encode(data), fromB64url(signature));
  } catch {
    return false;
  }
}

export function isPublicJwk(v: unknown): v is PublicJwk {
  const k = v as PublicJwk | null;
  const b64 = /^[A-Za-z0-9_-]{43}$/;
  return !!k && k.kty === 'EC' && k.crv === 'P-256' && b64.test(k.x) && b64.test(k.y);
}

/** Checks that a public key really belongs to the claimed user ID. */
export async function keyMatchesId(jwk: unknown, userId: UserId): Promise<boolean> {
  return isPublicJwk(jwk) && (await userIdFromJwk(jwk)) === userId;
}

export function signable(parts: unknown[]): string {
  return canonical(parts);
}
