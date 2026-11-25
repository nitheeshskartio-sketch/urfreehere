import { randomBytes, randomInt } from 'node:crypto';
import { CODE_ALPHABET, CODE_LENGTH } from './validate.js';

export type Role = 'host' | 'guest';

export interface Participant {
  token: string;
  socketId: string | null;
  /** When the signaling socket dropped; null while connected. */
  awaySince: number | null;
}

export interface Room {
  code: string;
  createdAt: number;
  expiresAt: number;
  host: Participant;
  guest: Participant | null;
}

export type JoinError = 'ROOM_NOT_FOUND' | 'ROOM_EXPIRED' | 'ROOM_FULL';

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

function generateToken(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * In-memory room registry. Rooms only hold signaling metadata (socket ids and
 * secret tokens) — never file names, sizes or content.
 */
export class RoomRegistry {
  private rooms = new Map<string, Room>();
  /** Recently expired codes, so joiners get "expired" rather than "not found". */
  private expired = new Map<string, number>();
  private bySocket = new Map<string, { code: string; role: Role }>();

  constructor(
    private readonly opts: { waitingTtlMs: number; pairedTtlMs: number; graceMs: number; maxRooms: number },
  ) {}

  get size() {
    return this.rooms.size;
  }

  create(socketId: string): Room | null {
    if (this.rooms.size >= this.opts.maxRooms) return null;
    let code = generateCode();
    while (this.rooms.has(code) || this.expired.has(code)) code = generateCode();

    const now = Date.now();
    const room: Room = {
      code,
      createdAt: now,
      expiresAt: now + this.opts.waitingTtlMs,
      host: { token: generateToken(), socketId, awaySince: null },
      guest: null,
    };
    this.rooms.set(code, room);
    this.bySocket.set(socketId, { code, role: 'host' });
    return room;
  }

  join(code: string, socketId: string): { room: Room } | { error: JoinError } {
    const room = this.rooms.get(code);
    if (!room) return { error: this.expired.has(code) ? 'ROOM_EXPIRED' : 'ROOM_NOT_FOUND' };
    if (room.expiresAt <= Date.now()) return { error: 'ROOM_EXPIRED' };
    // One receiver per room: once paired, nobody else can join.
    if (room.guest) return { error: 'ROOM_FULL' };

    room.guest = { token: generateToken(), socketId, awaySince: null };
    room.expiresAt = Date.now() + this.opts.pairedTtlMs;
    this.bySocket.set(socketId, { code, role: 'guest' });
    return { room };
  }

  /** Re-attaches a reconnected socket to its seat using the secret token. */
  resume(code: string, token: string, socketId: string): { room: Room; role: Role } | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    let role: Role | null = null;
    if (safeEqual(room.host.token, token)) role = 'host';
    else if (room.guest && safeEqual(room.guest.token, token)) role = 'guest';
    if (!role) return null;

    const seat = role === 'host' ? room.host : room.guest!;
    if (seat.socketId) this.bySocket.delete(seat.socketId);
    seat.socketId = socketId;
    seat.awaySince = null;
    this.bySocket.set(socketId, { code, role });
    return { room, role };
  }

  lookup(socketId: string): { room: Room; role: Role } | null {
    const ref = this.bySocket.get(socketId);
    if (!ref) return null;
    const room = this.rooms.get(ref.code);
    if (!room) {
      this.bySocket.delete(socketId);
      return null;
    }
    return { room, role: ref.role };
  }

  peerSocket(room: Room, role: Role): string | null {
    const other = role === 'host' ? room.guest : room.host;
    return other && !other.awaySince ? other.socketId : null;
  }

  /** Signaling socket dropped: keep the seat for the grace period. */
  markAway(socketId: string) {
    const ref = this.lookup(socketId);
    if (!ref) return;
    const seat = ref.role === 'host' ? ref.room.host : ref.room.guest;
    if (seat && seat.socketId === socketId) {
      seat.awaySince = Date.now();
      seat.socketId = null;
    }
    this.bySocket.delete(socketId);
  }

  /** Guest leaves: the seat frees up. Host leaves: room is removed. */
  leave(room: Room, role: Role) {
    if (role === 'guest' && room.guest) {
      if (room.guest.socketId) this.bySocket.delete(room.guest.socketId);
      room.guest = null;
      room.expiresAt = Math.min(room.expiresAt, Date.now() + this.opts.waitingTtlMs);
    } else {
      this.remove(room, false);
    }
  }

  remove(room: Room, expired: boolean) {
    if (room.host.socketId) this.bySocket.delete(room.host.socketId);
    if (room.guest?.socketId) this.bySocket.delete(room.guest.socketId);
    this.rooms.delete(room.code);
    if (expired) this.expired.set(room.code, Date.now());
  }

  /**
   * Periodic cleanup. Returns what happened so the caller can notify sockets.
   */
  sweep(): { expired: Room[]; abandoned: { room: Room; role: Role }[] } {
    const now = Date.now();
    const expired: Room[] = [];
    const abandoned: { room: Room; role: Role }[] = [];

    for (const room of this.rooms.values()) {
      if (room.expiresAt <= now) {
        expired.push(room);
        continue;
      }
      if (room.host.awaySince && now - room.host.awaySince > this.opts.graceMs) {
        abandoned.push({ room, role: 'host' });
      } else if (room.guest?.awaySince && now - room.guest.awaySince > this.opts.graceMs) {
        abandoned.push({ room, role: 'guest' });
      }
    }

    for (const room of expired) this.remove(room, true);
    for (const { room, role } of abandoned) this.leave(room, role);

    // Forget expired codes after 2 hours.
    for (const [code, at] of this.expired) if (now - at > 2 * 60 * 60 * 1000) this.expired.delete(code);

    return { expired, abandoned };
  }
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
