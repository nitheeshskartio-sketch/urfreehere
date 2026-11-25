/**
 * Data channel protocol (ordered, reliable channel).
 *
 *  sender → receiver   manifest  { files }               list of files offered
 *  receiver → sender   accept | reject
 *  sender → receiver   file-start { id } · <binary chunks> · file-end { id }   (per file, in order)
 *  receiver → sender   ack { bytes }                     cumulative bytes written to storage
 *  receiver → sender   complete                          every file stored and verified
 *  either way          cancel
 *
 * Control messages are JSON strings; file data is sent as binary messages.
 */
import { inspectName, type FileWarning } from '../safety';

export const PROTOCOL_VERSION = 1;
export const MAX_FILES = 1000;

export interface FileMeta {
  id: number;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  /** Receiver-side only: safety warnings derived from the name and type. Never sent. */
  warnings?: FileWarning[];
}

export type RejectReason = 'declined' | 'too-large' | 'no-space';

export type ControlMessage =
  | { t: 'manifest'; v: number; files: FileMeta[] }
  | { t: 'accept' }
  | { t: 'reject'; reason?: RejectReason }
  | { t: 'file-start'; id: number }
  | { t: 'file-end'; id: number }
  | { t: 'ack'; bytes: number }
  | { t: 'complete' }
  | { t: 'cancel' };

export function encode(message: ControlMessage): string {
  return JSON.stringify(message);
}

const isUint = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * Makes a received name safe to save: no path separators, control or
 * invisible/direction-override characters, leading dots (hidden files),
 * trailing dots/spaces, or Windows reserved device names.
 */
export function sanitizeName(name: string): string {
  let cleaned = name
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\u061c\ufeff]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+/, '')
    .replace(/[\s.]+$/, '');
  if (WINDOWS_RESERVED.test(cleaned)) cleaned = `_${cleaned}`;
  if (cleaned.length > 200) {
    const dot = cleaned.lastIndexOf('.');
    const ext = dot > 0 && cleaned.length - dot <= 16 ? cleaned.slice(dot) : '';
    cleaned = cleaned.slice(0, 200 - ext.length) + ext;
  }
  return cleaned || 'file';
}

/** Accepts only well-formed MIME types. */
function sanitizeType(type: unknown): string {
  return typeof type === 'string' && type.length < 128 && /^[\w.+-]+\/[\w.+-]+$/.test(type) ? type.toLowerCase() : '';
}

export function decode(data: string): ControlMessage | null {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(data);
  } catch {
    return null;
  }
  if (!msg || typeof msg !== 'object') return null;

  switch (msg.t) {
    case 'manifest': {
      if (msg.v !== PROTOCOL_VERSION || !Array.isArray(msg.files)) return null;
      if (msg.files.length === 0 || msg.files.length > MAX_FILES) return null;
      const files: FileMeta[] = [];
      for (let i = 0; i < msg.files.length; i++) {
        const f = msg.files[i] as Record<string, unknown>;
        if (!f || f.id !== i || typeof f.name !== 'string' || f.name.length > 1024 || !isUint(f.size)) return null;
        const type = sanitizeType(f.type);
        files.push({
          id: i,
          name: sanitizeName(f.name),
          size: f.size,
          type,
          lastModified: isUint(f.lastModified) ? f.lastModified : Date.now(),
          // Checked on the raw name, before sanitizing removes the evidence.
          warnings: inspectName(f.name, type),
        });
      }
      return { t: 'manifest', v: PROTOCOL_VERSION, files };
    }
    case 'file-start':
    case 'file-end':
      return isUint(msg.id) ? { t: msg.t, id: msg.id } : null;
    case 'ack':
      return isUint(msg.bytes) ? { t: 'ack', bytes: msg.bytes } : null;
    case 'reject':
      return { t: 'reject', reason: msg.reason === 'too-large' || msg.reason === 'no-space' ? msg.reason : 'declined' };
    case 'accept':
    case 'complete':
    case 'cancel':
      return { t: msg.t };
    default:
      return null;
  }
}

export interface TransferProgress {
  /** Bytes confirmed per file, same order as the manifest. */
  fileBytes: number[];
  bytes: number;
  total: number;
  /** Bytes per second (moving average). */
  speed: number;
}
