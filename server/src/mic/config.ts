/**
 * Mic global configuration. Every value can be overridden with an
 * environment variable; the server enforces these limits on every request.
 */
const env = process.env;

function int(name: string, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const v = Number.parseInt(env[name] ?? '', 10);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const v = env[name];
  if (v === undefined || v === '') return fallback;
  return v === 'true' || v === '1';
}

/** Choices offered in the "Maximum participants" selector (filtered by the global max). */
export const PARTICIPANT_CHOICES = [2, 4, 6, 8, 10, 15, 20, 25, 30, 40, 50];

/** Choices for room expiry, in minutes. null = no expiry (kept while the server runs). */
export const EXPIRY_CHOICES: (number | null)[] = [30, 60, 120, 240, 480, 1440, null];

const globalMax = int('MIC_GLOBAL_MAX_ROOM_PARTICIPANTS', 20, 2, 50);

export const micConfig = {
  globalMaxRoomParticipants: globalMax,
  defaultRoomParticipants: Math.min(globalMax, int('MIC_DEFAULT_ROOM_PARTICIPANTS', 6, 2, 50)),
  allowPublicRooms: bool('MIC_ALLOW_PUBLIC_ROOMS', false),
  allowRoomPassword: bool('MIC_ALLOW_ROOM_PASSWORD', true),
  defaultRoomExpiryMinutes: int('MIC_DEFAULT_ROOM_EXPIRY_MINUTES', 120, 0, 7 * 24 * 60),
  allowNoExpiry: bool('MIC_ALLOW_NO_EXPIRY', true),
  allowHostRoomLock: bool('MIC_ALLOW_HOST_ROOM_LOCK', true),
  /** Close a room this long after the last person leaves. */
  emptyRoomGraceSeconds: int('MIC_EMPTY_ROOM_GRACE_SECONDS', 600, 0),
  /** Rooms without expiry are removed after being empty this long. */
  persistentRoomIdleDays: int('MIC_PERSISTENT_ROOM_IDLE_DAYS', 7, 1),
  /** How long a dropped participant keeps their seat while reconnecting. */
  reconnectGraceSeconds: int('MIC_RECONNECT_GRACE_SECONDS', 30, 5),
  /** Temporary ban after a host removes someone. */
  removalBanMinutes: int('MIC_REMOVAL_BAN_MINUTES', 10, 0),
  maxRooms: int('MIC_MAX_ROOMS', 5000, 1),
};

/** What the browser is told about the configuration. */
export function publicMicConfig() {
  const c = micConfig;
  return {
    globalMaxRoomParticipants: c.globalMaxRoomParticipants,
    defaultRoomParticipants: c.defaultRoomParticipants,
    participantChoices: PARTICIPANT_CHOICES.filter((n) => n <= c.globalMaxRoomParticipants),
    allowPublicRooms: c.allowPublicRooms,
    allowRoomPassword: c.allowRoomPassword,
    defaultRoomExpiryMinutes: c.defaultRoomExpiryMinutes,
    expiryChoices: EXPIRY_CHOICES.filter((m) => m !== null || c.allowNoExpiry),
    allowHostRoomLock: c.allowHostRoomLock,
  };
}
