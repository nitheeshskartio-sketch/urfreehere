import { randomInt } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 8;

export interface InvitePreview {
  name: string;
  description: string;
  image: string | null;
  memberCount: number;
}

export interface Invite {
  token: string;
  code: string;
  groupId: string;
  creatorId: string;
  /** Admins at creation time; any of them may revoke or refresh the preview. */
  managers: string[];
  /** Invite object signed by an admin; group members verify it before adding anyone. */
  signedInvite: Record<string, unknown>;
  preview: InvitePreview;
  createdAt: number;
  expiresAt: number | null;
  maxUses: number | null;
  uses: number;
  /** People who used this invite (retries by the same person don't count twice). */
  joiners?: string[];
  revoked: boolean;
}

export interface JoinRequest {
  requestId: string;
  groupId: string;
  token: string;
  joinerId: string;
  /** Join operation pre-signed by the joiner; members validate and add it to the group log. */
  joinEvent: Record<string, unknown>;
  profile: Record<string, unknown>;
  createdAt: number;
}

export type InviteStatus = 'active' | 'expired' | 'revoked' | 'used-up';

const PENDING_TTL = 7 * 24 * 60 * 60 * 1000;

/**
 * Invitation metadata and pending join requests. Stored in memory and
 * snapshotted to a small JSON file so invites survive restarts. No messages,
 * member lists or files are stored here.
 */
export class InviteStore {
  private byToken = new Map<string, Invite>();
  private byCode = new Map<string, string>();
  private pending = new Map<string, JoinRequest[]>(); // groupId -> requests
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(private readonly file: string | null) {
    this.load();
  }

  private load() {
    if (!this.file || !existsSync(this.file)) return;
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8')) as { invites?: Invite[]; pending?: JoinRequest[] };
      for (const inv of data.invites ?? []) {
        this.byToken.set(inv.token, inv);
        this.byCode.set(inv.code, inv.token);
      }
      for (const req of data.pending ?? []) this.addPending(req, false);
    } catch (err) {
      console.warn('[chat] could not read invite store:', (err as Error).message);
    }
  }

  private scheduleSave() {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try {
        mkdirSync(dirname(this.file!), { recursive: true });
        const tmp = `${this.file}.tmp`;
        writeFileSync(tmp, JSON.stringify({ invites: [...this.byToken.values()], pending: [...this.pending.values()].flat() }));
        renameSync(tmp, this.file!);
      } catch (err) {
        console.warn('[chat] could not save invite store:', (err as Error).message);
      }
    }, 500);
    this.saveTimer.unref();
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.byCode.has(code)) return code;
    }
  }

  create(input: Omit<Invite, 'code' | 'uses' | 'revoked' | 'createdAt'>): Invite | null {
    if (this.byToken.has(input.token)) return null;
    const invite: Invite = { ...input, code: this.newCode(), uses: 0, revoked: false, createdAt: Date.now() };
    this.byToken.set(invite.token, invite);
    this.byCode.set(invite.code, invite.token);
    this.scheduleSave();
    return invite;
  }

  /** Looks up by token or by short code. */
  count() {
    return this.byToken.size;
  }

  find(key: string): Invite | null {
    const token = this.byCode.get(key.toUpperCase().replace(/[^A-Z0-9]/g, '')) ?? key;
    return this.byToken.get(token) ?? null;
  }

  status(inv: Invite): InviteStatus {
    if (inv.revoked) return 'revoked';
    if (inv.expiresAt && inv.expiresAt <= Date.now()) return 'expired';
    if (inv.maxUses && inv.uses >= inv.maxUses) return 'used-up';
    return 'active';
  }

  revoke(inv: Invite) {
    inv.revoked = true;
    this.scheduleSave();
  }

  updatePreview(inv: Invite, preview: InvitePreview) {
    inv.preview = preview;
    this.scheduleSave();
  }

  /** Counts a use once per person. */
  consume(inv: Invite, userId: string) {
    inv.joiners ??= [];
    if (inv.joiners.includes(userId)) return;
    inv.joiners.push(userId);
    inv.uses += 1;
    this.scheduleSave();
  }

  hasJoined(inv: Invite, userId: string) {
    return inv.joiners?.includes(userId) ?? false;
  }

  addPending(req: JoinRequest, save = true) {
    const list = (this.pending.get(req.groupId) ?? []).filter((r) => r.joinerId !== req.joinerId);
    list.push(req);
    this.pending.set(req.groupId, list.slice(-50));
    if (save) this.scheduleSave();
  }

  pendingFor(groupId: string): JoinRequest[] {
    return this.pending.get(groupId) ?? [];
  }

  resolvePending(groupId: string, requestId: string): JoinRequest | null {
    const list = this.pending.get(groupId) ?? [];
    const found = list.find((r) => r.requestId === requestId) ?? null;
    if (found) {
      const rest = list.filter((r) => r !== found);
      if (rest.length) this.pending.set(groupId, rest);
      else this.pending.delete(groupId);
      this.scheduleSave();
    }
    return found;
  }

  sweep() {
    const now = Date.now();
    let changed = false;
    for (const [token, inv] of this.byToken) {
      // Keep dead invites for a day so visitors get a clear "expired/revoked" message.
      const deadSince = inv.revoked ? inv.createdAt : inv.expiresAt;
      if (deadSince && (inv.revoked || inv.expiresAt! <= now) && now - deadSince > 24 * 60 * 60 * 1000) {
        this.byToken.delete(token);
        this.byCode.delete(inv.code);
        changed = true;
      }
    }
    for (const [groupId, list] of this.pending) {
      const rest = list.filter((r) => now - r.createdAt < PENDING_TTL);
      if (rest.length !== list.length) {
        changed = true;
        if (rest.length) this.pending.set(groupId, rest);
        else this.pending.delete(groupId);
      }
    }
    if (changed) this.scheduleSave();
  }
}
