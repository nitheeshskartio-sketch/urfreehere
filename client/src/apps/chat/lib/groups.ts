import { keyMatchesId, signable, verify, isPublicJwk } from './identity';
import type { ChatEvent, PublicJwk, UserId } from './types';

/** Small groups: every member connects directly to every other member (mesh). */
export const MAX_GROUP_MEMBERS = 16;

export interface SignedInvite {
  v: 1;
  groupId: string;
  token: string;
  by: UserId;
  expiresAt: number | null;
  maxUses: number | null;
  sig: string;
}

export function inviteSignable(inv: Omit<SignedInvite, 'sig'>): string {
  return signable(['urfree-chat-invite', 1, inv.groupId, inv.token, inv.by, inv.expiresAt, inv.maxUses]);
}

export interface GroupMember {
  userId: UserId;
  pub: PublicJwk;
  role: 'admin' | 'member';
  joinedAt: number;
}

export interface FormerMember {
  userId: UserId;
  pub: PublicJwk;
  leftAt: number;
  reason: 'left' | 'removed';
}

export interface GroupState {
  groupId: string;
  valid: boolean;
  name: string;
  description: string;
  image: string | null;
  createdBy: UserId;
  createdAt: number;
  members: Map<UserId, GroupMember>;
  former: Map<UserId, FormerMember>;
  revoked: Set<string>;
  deleted: boolean;
  deletedAt?: number;
  updatedAt: number;
}

/**
 * Group operations ("op" events in the group conversation):
 *   create  { name, description, image, pub }                 author becomes admin
 *   add     { userId, pub }                                   admin only
 *   join    { invite: SignedInvite, pub }                     author is the joiner; invite signed by an admin
 *   remove  { userId }                                        admin only, not the creator
 *   leave   {}                                                author leaves
 *   update  { name?, description?, image? }                   admin only
 *   role    { userId, role }                                  admin only
 *   revoke  { token }                                         admin only: invite no longer accepted
 *   delete  {}                                                admin only: group closed for everyone
 */
export type GroupOp = 'create' | 'add' | 'join' | 'remove' | 'leave' | 'update' | 'role' | 'revoke' | 'delete';

export function emptyGroup(groupId: string): GroupState {
  return {
    groupId,
    valid: false,
    name: '',
    description: '',
    image: null,
    createdBy: '',
    createdAt: 0,
    members: new Map(),
    former: new Map(),
    revoked: new Set(),
    deleted: false,
    updatedAt: 0,
  };
}

export function orderOps(a: ChatEvent, b: ChatEvent): number {
  return a.ts - b.ts || (a.author < b.author ? -1 : a.author > b.author ? 1 : a.seq - b.seq);
}

const inviteChecks = new Map<string, Promise<boolean>>();

async function inviteSignatureOk(inv: SignedInvite, signerKey: PublicJwk): Promise<boolean> {
  const key = `${inv.sig}|${signerKey.x}`;
  let p = inviteChecks.get(key);
  if (!p) {
    p = verify(signerKey, inviteSignable(inv), inv.sig);
    inviteChecks.set(key, p);
  }
  return p;
}

export function isSignedInvite(v: unknown): v is SignedInvite {
  const i = v as SignedInvite | null;
  return (
    !!i &&
    i.v === 1 &&
    typeof i.groupId === 'string' &&
    typeof i.token === 'string' &&
    typeof i.by === 'string' &&
    typeof i.sig === 'string' &&
    (i.expiresAt === null || typeof i.expiresAt === 'number') &&
    (i.maxUses === null || typeof i.maxUses === 'number')
  );
}

/** Validates an invite against a group state (used for join ops and for join requests). */
export async function checkInvite(state: GroupState, inv: unknown, at: number): Promise<string | null> {
  if (!isSignedInvite(inv) || inv.groupId !== state.groupId) return 'Invalid invitation.';
  if (state.revoked.has(inv.token)) return 'This invitation was revoked.';
  if (inv.expiresAt !== null && inv.expiresAt < at) return 'This invitation has expired.';
  const signer = state.members.get(inv.by) ?? state.former.get(inv.by);
  if (!signer) return 'Invitation signed by an unknown member.';
  if (!(await inviteSignatureOk(inv, signer.pub))) return 'Invitation signature is invalid.';
  const current = state.members.get(inv.by);
  if (!current || current.role !== 'admin') return 'The invitation was created by someone who is no longer an admin.';
  return null;
}

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.length <= max ? v : null;
}

