import { TransferError, toTransferError } from '../errors';
import { SpeedMeter } from '../speed';
import { decode, encode, type ControlMessage, type FileMeta, type RejectReason, type TransferProgress } from './protocol';
import { SinkFactory, type Sink } from './sink';

export interface ReceivedFile {
  meta: FileMeta;
  blob: Blob;
}

export { type RejectReason };

export interface ReceiverCallbacks {
  onManifest(files: FileMeta[]): void;
  onProgress(progress: TransferProgress): void;
  onComplete(files: ReceivedFile[]): void;
  onError(error: TransferError): void;
}

const ACK_EVERY = 1024 * 1024;
const PROGRESS_INTERVAL = 200;

type State = 'idle' | 'offered' | 'receiving' | 'done' | 'aborted';

export class FileReceiver {
  private state: State = 'idle';
  private files: FileMeta[] = [];
  private total = 0;
  private factory: SinkFactory | null = null;
  /** Serialises storage work so chunks are written strictly in order. */
  private chain: Promise<void> = Promise.resolve();

  private current: { meta: FileMeta; sink: Sink | null; received: number } | null = null;
  private nextId = 0;
  /** Total bytes written to storage so far. */
  private stored = 0;
  private lastAck = 0;
  private fileStored: number[] = [];
  private results: ReceivedFile[] = [];
  private openSinks = new Set<Sink>();
  private speed = new SpeedMeter();
  private progressTimer: number | undefined;

  constructor(
    private readonly channel: RTCDataChannel,
    private readonly cb: ReceiverCallbacks,
  ) {
    channel.addEventListener('message', this.onMessage);
    channel.addEventListener('close', this.onClose);
  }

  get sinkFactory() {
    return this.factory;
  }

  async accept() {
    if (this.state !== 'offered') return;
    this.state = 'receiving';
    try {
      this.factory = await SinkFactory.create(this.total);
    } catch (err) {
      return this.fail(toTransferError(err, 'FILE_SAVE'));
    }
    if (this.state !== 'receiving') return;
    this.speed.push(0);
    this.progressTimer = window.setInterval(() => this.cb.onProgress(this.progress()), PROGRESS_INTERVAL);
    this.send({ t: 'accept' });
  }

  reject(reason: RejectReason = 'declined') {
    if (this.state !== 'offered') return;
    this.send({ t: 'reject', reason });
    this.stop();
  }

  cancel() {
    if (this.state === 'done' || this.state === 'aborted') return;
    this.send({ t: 'cancel' });
    this.stop();
  }

  progress(): TransferProgress {
    return {
      fileBytes: this.fileStored.slice(),
      bytes: this.stored,
      total: this.total,
      speed: this.speed.bytesPerSecond,
    };
  }

  private onMessage = (e: MessageEvent) => {
    if (this.state === 'done' || this.state === 'aborted') return;

    if (typeof e.data !== 'string') return this.onChunk(e.data as ArrayBuffer | Blob);

    const msg = decode(e.data);
    if (!msg) return this.fail(new TransferError('PROTOCOL'));

    switch (msg.t) {
      case 'manifest':
        if (this.state !== 'idle') return this.fail(new TransferError('PROTOCOL'));
        this.files = msg.files;
        this.total = msg.files.reduce((s, f) => s + f.size, 0);
        this.fileStored = msg.files.map(() => 0);
        this.state = 'offered';
        this.cb.onManifest(msg.files);
        break;

      case 'file-start': {
        if (this.state !== 'receiving' || this.current || msg.id !== this.nextId) {
          return this.fail(new TransferError('PROTOCOL'));
        }
        const meta = this.files[msg.id];
        if (!meta) return this.fail(new TransferError('PROTOCOL'));
        const entry = { meta, sink: null as Sink | null, received: 0 };
        this.current = entry;
        this.nextId += 1;
        this.enqueue(async () => {
          entry.sink = await this.factory!.createSink(meta);
          this.openSinks.add(entry.sink);
        });
        break;
      }

      case 'file-end': {
        const entry = this.current;
        if (this.state !== 'receiving' || !entry || entry.meta.id !== msg.id) {
          return this.fail(new TransferError('PROTOCOL'));
        }
        if (entry.received !== entry.meta.size) return this.fail(new TransferError('PROTOCOL', 'size mismatch'));
        this.current = null;
        this.enqueue(async () => {
          const blob = await entry.sink!.close();
          this.openSinks.delete(entry.sink!);
          if (blob.size !== entry.meta.size) throw new TransferError('FILE_SAVE', 'stored size mismatch');
          this.results.push({ meta: entry.meta, blob });
          this.ack(true);
          if (this.results.length === this.files.length) this.finish();
        });
        break;
      }

      case 'cancel':
        this.fail(new TransferError('CANCELLED_BY_PEER'));
        break;

      default:
        this.fail(new TransferError('PROTOCOL'));
    }
  };

  private onChunk(data: ArrayBuffer | Blob) {
    const entry = this.current;
    if (this.state !== 'receiving' || !entry) return this.fail(new TransferError('PROTOCOL'));
    const size = data instanceof Blob ? data.size : data.byteLength;
    entry.received += size;
    if (entry.received > entry.meta.size) return this.fail(new TransferError('PROTOCOL', 'too much data'));

    this.enqueue(async () => {
      const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
      await entry.sink!.write(buffer);
      this.stored += size;
      this.fileStored[entry.meta.id] += size;
      this.speed.push(this.stored);
      this.ack(false);
    });
  }

  private enqueue(task: () => Promise<void>) {
    this.chain = this.chain.then(async () => {
      if (this.state !== 'receiving') return;
      try {
        await task();
      } catch (err) {
        this.fail(toTransferError(err, 'FILE_SAVE'));
      }
    });
  }

  private ack(force: boolean) {
    if (force || this.stored - this.lastAck >= ACK_EVERY) {
      this.lastAck = this.stored;
      this.send({ t: 'ack', bytes: this.stored });
    }
  }

  private finish() {
    if (this.stored !== this.total) return this.fail(new TransferError('PROTOCOL', 'total mismatch'));
    this.send({ t: 'complete' });
    this.state = 'done';
    this.detach();
    this.cb.onProgress(this.progress());
    this.cb.onComplete(this.results);
  }

  private onClose = () => {
    if (this.state === 'done' || this.state === 'aborted') return;
    this.fail(new TransferError(this.state === 'receiving' ? 'INTERRUPTED' : 'SENDER_DISCONNECTED'));
  };

  private send(message: ControlMessage) {
    try {
      if (this.channel.readyState === 'open') this.channel.send(encode(message));
    } catch {
      /* the close handler reports the failure */
    }
  }

  private fail(error: TransferError) {
    if (this.state === 'done' || this.state === 'aborted') return;
    this.stop();
    this.cb.onError(error);
  }

  private stop() {
    this.state = 'aborted';
    this.detach();
    for (const sink of this.openSinks) void sink.abort();
    this.openSinks.clear();
  }

  private detach() {
    window.clearInterval(this.progressTimer);
    this.channel.removeEventListener('message', this.onMessage);
    this.channel.removeEventListener('close', this.onClose);
  }
}
