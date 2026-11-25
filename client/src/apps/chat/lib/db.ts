/**
 * Minimal promise wrapper around IndexedDB. Everything the chat stores lives
 * on this device: identity keys, contacts, conversations, messages and
 * received files.
 */
const DB_NAME = 'ur-chat';
const DB_VERSION = 1;

export type StoreName = 'kv' | 'contacts' | 'convs' | 'events' | 'files';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('contacts')) db.createObjectStore('contacts', { keyPath: 'userId' });
      if (!db.objectStoreNames.contains('convs')) db.createObjectStore('convs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('events')) {
        const events = db.createObjectStore('events', { keyPath: 'id' });
        events.createIndex('conv', 'conv');
      }
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'fileId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database is open in an older tab.'));
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name: StoreName, mode: IDBTransactionMode = 'readonly') {
  return (await open()).transaction(name, mode).objectStore(name);
}

export const db = {
  async get<T>(name: StoreName, key: IDBValidKey): Promise<T | undefined> {
    return wrap((await store(name)).get(key));
  },
  async getAll<T>(name: StoreName): Promise<T[]> {
    return wrap((await store(name)).getAll());
  },
  async keys(name: StoreName): Promise<IDBValidKey[]> {
    return wrap((await store(name)).getAllKeys());
  },
  async put(name: StoreName, value: unknown, key?: IDBValidKey): Promise<void> {
    await wrap((await store(name, 'readwrite')).put(value, key));
  },
  async putMany(name: StoreName, values: unknown[]): Promise<void> {
    if (!values.length) return;
    const tx = (await open()).transaction(name, 'readwrite');
    const s = tx.objectStore(name);
    for (const v of values) s.put(v);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },
  async delete(name: StoreName, key: IDBValidKey): Promise<void> {
    await wrap((await store(name, 'readwrite')).delete(key));
  },
  async deleteByConv(convId: string): Promise<void> {
    const s = await store('events', 'readwrite');
    const keys = await wrap(s.index('conv').getAllKeys(convId));
    for (const k of keys) s.delete(k);
  },
  /** Deletes the whole database (Settings → Delete all data). */
  async destroy(): Promise<void> {
    if (dbPromise) (await dbPromise).close();
    dbPromise = null;
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve();
    });
  },
};