/**
 * Replays the operation log into the current group state. Every op is
 * checked against the state at that point, so an op that wasn't allowed when
 * it was made (e.g. a non-admin removing someone) has no effect.
 */
export async function deriveGroup(groupId: string, ops: ChatEvent[]): Promise<GroupState> {
  const st = emptyGroup(groupId);
  const sorted = [...ops].sort(orderOps);

  for (const e of sorted) {
    const b = e.body as Record<string, unknown>;
    const op = b.op as GroupOp;
    const actor = st.members.get(e.author);
    const isAdmin = actor?.role === 'admin';
    if (st.deleted) break;

    if (op === 'create') {
      if (st.valid || e.seq !== 1 || !isPublicJwk(b.pub) || !(await keyMatchesId(b.pub, e.author))) continue;
      st.valid = true;
      st.name = str(b.name, 80) ?? 'Group';
      st.description = str(b.description, 500) ?? '';
      st.image = typeof b.image === 'string' && b.image.startsWith('data:image/') ? b.image : null;
      st.createdBy = e.author;
      st.createdAt = e.ts;
      st.members.set(e.author, { userId: e.author, pub: b.pub, role: 'admin', joinedAt: e.ts });
      st.updatedAt = e.ts;
      continue;
    }
    if (!st.valid) continue;

    switch (op) {
      case 'add': {
        const userId = b.userId as string;
        if (!isAdmin || st.members.has(userId) || st.members.size >= MAX_GROUP_MEMBERS) break;
        if (!isPublicJwk(b.pub) || !(await keyMatchesId(b.pub, userId))) break;
        st.members.set(userId, { userId, pub: b.pub, role: 'member', joinedAt: e.ts });
        st.former.delete(userId);
        break;
      }
      case 'join': {
        if (st.members.has(e.author) || st.members.size >= MAX_GROUP_MEMBERS) break;
        if (!isPublicJwk(b.pub) || !(await keyMatchesId(b.pub, e.author))) break;
        if (await checkInvite(st, b.invite, e.ts)) break;
        st.members.set(e.author, { userId: e.author, pub: b.pub, role: 'member', joinedAt: e.ts });
        st.former.delete(e.author);
        break;
      }
      case 'remove': {
        const target = st.members.get(b.userId as string);
        if (!isAdmin || !target || target.userId === st.createdBy) break;
        st.members.delete(target.userId);
        st.former.set(target.userId, { userId: target.userId, pub: target.pub, leftAt: e.ts, reason: 'removed' });
        break;
      }
      case 'leave': {
        if (!actor) break;
        st.members.delete(e.author);
        st.former.set(e.author, { userId: e.author, pub: actor.pub, leftAt: e.ts, reason: 'left' });
        // If the last admin leaves, the longest-standing member becomes admin.
        if (![...st.members.values()].some((m) => m.role === 'admin')) {
          const next = [...st.members.values()].sort((a, c) => a.joinedAt - c.joinedAt)[0];
          if (next) next.role = 'admin';
        }
        break;
      }
      case 'update': {
        if (!isAdmin) break;
        const name = str(b.name, 80);
        const description = str(b.description, 500);
        if (name !== null && name.trim()) st.name = name;
        if (description !== null) st.description = description;
        if (b.image === null) st.image = null;
        else if (typeof b.image === 'string' && b.image.startsWith('data:image/')) st.image = b.image;
        break;
      }
      case 'role': {
        const target = st.members.get(b.userId as string);
        if (!isAdmin || !target || (b.role !== 'admin' && b.role !== 'member')) break;
        if (target.userId === st.createdBy && b.role === 'member') break;
        target.role = b.role;
        break;
      }
      case 'revoke':
        if (isAdmin && typeof b.token === 'string') st.revoked.add(b.token);
        break;
      case 'delete':
        if (isAdmin) {
          st.deleted = true;
          st.deletedAt = e.ts;
        }
        break;
    }
    st.updatedAt = e.ts;
  }
  return st;
}

/** Public key that may author events in this group at time `ts`, if any. */
export function authorKey(state: GroupState, author: UserId, ts: number): PublicJwk | null {
  const m = state.members.get(author);
  if (m) return m.pub;
  const f = state.former.get(author);
  // Former members' old messages stay valid; nothing they send after leaving is accepted.
  if (f && ts <= f.leftAt) return f.pub;
  return null;
}
