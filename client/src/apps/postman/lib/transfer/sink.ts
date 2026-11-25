import { TransferError } from '../errors';
import { LIMITS } from '../limits';
import type { FileMeta } from './protocol';

/** Destination for one incoming file's bytes, written strictly in order. */
export interface Sink {
  write(data: ArrayBuffer): Promise<void>;
  close(): Promise<Blob>;
  abort(): Promise<void>;
}

const FLUSH_BYTES = 8 * 1024 * 1024;

/**
 * Fallback: accumulates chunks and periodically folds them into Blobs, which
 * lets the browser move large data out of the JS heap (Chromium pages big
 * Blobs to disk).
 */
class BlobSink implements Sink {
  private parts: Blob[] = [];
  private pending: ArrayBuffer[] = [];
  private pendingBytes = 0;

  constructor(private readonly type: string) {}

  async write(data: ArrayBuffer) {
    this.pending.push(data);
    this.pendingBytes += data.byteLength;
    if (this.pendingBytes >= FLUSH_BYTES) this.flush();
  }

  private flush() {
    if (!this.pending.length) return;
    this.parts.push(new Blob(this.pending));
    this.pending = [];
    this.pendingBytes = 0;
  }

  async close() {
    this.flush();
    const blob = new Blob(this.parts, { type: this.type });
    this.parts = [];
    return blob;
  }

  async abort() {
    this.parts = [];
    this.pending = [];
  }
}

const OPFS_BATCH = 1024 * 1024;

/** Streams straight to the Origin Private File System, so large files never sit in memory. */
class OpfsSink implements Sink {
  private batch: ArrayBuffer[] = [];
  private batchBytes = 0;

  private constructor(
    private readonly handle: FileSystemFileHandle,
    private readonly writable: FileSystemWritableFileStream,
    private readonly type: string,
  ) {}

  static async create(dir: FileSystemDirectoryHandle, name: string, type: string) {
    const handle = await dir.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    return new OpfsSink(handle, writable, type);
  }

  /** Coalesces small chunks into ~1 MiB writes; each OPFS write has fixed overhead. */
  async write(data: ArrayBuffer) {
    this.batch.push(data);
    this.batchBytes += data.byteLength;
    if (this.batchBytes >= OPFS_BATCH) await this.flush();
  }

  private async flush() {
    if (!this.batchBytes) return;
    const parts = this.batch;
    this.batch = [];
    this.batchBytes = 0;
    await this.writable.write(new Blob(parts));
  }

  async close() {
    await this.flush();
    await this.writable.close();
    const file = await this.handle.getFile();
    return this.type ? file.slice(0, file.size, this.type) : file;
  }

  async abort() {
    try {
      await this.writable.abort();
    } catch {
      /* ignore */
    }
  }
}

const OPFS_ROOT = 'incoming';
const LOCK_PREFIX = 'urp-incoming-';

function opfsSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.storage?.getDirectory &&
    typeof FileSystemFileHandle !== 'undefined' &&
    'createWritable' in FileSystemFileHandle.prototype
  );
}

/**
 * Creates sinks for one receiving session. With OPFS, each session gets its
 * own temporary folder, held by a Web Lock so other tabs know it is in use;
 * it is deleted when the session ends.
 */
export class SinkFactory {
  private releaseLock: (() => void) | null = null;

  private constructor(
    private readonly dir: FileSystemDirectoryHandle | null,
    private readonly root: FileSystemDirectoryHandle | null,
    private readonly sessionName: string,
  ) {}

  static async create(totalBytes: number): Promise<SinkFactory> {
    if (opfsSupported()) {
      try {
        const estimate = await navigator.storage.estimate?.();
        const free = estimate?.quota !== undefined ? estimate.quota - (estimate.usage ?? 0) : Infinity;
        if (free > totalBytes * 1.05) {
          const root = await (await navigator.storage.getDirectory()).getDirectoryHandle(OPFS_ROOT, { create: true });
          const name = `${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
          // Take the lock before the folder exists so another tab's cleanup can't remove it.
          const releaseLock = await acquireLock(LOCK_PREFIX + name);
          const dir = await root.getDirectoryHandle(name, { create: true });
          const factory = new SinkFactory(dir, root, name);
          factory.releaseLock = releaseLock;
          return factory;
        }
      } catch {
        // Private browsing modes may refuse OPFS: fall back to memory.
      }
    }
    if (totalBytes > LIMITS.maxInMemory) throw new TransferError('NO_SPACE', 'too large for in-memory reception');
    return new SinkFactory(null, null, '');
  }

  get usesDisk() {
    return this.dir !== null;
  }

  async createSink(meta: FileMeta): Promise<Sink> {
    if (this.dir) return OpfsSink.create(this.dir, `${meta.id}`, meta.type);
    return new BlobSink(meta.type);
  }

  async dispose() {
    if (this.root && this.sessionName) {
      try {
        await this.root.removeEntry(this.sessionName, { recursive: true });
      } catch {
        /* files may still be open; stale cleanup will catch it */
      }
    }
    this.releaseLock?.();
    this.releaseLock = null;
  }
}

/** Holds a Web Lock until the returned function is called. */
function acquireLock(name: string): Promise<(() => void) | null> {
  if (!navigator.locks) return Promise.resolve(null);
  return new Promise((resolveAcquired) => {
    navigator.locks
      .request(name, () => new Promise<void>((release) => resolveAcquired(release)))
      .catch(() => resolveAcquired(null));
  });
}

export type StorageCapacity = 'disk' | 'memory' | 'no-space' | 'too-large-for-memory';

/**
 * Decides, before accepting, whether this device can store `totalBytes`:
 * streamed to disk (OPFS with enough quota), held in memory (small
 * transfers only), or not at all.
 */
export async function checkCapacity(totalBytes: number): Promise<StorageCapacity> {
  let opfsShort = false;
  if (opfsSupported()) {
    try {
      const estimate = await navigator.storage.estimate();
      const free = estimate.quota !== undefined ? estimate.quota - (estimate.usage ?? 0) : Infinity;
      if (free > totalBytes * 1.05) return 'disk';
      opfsShort = true;
    } catch {
      /* fall through to memory */
    }
  }
  if (totalBytes <= LIMITS.maxInMemory) return 'memory';
  return opfsShort ? 'no-space' : 'too-large-for-memory';
}

/** Removes temporary folders left behind by closed or crashed tabs. */
export async function cleanupStaleIncoming() {
  if (!opfsSupported() || !navigator.locks) return;
  try {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle(OPFS_ROOT, { create: true });
    // @ts-expect-error: async iteration of directory handles is not in every DOM lib version
    for await (const name of root.keys() as AsyncIterable<string>) {
      await navigator.locks.request(LOCK_PREFIX + name, { ifAvailable: true }, async (lock) => {
        if (lock) await root.removeEntry(name, { recursive: true }).catch(() => {});
      });
    }
  } catch {
    /* best effort */
  }
}
