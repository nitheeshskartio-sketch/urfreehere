import { MongoClient, type Collection } from 'mongodb';
import type { PublicJwk } from './identity.js';

/**
 * Humble accounts in MongoDB: profile and basic details only.
 * Messages, chat history and files are never stored here.
 *
 * Inactive accounts are removed by MongoDB itself through a TTL index on
 * `lastActiveAt`: once an account hasn't been active for `inactiveDays`,
 * MongoDB deletes the document (its background task runs about once a minute).
 */
export interface AccountDoc {
  _id: string; // user ID (derived from the public key)
  publicKey: PublicJwk;
  name: string;
  status: string;
  avatar: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastActiveAt: Date;
  /**
   * The one device (browser) signed in to this account. Signing in with the
   * login code elsewhere replaces it; the old device then can't reconnect.
   * Never shared with other users.
   */
  deviceId?: string;
  /**
   * Who this account chats with: contact IDs and group IDs with their member
   * IDs. Lets a new device rebuild the chat list. Never message content, and
   * never shared with other users.
   */
  links?: AccountLinks;
  /** Set by the admin: likes and dislikes this person received before this time no longer count. */
  meterResetAt?: Date;
  /** Listed in other people's "People on Humble" suggestions. Missing means yes. */
  discoverable?: boolean;
}

export interface AccountLinks {
  contacts: { id: string; blocked: boolean }[];
  groups: { id: string; members: string[] }[];
}

export interface PublicProfile {
  userId: string;
  publicKey: PublicJwk;
  name: string;
  status: string;
  avatar: string | null;
  updatedAt: number;
  /** Likes and dislikes given to this person before this time don't count (admin reset). */
  meterResetAt?: number;
}

export interface ProfileInput {
  name: string;
  status: string;
  avatar: string | null;
}

/** Validates a profile sent by a client. Returns null when it's not acceptable. */
export function parseProfile(v: unknown): ProfileInput | null {
  const p = v as Record<string, unknown> | null;
  if (!p || typeof p.name !== 'string') return null;
  const name = p.name.trim().slice(0, 60);
  if (!name) return null;
  const status = typeof p.status === 'string' ? p.status.trim().slice(0, 140) : '';
  const a = p.avatar;
  const avatar =
    typeof a === 'string' && ((a.startsWith('data:image/') && a.length <= 60_000) || /^(ill|gen):[a-z0-9-]{1,40}$/i.test(a)) ? a : null;
  return { name, status, avatar };
}

export function toPublic(doc: AccountDoc): PublicProfile {
  return {
    userId: doc._id,
    publicKey: doc.publicKey,
    name: doc.name,
    status: doc.status,
    avatar: doc.avatar,
    updatedAt: doc.updatedAt.getTime(),
    ...(doc.meterResetAt ? { meterResetAt: doc.meterResetAt.getTime() } : {}),
  };
}

export class AccountStore {
  private constructor(
    private readonly client: MongoClient,
    private readonly col: Collection<AccountDoc>,
  ) {}

