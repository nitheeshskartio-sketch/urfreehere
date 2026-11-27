import qrcode from 'qrcode-generator';

/** Renders a QR code to a PNG and downloads it. */
export function downloadQr(value: string, filename: string, caption?: string) {
  const qr = qrcode(0, 'M');
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  const scale = Math.max(6, Math.floor(480 / n));
  const margin = scale * 4;
  const size = n * scale + margin * 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size + (caption ? 56 : 0);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#172033';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(margin + c * scale, margin + r * scale, scale, scale);
  if (caption) {
    ctx.font = '600 22px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(caption.slice(0, 40), size / 2, size + 30);
  }
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }, 'image/png');
}

export type ScanTarget =
  | { kind: 'user'; userId: string }
  | { kind: 'invite'; key: string };

const ID_RE = /^[A-Z2-9]{16}$/;

/** Understands Humble contact links, group invite links and bare codes. */
export function parseScan(raw: string): ScanTarget | null {
  const text = raw.trim();
  const user = text.match(/\/chat\/u\/([A-Za-z0-9-]+)/);
  if (user) {
    const id = user[1].toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (ID_RE.test(id)) return { kind: 'user', userId: id };
  }
  const invite = text.match(/\/(?:chat\/)?join\/([A-Za-z0-9_-]{8,64})/);
  if (invite) return { kind: 'invite', key: invite[1] };
  const compact = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (ID_RE.test(compact)) return { kind: 'user', userId: compact };
  if (/^[2-9A-HJ-NP-Z]{8}$/.test(compact)) return { kind: 'invite', key: compact };
  return null;
}

interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

/** Decodes a QR code from a video frame or image, using the native detector or jsQR as fallback. */
export async function decodeQr(source: HTMLVideoElement | ImageBitmap): Promise<string | null> {
  const BD = (window as unknown as { BarcodeDetector?: new (o: object) => Detector }).BarcodeDetector;
  if (BD) {
    try {
      const res = await new BD({ formats: ['qr_code'] }).detect(source);
      if (res[0]) return res[0].rawValue;
      if (source instanceof HTMLVideoElement) return null;
    } catch {
      /* fall back to jsQR */
    }
  }
  const w = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const h = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
  if (!w || !h) return null;
  const scale = Math.min(1, 800 / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const { default: jsQR } = await import('jsqr');
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(data.data, data.width, data.height)?.data ?? null;
}
