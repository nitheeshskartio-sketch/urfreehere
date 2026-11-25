import { TransferError, toTransferError } from '../errors';
import { SpeedMeter } from '../speed';
import { PROTOCOL_VERSION, decode, encode, sanitizeName, type ControlMessage, type TransferProgress } from './protocol';

export interface SenderCallbacks {
  onAccepted(): void;
  onProgress(progress: TransferProgress): void;
  /** Called only after the receiver confirmed every file was stored. */
  onComplete(progress: TransferProgress): void;
  onError(error: TransferError): void;
}

/** Bytes read from disk at a time, then cut into channel-sized chunks. */
const READ_BLOCK = 1024 * 1024;
/** Pause sending when this much data is queued in the data channel… */
const BUFFER_HIGH = 4 * 1024 * 1024;
/** …and resume when it drains below this (fires `bufferedamountlow`). */
const BUFFER_LOW = 1024 * 1024;
/** Cap on bytes sent but not yet confirmed written by the receiver. */
const MAX_UNACKED = 16 * 1024 * 1024;
const PROGRESS_INTERVAL = 200;

export class FileSender {
  private readonly total: number;
  private readonly offsets: number[];
  private sent = 0;
  private acked = 0;
  private accepted = false;
  private finished = false;
  private wake: (() => void) | null = null;
  private speed = new SpeedMeter();
  private progressTimer: number | undefined;

  constructor(
    private readonly channel: RTCDataChannel,
    private readonly files: File[],
    private readonly chunkSize: number,
    private readonly cb: SenderCallbacks,
  ) {
    let offset = 0;
    this.offsets = files.map((f) => {
      const o = offset;
      offset += f.size;
      return o;
    });
    this.total = offset;
  }

  /** Sends the file list and waits for the receiver to accept or reject. */
  start() {
    this.channel.bufferedAmountLowThreshold = BUFFER_LOW;
    this.channel.addEventListener('message', this.onMessage);
    this.channel.addEventListener('bufferedamountlow', this.onDrain);
    this.channel.addEventListener('close', this.onClose);

    this.sendControl({
      t: 'manifest',
      v: PROTOCOL_VERSION,
      files: this.files.map((f, id) => ({
        id,
        name: sanitizeName(f.name),
        size: f.size,
        type: f.type,
        lastModified: f.lastModified,
      })),
    });
  }

  cancel() {
    if (this.finished) return;
    try {
      if (this.channel.readyState === 'open') this.sendControl({ t: 'cancel' });
    } catch {
      /* ignore */
    }
    this.stop();
  }

  progress(): TransferProgress {
    return {
      fileBytes: this.files.map((f, i) => Math.min(f.size, Math.max(0, this.acked - this.offsets[i]))),
      bytes: this.acked,
      total: this.total,
      speed: this.speed.bytesPerSecond,
    };
  }

  private onMessage = (e: MessageEvent) => {
    if (this.finished) return;
    const msg = typeof e.data === 'string' ? decode(e.data) : null;
    if (!msg) return this.fail(new TransferError('PROTOCOL'));

    switch (msg.t) {
      case 'accept':
        if (this.accepted) return;
        this.accepted = true;
        this.speed.push(0);
        this.cb.onAccepted();
        this.progressTimer = window.setInterval(() => this.cb.onProgress(this.progress()), PROGRESS_INTERVAL);
        void this.run();
        break;
      case 'reject':
        this.fail(
          new TransferError(msg.reason === 'too-large' ? 'TOO_LARGE' : msg.reason === 'no-space' ? 'NO_SPACE' : 'REJECTED'),
        );
        break;
      case 'ack':
        this.acked = Math.max(this.acked, Math.min(msg.bytes, this.sent));
        this.speed.push(this.acked);
        this.wakeUp();
        break;
      case 'complete':
        if (this.acked !== this.total) return this.fail(new TransferError('PROTOCOL', 'incomplete ack'));
        this.stop();
        this.cb.onComplete(this.progress());
        break;
      case 'cancel':
        this.fail(new TransferError('CANCELLED_BY_PEER'));
        break;
      default:
        this.fail(new TransferError('PROTOCOL'));
    }
  };

  private async run() {
    try {
      for (let i = 0; i < this.files.length; i++) {
        const file = this.files[i];
        this.sendControl({ t: 'file-start', id: i });

        for (let offset = 0; offset < file.size; ) {
          const end = Math.min(offset + READ_BLOCK, file.size);
          let block: ArrayBuffer;
          try {
            block = await file.slice(offset, end).arrayBuffer();
          } catch {
            throw new TransferError('FILE_READ');
          }
          if (block.byteLength !== end - offset) throw new TransferError('FILE_READ', 'file changed');

          for (let p = 0; p < block.byteLength; p += this.chunkSize) {
            await this.waitForCapacity();
            if (this.finished) return;
            const len = Math.min(this.chunkSize, block.byteLength - p);
            this.channel.send(new Uint8Array(block, p, len));
            this.sent += len;
          }
          offset = end;
        }

        await this.waitForCapacity();
        if (this.finished) return;
        this.sendControl({ t: 'file-end', id: i });
      }
      // Now wait for the receiver's "complete" message.
    } catch (err) {
      this.fail(toTransferError(err, 'INTERRUPTED'));
    }
  }

  /** Backpressure: data channel buffer and receiver write window. */
  private async waitForCapacity() {
    while (
      !this.finished &&
      (this.channel.bufferedAmount > BUFFER_HIGH || this.sent - this.acked > MAX_UNACKED)
    ) {
      if (this.channel.readyState !== 'open') throw new TransferError('INTERRUPTED');
      await new Promise<void>((resolve) => (this.wake = resolve));
    }
  }

  private wakeUp() {
    const wake = this.wake;
    this.wake = null;
    wake?.();
  }

  private onDrain = () => this.wakeUp();

  private onClose = () => {
    if (this.finished) return;
    this.fail(new TransferError(this.accepted ? 'INTERRUPTED' : 'RECEIVER_DISCONNECTED'));
  };

  private sendControl(message: ControlMessage) {
    if (this.channel.readyState !== 'open') throw new TransferError('INTERRUPTED');
    this.channel.send(encode(message));
  }

  private fail(error: TransferError) {
    if (this.finished) return;
    this.stop();
    this.cb.onError(error);
  }

  private stop() {
    this.finished = true;
    window.clearInterval(this.progressTimer);
    this.channel.removeEventListener('message', this.onMessage);
    this.channel.removeEventListener('bufferedamountlow', this.onDrain);
    this.channel.removeEventListener('close', this.onClose);
    this.wakeUp();
  }
}