  static async connect(uri: string, dbName: string, inactiveDays: number): Promise<AccountStore> {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000, appName: 'urfreehere' });
    await client.connect();
    const col = client.db(dbName).collection<AccountDoc>('chat_accounts');
    const store = new AccountStore(client, col);
    await store.ensureTtl(dbName, inactiveDays);
    return store;
  }

  /** Creates the TTL index, or updates its expiry if the setting changed. */
  private async ensureTtl(dbName: string, inactiveDays: number) {
    const expireAfterSeconds = Math.round(inactiveDays * 24 * 60 * 60);
    try {
      await this.col.createIndex({ lastActiveAt: 1 }, { name: 'inactive_ttl', expireAfterSeconds });
    } catch (err) {
      const code = (err as { codeName?: string }).codeName;
      if (code !== 'IndexOptionsConflict' && code !== 'IndexKeySpecsConflict') throw err;
      await this.client.db(dbName).command({
        collMod: 'chat_accounts',
        index: { name: 'inactive_ttl', expireAfterSeconds },
      });
    }
  }

  get(userId: string): Promise<AccountDoc | null> {
    return this.col.findOne({ _id: userId });
  }

  /** Creates the account, or (re)activates it with the given profile if it already exists. */
  async upsert(userId: string, publicKey: PublicJwk, profile: ProfileInput): Promise<AccountDoc> {
    const now = new Date();
    const doc = await this.col.findOneAndUpdate(
      { _id: userId },
      {
        $set: { ...profile, publicKey, updatedAt: now, lastActiveAt: now },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true, returnDocument: 'after' },
    );
    return doc!;
  }

  async setLinks(userId: string, links: AccountLinks) {
    await this.col.updateOne({ _id: userId }, { $set: { links } });
  }

  async setDevice(userId: string, deviceId: string) {
    await this.col.updateOne({ _id: userId }, { $set: { deviceId } });
  }

  async updateProfile(userId: string, profile: ProfileInput): Promise<AccountDoc | null> {
    const now = new Date();
    return this.col.findOneAndUpdate({ _id: userId }, { $set: { ...profile, updatedAt: now, lastActiveAt: now } }, { returnDocument: 'after' });
  }

  /** Marks accounts as active now, which pushes back their automatic removal. */
  async touch(userIds: string[]) {
    if (!userIds.length) return;
    await this.col.updateMany({ _id: { $in: userIds } }, { $set: { lastActiveAt: new Date() } });
  }

  /**
   * People to suggest in "New chat": recently active, discoverable accounts,
   * optionally matching a name, leaving out the given IDs.
   */
  suggest(exclude: string[], query: string, limit = 30): Promise<AccountDoc[]> {
    const filter: Record<string, unknown> = { _id: { $nin: exclude }, discoverable: { $ne: false } };
    const q = query.trim().slice(0, 60);
    if (q) filter.name = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    return this.col.find(filter).sort({ lastActiveAt: -1 }).limit(limit).toArray();
  }

  async setDiscoverable(userId: string, on: boolean) {
    await this.col.updateOne({ _id: userId }, { $set: { discoverable: on } });
  }

  lookup(userIds: string[]): Promise<AccountDoc[]> {
    return this.col.find({ _id: { $in: userIds } }).limit(100).toArray();
  }

  // ---------------------------------------------------------------- admin

  private get db() {
    return this.client.db(this.col.dbName);
  }

  private get bans() {
    return this.db.collection<{ _id: string; reason: string; name: string | null; at: Date }>('chat_bans');
  }

  private get site() {
    return this.db.collection<{ _id: string; value: unknown }>('site_settings');
  }

  /** Accounts for the admin console, newest activity first. Searches name, status and ID. */
  async list(q: string, skip: number, limit: number, sort: 'active' | 'created' | 'name') {
    const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter = q ? { $or: [{ name: { $regex: esc, $options: 'i' } }, { status: { $regex: esc, $options: 'i' } }, { _id: { $regex: esc.replace(/-/g, ''), $options: 'i' } }] } : {};
    const order: Record<string, 1 | -1> = sort === 'name' ? { name: 1 } : sort === 'created' ? { createdAt: -1 } : { lastActiveAt: -1 };
    const [items, total] = await Promise.all([this.col.find(filter).sort(order).skip(skip).limit(limit).toArray(), this.col.countDocuments(filter)]);
    return { items, total };
  }

  async stats() {
    const now = Date.now();
    const since = (ms: number) => new Date(now - ms);
    const [total, new24h, new7d, active24h] = await Promise.all([
      this.col.estimatedDocumentCount(),
      this.col.countDocuments({ createdAt: { $gte: since(86_400_000) } }),
      this.col.countDocuments({ createdAt: { $gte: since(7 * 86_400_000) } }),
      this.col.countDocuments({ lastActiveAt: { $gte: since(86_400_000) } }),
    ]);
    return { total, new24h, new7d, active24h };
  }

  async remove(userId: string) {
    return (await this.col.deleteOne({ _id: userId })).deletedCount === 1;
  }

  /** Deletes accounts not active for `days` days. Returns how many. */
  async removeInactive(days: number) {
    return (await this.col.deleteMany({ lastActiveAt: { $lt: new Date(Date.now() - days * 86_400_000) } })).deletedCount;
  }

  async adminEdit(userId: string, patch: { name?: string; status?: string; avatar?: null }) {
    const now = new Date();
    return this.col.findOneAndUpdate({ _id: userId }, { $set: { ...patch, updatedAt: now } }, { returnDocument: 'after' });
  }

  /** Resets the inactivity countdown. */
  /** Admin: likes and dislikes this person received so far stop counting. Returns the reset time. */
  async resetMeter(userId: string): Promise<number | null> {
    const at = new Date();
    const r = await this.col.updateOne({ _id: userId }, { $set: { meterResetAt: at } });
    return r.matchedCount === 1 ? at.getTime() : null;
  }

  async keepAlive(userId: string) {
    return (await this.col.updateOne({ _id: userId }, { $set: { lastActiveAt: new Date() } })).matchedCount === 1;
  }

  async listBans() {
    return this.bans.find().sort({ at: -1 }).limit(500).toArray();
  }

  async ban(userId: string, reason: string, name: string | null) {
    await this.bans.updateOne({ _id: userId }, { $set: { reason, name, at: new Date() } }, { upsert: true });
  }

  async unban(userId: string) {
    await this.bans.deleteOne({ _id: userId });
  }

  /** Web Push subscriptions (see push.ts). */
  pushCollection<T extends { _id: string }>(): Collection<T> {
    return this.db.collection<T>('push_subs');
  }

  async loadSetting<T>(key: string): Promise<T | null> {
    return ((await this.site.findOne({ _id: key }))?.value as T) ?? null;
  }

  async saveSetting(key: string, value: unknown) {
    await this.site.updateOne({ _id: key }, { $set: { value } }, { upsert: true });
  }

  close() {
    return this.client.close();
  }
}
