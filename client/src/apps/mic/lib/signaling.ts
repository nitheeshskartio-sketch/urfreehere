import { io, type Socket } from 'socket.io-client';

export interface IceConfig {
  iceServers: RTCIceServer[];
  iceTransportPolicy: RTCIceTransportPolicy;
}

export interface SignalData {
  kind: 'offer' | 'answer' | 'ice';
  [key: string]: unknown;
}

export type RoomStatus = 'ACTIVE' | 'LOCKED' | 'FULL' | 'CLOSED' | 'EXPIRED';

export interface RoomInfo {
  code: string;
  name: string;
  description: string;
  maxParticipants: number;
  participantCount: number;
  visibility: 'private' | 'public';
  hasPassword: boolean;
  locked: boolean;
  status: RoomStatus;
  expiresAt: number | null;
  hostPid?: string | null;
  createdAt: number;
}

export interface ParticipantInfo {
  pid: string;
  name: string;
  avatar: string | null;
  muted: boolean;
  hostMuted: boolean;
  isHost: boolean;
  status: 'connected' | 'reconnecting';
  joinedAt: number;
}

export interface MicConfig {
  globalMaxRoomParticipants: number;
  defaultRoomParticipants: number;
  participantChoices: number[];
  allowPublicRooms: boolean;
  allowRoomPassword: boolean;
  defaultRoomExpiryMinutes: number;
  expiryChoices: (number | null)[];
  allowHostRoomLock: boolean;
}

const BASE: string = import.meta.env.VITE_SIGNALING_URL || '';
const TIMEOUT = 10_000;

export class MicError extends Error {
  constructor(
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export function connectMic(): Socket {
  // Its own connection: sharing the chat's (which starts with autoConnect off) would never connect.
  return io(`${BASE}/mic`, { forceNew: true, reconnectionDelay: 800, reconnectionDelayMax: 5000, timeout: TIMEOUT });
}

export function request<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.timeout(TIMEOUT).emit(event, payload, (err: Error | null, res: (T & { ok: true }) | { ok: false; error: string }) => {
      if (err) return reject(new MicError('UNREACHABLE'));
      if (!res.ok) return reject(new MicError(res.error, res as Record<string, unknown>));
      resolve(res as T);
    });
  });
}

export async function fetchConfig(): Promise<MicConfig> {
  const res = await fetch(`${BASE}/api/mic/config`);
  if (!res.ok) throw new MicError('UNREACHABLE');
  return res.json();
}

export async function fetchRoom(code: string): Promise<RoomInfo> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/mic/rooms/${encodeURIComponent(code)}`);
  } catch {
    throw new MicError('UNREACHABLE');
  }
  if (!res.ok) throw new MicError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'UNREACHABLE');
  return res.json();
}

/** "8k92px", "MIC 8K92PX" or an invitation URL → "MIC-8K92PX". */
export function normalizeRoomCode(input: string): string | null {
  const fromUrl = input.match(/\/room\/([A-Za-z0-9-]+)/);
  let raw = (fromUrl ? fromUrl[1] : input).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (raw.startsWith('MIC') && raw.length === 9) raw = raw.slice(3);
  if (!/^[2-9A-HJ-KMNP-Z]{6}$/.test(raw)) return null;
  return `MIC-${raw}`;
}

export const roomLink = (code: string) => `${window.location.origin}/room/${code}`;

export const ERROR_COPY: Record<string, { title: string; message: string }> = {
  INVALID_CODE: { title: 'Check the room code', message: 'Room codes look like MIC-8K92PX.' },
  NOT_FOUND: { title: 'Room not found', message: 'No room uses this code. Check it, or ask the host for a new invitation.' },
  EXPIRED: { title: 'This room has expired', message: 'Ask the host to create a new room.' },
  CLOSED: { title: 'This room was closed', message: 'The host closed this room, or everyone left.' },
  REVOKED: { title: 'Invitation no longer valid', message: 'The host changed the room code. Ask them for the new link.' },
  FULL: { title: 'Room is full', message: 'This room is currently full. Please try again later.' },
  LOCKED: { title: 'Room is locked', message: "The host has locked this room, so new people can't join right now." },
  PASSWORD_REQUIRED: { title: 'Password required', message: 'Enter the room password to join.' },
  WRONG_PASSWORD: { title: 'Wrong password', message: "That password isn't right. Check it with the host." },
  BANNED: { title: "You can't rejoin yet", message: 'The host removed you from this room. You can try again later.' },
  RATE_LIMITED: { title: 'Too many attempts', message: 'Please wait a few minutes and try again.' },
  UNREACHABLE: { title: "Can't reach the call service", message: 'Check your internet connection and try again.' },
  SERVER_BUSY: { title: 'Calls are busy', message: 'Please try again in a moment.' },
  DISABLED: { title: 'New calls are paused', message: 'The site admin has paused new voice calls. Calls already going on still work. Try again later.' },
  INVALID_LIMIT: { title: 'Participant limit not allowed', message: 'Choose a smaller participant limit.' },
};
