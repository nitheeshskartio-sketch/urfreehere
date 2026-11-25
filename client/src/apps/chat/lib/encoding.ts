export const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ID_LENGTH = 16;

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function base32(bytes: Uint8Array, length: number): string {
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

export function randomId(bytes = 16): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Deterministic JSON (sorted object keys) so signatures survive re-serialisation. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(',')}}`;
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const { sha256 } = await import('./cryptoCompat');
  const digest = await sha256(new Uint8Array(data));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** "K7MPQ2XDABCD2345" -> "K7MP-Q2XD-ABCD-2345" */
export function formatUserId(id: string): string {
  return id.match(/.{1,4}/g)?.join('-') ?? id;
}

export function parseUserId(input: string): string | null {
  const fromLink = input.match(/\/chat\/u\/([A-Za-z0-9-]+)/);
  const raw = (fromLink ? fromLink[1] : input).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (raw.length !== ID_LENGTH) return null;
  for (const ch of raw) if (!ID_ALPHABET.includes(ch)) return null;
  return raw;
}
