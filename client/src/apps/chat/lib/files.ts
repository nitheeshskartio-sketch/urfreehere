import { sha256Hex } from './encoding';

const READ_BLOCK = 1024 * 1024;
const BUFFER_HIGH = 4 * 1024 * 1024;
const BUFFER_LOW = 512 * 1024;
const IDLE_TIMEOUT = 30_000;

function waitOpen(channel: RTCDataChannel): Promise<void> {
  if (channel.readyState === 'open') return Promise.resolve();
  return new Promise((resolve, reject) => {
    channel.addEventListener('open', () => resolve(), { once: true });
    channel.addEventListener('close', () => reject(new Error('closed')), { once: true });
  });
}

/**
 * Sends one file over its own data channel: a JSON header, binary chunks,
 * then an end marker. Backpressure keeps the send buffer bounded so large
 * files never pile up in memory.
 */
export async function sendFile(
  channel: RTCDataChannel,
  blob: Blob,
  chunkSize: number,
  /** In-flight limits; smaller when the server forwards the data. */
  limits: { high: number; low: number } = { high: BUFFER_HIGH, low: BUFFER_LOW },
): Promise<void> {
  channel.binaryType = 'arraybuffer';
  channel.bufferedAmountLowThreshold = limits.low;
  await waitOpen(channel);
  channel.send(JSON.stringify({ t: 'meta', size: blob.size }));

  const drain = () =>
    new Promise<void>((resolve, reject) => {
      const onLow = () => {
        cleanup();
        resolve();
      };
      const onClose = () => {
        cleanup();
        reject(new Error('closed'));
      };
      const cleanup = () => {
        channel.removeEventListener('bufferedamountlow', onLow);
        channel.removeEventListener('close', onClose);
      };
      channel.addEventListener('bufferedamountlow', onLow);
      channel.addEventListener('close', onClose);
    });

  for (let offset = 0; offset < blob.size; offset += READ_BLOCK) {
    const block = await blob.slice(offset, offset + READ_BLOCK).arrayBuffer();
    for (let p = 0; p < block.byteLength; p += chunkSize) {
      if (channel.readyState !== 'open') throw new Error('closed');
      if (channel.bufferedAmount > limits.high) await drain();
      channel.send(new Uint8Array(block, p, Math.min(chunkSize, block.byteLength - p)));
    }
  }
  channel.send(JSON.stringify({ t: 'end' }));
  // The receiver closes the channel once it has verified the file.
  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(() => {
      channel.close();
      resolve();
    }, 60_000);
    channel.addEventListener(
      'close',
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export class TransferCancelled extends Error {
  constructor() {
    super('cancelled');
  }
}

/**
 * Receives a file and verifies it against the size and SHA-256 hash in the
 * signed message before accepting it.
 */
export function receiveFile(
  channel: RTCDataChannel,
  expected: { size: number; sha256: string },
  onProgress: (received: number) => void,
  signal: AbortSignal,
): Promise<Blob> {
  channel.binaryType = 'arraybuffer';
  return new Promise((resolve, reject) => {
    const parts: Blob[] = [];
    let pending: ArrayBuffer[] = [];
    let pendingBytes = 0;
    let received = 0;
    let finished = false;
    let idle = window.setTimeout(() => fail(new Error('The transfer stalled.')), IDLE_TIMEOUT);
    let lastReport = 0;

    const flush = () => {
      if (pending.length) parts.push(new Blob(pending));
      pending = [];
      pendingBytes = 0;
    };
    const fail = (err: Error) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(idle);
      channel.close();
      reject(err);
    };
    signal.addEventListener('abort', () => fail(new TransferCancelled()), { once: true });

    channel.onmessage = async (e) => {
      if (finished) return;
      window.clearTimeout(idle);
      idle = window.setTimeout(() => fail(new Error('The transfer stalled.')), IDLE_TIMEOUT);

      if (typeof e.data === 'string') {
        let msg: { t?: string; size?: number };
        try {
          msg = JSON.parse(e.data);
        } catch {
          return fail(new Error('Invalid transfer data.'));
        }
        if (msg.t === 'meta') {
          if (msg.size !== expected.size) fail(new Error('The file size does not match.'));
          return;
        }
        if (msg.t !== 'end') return;
        finished = true;
        window.clearTimeout(idle);
        flush();
        const blob = new Blob(parts);
        if (blob.size !== expected.size) {
          channel.close();
          return reject(new Error('The file arrived incomplete.'));
        }
        const hash = await sha256Hex(await blob.arrayBuffer());
        channel.close();
        if (hash !== expected.sha256) return reject(new Error('The file failed its integrity check.'));
        onProgress(received);
        return resolve(blob);
      }

      const chunk = e.data as ArrayBuffer;
      received += chunk.byteLength;
      if (received > expected.size) return fail(new Error('Received more data than expected.'));
      pending.push(chunk);
      pendingBytes += chunk.byteLength;
      if (pendingBytes >= 8 * 1024 * 1024) flush();
      const now = performance.now();
      if (now - lastReport > 150) {
        lastReport = now;
        onProgress(received);
      }
    };
    channel.onclose = () => fail(new Error('The connection closed during the transfer.'));
  });
}
