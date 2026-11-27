import { createHash } from 'node:crypto';
import type { Collection } from 'mongodb';
import webpush, { type PushSubscription } from 'web-push';
import { WindowLimiter } from '../rateLimit.js';
import type { AccountStore } from './accounts.js';

/**
 * Web Push for Humble: tells someone "X sent you a message" while their app
 * is closed. Messages themselves still travel device to device; the push has
 * no message text, only who wrote and in which chat.
 *
 * VAPID keys come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY when set, otherwise
 * they're created once and kept in MongoDB (site_settings "vapid"), so
 * subscriptions stay valid across restarts and deploys.
 */

interface SubDoc {
  _id: string; // hash of the endpoint
  userId: string;
  sub: PushSubscription;
  createdAt: Date;
}

interface Keys {
  publicKey: string;
  privateKey: string;
}

export interface PushOptions {
  accounts: Promise<AccountStore> | null;
  production: boolean;
  publicKey: string;
  privateKey: string;
  subject: string;
}

const endpointId = (endpoint: string) => createHash('sha256').update(endpoint).digest('base64url');

function parseSubscription(v: unknown): PushSubscription | null {
  const s = v as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  if (!s || typeof s.endpoint !== 'string' || s.endpoint.length > 1000 || !/^https:\/\//.test(s.endpoint)) return null;
  if (typeof s.keys?.p256dh !== 'string' || typeof s.keys?.auth !== 'string' || s.keys.p256dh.length > 200 || s.keys.auth.length > 100) return null;
  return { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } };
}

export class PushService {
  private keys: Keys | null = null;
  private col: Collection<SubDoc> | null = null;
  private store: AccountStore | null = null;
  private memory = new Map<string, SubDoc>();
  /** One push per sender -> recipient per 20 s; a burst of messages becomes one notification. */
  private pairLimiter = new WindowLimiter(1, 20_000);
  private senderLimiter: WindowLimiter;
  private ready: Promise<void>;

  constructor(private readonly opts: PushOptions) {
    this.senderLimiter = new WindowLimiter(opts.production ? 60 : 600, 60 * 60 * 1000);
    this.ready = this.init().catch((err: Error) => console.error('[push] setup failed:', err.message));
    setInterval(() => {
      this.pairLimiter.sweep();
      this.senderLimiter.sweep();
    }, 10 * 60 * 1000).unref();
  }

  private async init() {
    const store = await this.opts.accounts?.catch(() => null);
    this.store = store ?? null;
    if (this.opts.publicKey && this.opts.privateKey) {
      this.keys = { publicKey: this.opts.publicKey, privateKey: this.opts.privateKey };
    } else if (store) {
      const saved = await store.loadSetting<Keys>('vapid').catch(() => null);
      this.keys = saved?.publicKey && saved.privateKey ? saved : webpush.generateVAPIDKeys();
      if (!saved) await store.saveSetting('vapid', this.keys);
    } else {
      // No database: keys last until the server restarts (fine for development).
      this.keys = webpush.generateVAPIDKeys();
    }
    if (store) {
      const col = store.pushCollection<SubDoc>();
      await col.createIndex({ userId: 1 }).catch(() => {});
      this.col = col;
    }
    console.log('[push] web push ready');
  }

  async publicKey(): Promise<string | null> {
    await this.ready;
    return this.keys?.publicKey ?? null;
  }

  async subscribe(userId: string, raw: unknown): Promise<boolean> {
    await this.ready;
    const sub = parseSubscription(raw);
    if (!sub) return false;
    const doc: SubDoc = { _id: endpointId(sub.endpoint), userId, sub, createdAt: new Date() };
    this.memory.set(doc._id, doc);
    await this.col?.replaceOne({ _id: doc._id }, doc, { upsert: true }).catch(() => {});
    return true;
  }

  async unsubscribe(userId: string, endpoint: unknown) {
    if (typeof endpoint !== 'string') return;
    const id = endpointId(endpoint);
    const doc = this.memory.get(id);
    if (doc && doc.userId === userId) this.memory.delete(id);
    await this.col?.deleteOne({ _id: id, userId }).catch(() => {});
  }

  /** An account was deleted, or signed in on a new device: its old subscriptions go. */
  async forgetUser(userId: string, keepEndpoint?: string) {
    const keep = keepEndpoint ? endpointId(keepEndpoint) : null;
    for (const [id, d] of this.memory) if (d.userId === userId && id !== keep) this.memory.delete(id);
    await this.col?.deleteMany(keep ? { userId, _id: { $ne: keep } } : { userId }).catch(() => {});
  }

  private async subsOf(userId: string): Promise<SubDoc[]> {
    if (this.col) return this.col.find({ userId }).limit(10).toArray().catch(() => [...this.memory.values()].filter((d) => d.userId === userId));
    return [...this.memory.values()].filter((d) => d.userId === userId);
  }

  /**
   * "from wrote to you in conv". Returns how many devices were notified.
   * The caller only asks when the recipient isn't connected.
   */
  async notify(from: string, to: string, conv: string, group: string | null): Promise<number> {
    await this.ready;
    if (!this.keys || from === to) return 0;
    if (!this.senderLimiter.take(from) || !this.pairLimiter.take(`${from}>${to}>${conv}`)) return 0;
    const subs = await this.subsOf(to);
    if (!subs.length) return 0;
    const sender = (await this.store?.get(from).catch(() => null))?.name ?? 'Someone';
    const payload = JSON.stringify({
      title: group ? `${sender} in ${group}` : sender,
      body: group ? 'New message in the group' : 'Sent you a message',
      url: `/chat/c/${encodeURIComponent(conv)}`,
      tag: conv,
    });
    let sent = 0;
    for (const d of subs) {
      try {
        await webpush.sendNotification(d.sub, payload, {
          vapidDetails: { subject: this.opts.subject, publicKey: this.keys.publicKey, privateKey: this.keys.privateKey },
          TTL: 24 * 60 * 60,
          urgency: 'high',
          topic: endpointId(conv).slice(0, 32), // a newer push for the same chat replaces an undelivered one
        });
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // The browser unsubscribed or the subscription expired: forget it.
        if (status === 404 || status === 410) {
          this.memory.delete(d._id);
          await this.col?.deleteOne({ _id: d._id }).catch(() => {});
        } else console.error('[push] send failed:', status ?? (err as Error).message);
      }
    }
    return sent;
  }
}
