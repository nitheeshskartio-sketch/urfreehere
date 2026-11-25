import { keysFromSeed, sha256, signBytes, verifyBytes } from './cryptoCompat';
import { b64url, base32, base32Decode, canonical, fromB64url, ID_ALPHABET, ID_LENGTH } from './encoding';
import type { PublicJwk, UserId } from './types';

export interface Identity {
  userId: UserId;
  publicJwk: PublicJwk;
  /** Web Crypto key (non-extractable) when created on a secure page. */
  privateKey?: CryptoKey;
  publicKey?: CryptoKey;
  /** Raw key when created on a plain-HTTP page (local network development). */
  priv?: Uint8Array;
  /** Secret login code the keys are derived from (absent for identities created before login codes). */
  loginCode?: string;
}

// ---- login codes -------------------------------------------------------------
// 15 random bytes = 24 base32 characters, plus 1 check character: 25 characters,
// shown as XXXXX-XXXXX-XXXXX-XXXXX-XXXXX.

async function checkChar(body: string): Promise<string> {
  const h = await sha256(enc.encode(`urfree-login:${body}`));
  return ID_ALPHABET[h[0] & 31];
}

export async function generateLoginCode(): Promise<string> {
  const body = base32(crypto.getRandomValues(new Uint8Array(15)), 24);
  return body + (await checkChar(body));
}

export function formatLoginCode(code: string): string {
  return code.match(/.{1,5}/g)?.join('-') ?? code;
}

/** Normalises user input; returns null if the code is malformed or mistyped (check character). */
export async function normalizeLoginCode(input: string): Promise<string | null> {
  const code = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 25 || [...code].some((c) => !ID_ALPHABET.includes(c))) return null;
  return (await checkChar(code.slice(0, 24))) === code[24] ? code : null;
}

/** Recreates the identity that belongs to a login code. */
export async function identityFromCode(code: string): Promise<Identity> {
  const seed = base32Decode(code.slice(0, 24))!;
  const keys = await keysFromSeed(seed);
  const publicJwk: PublicJwk = { kty: 'EC', crv: 'P-256', x: b64url(keys.x), y: b64url(keys.y) };
  return { userId: await userIdFromJwk(publicJwk), publicJwk, privateKey: keys.privateKey, priv: keys.priv, loginCode: code };
}

const enc = new TextEncoder();

export async function userIdFromJwk(jwk: PublicJwk): Promise<UserId> {
  const digest = await sha256(enc.encode(`${jwk.crv}:${jwk.x}:${jwk.y}`));
  return base32(digest.subarray(0, 10), ID_LENGTH);
}

/** New identity with a fresh login code. */
export async function createIdentity(): Promise<Identity> {
  return identityFromCode(await generateLoginCode());
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
