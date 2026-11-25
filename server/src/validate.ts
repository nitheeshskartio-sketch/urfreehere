/** Unambiguous alphabet: no 0/O, 1/I/L. 31 symbols, 8 chars ≈ 8.5e11 codes. */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 8;
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);
const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;

export function normalizeCode(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 32) return null;
  const code = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return CODE_RE.test(code) ? code : null;
}

export function isToken(input: unknown): input is string {
  return typeof input === 'string' && TOKEN_RE.test(input);
}

export type SignalMessage =
  | { kind: 'offer' | 'answer'; sdp: string }
  | {
      kind: 'ice';
      candidate: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null; usernameFragment?: string | null };
    }
  | { kind: 'ice-end' };

const MAX_SDP = 32 * 1024;
const MAX_CANDIDATE = 1024;

function optString(v: unknown, max: number): v is string | null | undefined {
  return v === null || v === undefined || (typeof v === 'string' && v.length <= max);
}

/** Strict structural validation; anything unexpected is dropped, never relayed. */
export function parseSignal(input: unknown): SignalMessage | null {
  if (!input || typeof input !== 'object') return null;
  const msg = input as Record<string, unknown>;

  switch (msg.kind) {
    case 'offer':
    case 'answer':
      if (typeof msg.sdp !== 'string' || msg.sdp.length === 0 || msg.sdp.length > MAX_SDP) return null;
      if (!msg.sdp.startsWith('v=0')) return null;
      return { kind: msg.kind, sdp: msg.sdp };

    case 'ice': {
      const c = msg.candidate as Record<string, unknown> | undefined;
      if (!c || typeof c !== 'object') return null;
      if (typeof c.candidate !== 'string' || c.candidate.length > MAX_CANDIDATE) return null;
      if (!optString(c.sdpMid, 64) || !optString(c.usernameFragment, 256)) return null;
      const idx = c.sdpMLineIndex;
      if (!(idx === null || idx === undefined || (Number.isInteger(idx) && (idx as number) >= 0 && (idx as number) < 64))) return null;
      return {
        kind: 'ice',
        candidate: {
          candidate: c.candidate,
          sdpMid: (c.sdpMid as string | null | undefined) ?? null,
          sdpMLineIndex: (idx as number | null | undefined) ?? null,
          usernameFragment: (c.usernameFragment as string | null | undefined) ?? null,
        },
      };
    }

    case 'ice-end':
      return { kind: 'ice-end' };

    default:
      return null;
  }
}
