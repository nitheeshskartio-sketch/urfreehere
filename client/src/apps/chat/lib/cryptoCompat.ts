/**
 * Crypto that works everywhere.
 *
 * Browsers only expose Web Crypto (`crypto.subtle`) on secure origins: HTTPS
 * or localhost. When the app is opened over plain HTTP on a local network
 * (e.g. http://192.168.1.20:5173 during development), we fall back to the
 * audited pure-JS implementations from @noble. They are loaded only in that
 * case, so normal HTTPS visitors download nothing extra. Signatures are the
 * same format (P-256, SHA-256, raw r||s), so both sides interoperate.
 */
export const hasSubtle = typeof crypto !== 'undefined' && !!crypto.subtle;

type Noble = {
  p256: typeof import('@noble/curves/p256').p256;
  sha256: typeof import('@noble/hashes/sha256').sha256;
};
let noble: Promise<Noble> | null = null;

function loadNoble(): Promise<Noble> {
  noble ??= Promise.all([import('@noble/curves/p256'), import('@noble/hashes/sha256')]).then(([c, h]) => ({ p256: c.p256, sha256: h.sha256 }));
  return noble;
}

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  if (hasSubtle) return new Uint8Array(await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>));
  return (await loadNoble()).sha256(data);
}

export interface KeyMaterial {
  /** Web Crypto key (secure contexts); non-extractable. */
  privateKey?: CryptoKey;
  publicKey?: CryptoKey;
  /** Raw private key (fallback on insecure origins). */
  priv?: Uint8Array;
  x: Uint8Array;
  y: Uint8Array;
}

export async function generateKeys(): Promise<KeyMaterial> {
  if (hasSubtle) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
    return { privateKey: pair.privateKey, publicKey: pair.publicKey, x: raw.slice(1, 33), y: raw.slice(33, 65) };
  }
  const { p256 } = await loadNoble();
  const priv = p256.utils.randomPrivateKey();
  const pub = p256.getPublicKey(priv, false);
  return { priv, x: pub.slice(1, 33), y: pub.slice(33, 65) };
}

/**
 * Deterministic key pair from a login-code seed: the same code always gives
 * the same keys (and therefore the same user ID) on any device.
 */
export async function keysFromSeed(seed: Uint8Array): Promise<KeyMaterial> {
  const { p256 } = await loadNoble();
  const prefix = new TextEncoder().encode('urfree-chat-key-v1:');
  let priv: Uint8Array | null = null;
  for (let counter = 0; counter < 100 && !priv; counter++) {
    const input = new Uint8Array(prefix.length + seed.length + 1);
    input.set(prefix);
    input.set(seed, prefix.length);
    input[input.length - 1] = counter;
    const candidate = await sha256(input);
    if (p256.utils.isValidPrivateKey(candidate)) priv = candidate;
  }
  if (!priv) throw new Error('Could not derive a key from this code.');
  const pub = p256.getPublicKey(priv, false);
  const x = pub.slice(1, 33);
  const y = pub.slice(33, 65);
  if (hasSubtle) {
    const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    // Imported as non-extractable: it can sign but can't be read back out.
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      { kty: 'EC', crv: 'P-256', d: b64(priv), x: b64(x), y: b64(y), ext: false },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );
    return { privateKey, x, y };
  }
  return { priv, x, y };
}

/** ECDSA P-256 / SHA-256, raw 64-byte signature. */
export async function signBytes(keys: { privateKey?: CryptoKey; priv?: Uint8Array }, data: Uint8Array): Promise<Uint8Array> {
  if (keys.privateKey && hasSubtle) {
    return new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, data as Uint8Array<ArrayBuffer>));
  }
  if (!keys.priv) throw new Error('This identity can only sign on a secure (HTTPS) page.');
  const { p256 } = await loadNoble();
  return p256.sign(await sha256(data), keys.priv).toCompactRawBytes();
}

const imported = new Map<string, Promise<CryptoKey>>();

export async function verifyBytes(x: Uint8Array, y: Uint8Array, data: Uint8Array, sig: Uint8Array): Promise<boolean> {
  if (sig.length !== 64) return false;
  try {
    if (hasSubtle) {
      const raw = new Uint8Array(65);
      raw[0] = 4;
      raw.set(x, 1);
      raw.set(y, 33);
      const k = Array.from(raw).join(',');
      let key = imported.get(k);
      if (!key) imported.set(k, (key = crypto.subtle.importKey('raw', raw, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])));
      return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await key, sig as Uint8Array<ArrayBuffer>, data as Uint8Array<ArrayBuffer>);
    }
    const { p256 } = await loadNoble();
    const pub = new Uint8Array(65);
    pub[0] = 4;
    pub.set(x, 1);
    pub.set(y, 33);
    // Web Crypto may produce high-S signatures; accept both forms like Web Crypto does.
    return p256.verify(sig, await sha256(data), pub, { lowS: false, prehash: false, format: 'compact' });
  } catch {
    return false;
  }
}
