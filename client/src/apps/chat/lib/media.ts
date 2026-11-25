/** File types UR Chat sends and accepts. Anything else is refused on both sides. */
export const IMAGE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export const DOCUMENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  md: 'text/markdown',
  rtf: 'application/rtf',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  zip: 'application/zip',
};

export const MAX_IMAGE_SIZE = 25 * 1024 * 1024;
export const MAX_FILE_SIZE = 100 * 1024 * 1024;
/** Received files up to this size download automatically. */
export const AUTO_DOWNLOAD_LIMIT = 25 * 1024 * 1024;

export const DOCUMENT_ACCEPT = Object.keys(DOCUMENT_TYPES).map((e) => `.${e}`).join(',');
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';

export function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export type FileClass = 'image' | 'document';

/** Classifies a file by extension; null when the type isn't supported. */
export function classify(name: string): FileClass | null {
  const ext = extOf(name);
  if (ext in IMAGE_TYPES) return 'image';
  if (ext in DOCUMENT_TYPES) return 'document';
  return null;
}

/** MIME type we trust, derived from the extension (never from the sender). */
export function mimeFor(name: string): string {
  const ext = extOf(name);
  return IMAGE_TYPES[ext] ?? DOCUMENT_TYPES[ext] ?? 'application/octet-stream';
}

export function validateOutgoing(file: File, as: FileClass): string | null {
  const cls = classify(file.name);
  if (!cls || (as === 'image' && cls !== 'image')) {
    return as === 'image'
      ? `${file.name}: only JPG, PNG and WebP images can be sent.`
      : `${file.name}: this file type isn't supported.`;
  }
  const limit = cls === 'image' ? MAX_IMAGE_SIZE : MAX_FILE_SIZE;
  if (file.size > limit) return `${file.name} is larger than the ${Math.round(limit / 1024 / 1024)} MB limit.`;
  if (file.size === 0) return `${file.name} is empty.`;
  return null;
}

/** Makes a received name safe to display and save. */
export function sanitizeName(name: unknown): string {
  if (typeof name !== 'string') return 'file';
  const cleaned = name
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 180);
  return cleaned || 'file';
}

/** Confirms an image's bytes really are JPEG, PNG or WebP. */
export async function isRealImage(blob: Blob): Promise<boolean> {
  const b = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const jpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const webp = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
  return jpeg || png || webp;
}

async function drawScaled(source: Blob, maxSize: number, square: boolean): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  const bitmap = await createImageBitmap(source);
  const { width, height } = bitmap;
  let sx = 0;
  let sy = 0;
  let sw = width;
  let sh = height;
  if (square) {
    const side = Math.min(width, height);
    sx = (width - side) / 2;
    sy = (height - side) / 2;
    sw = sh = side;
  }
  const scale = Math.min(1, maxSize / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return { canvas, width, height };
}

function toDataUrl(canvas: HTMLCanvasElement, quality: number): string {
  const webp = canvas.toDataURL('image/webp', quality);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', quality);
}

/** Square, small profile/group picture (fits comfortably in signaling and op messages). */
export async function makeAvatarImage(file: Blob): Promise<string> {
  const { canvas } = await drawScaled(file, 160, true);
  let q = 0.82;
  let url = toDataUrl(canvas, q);
  while (url.length > 40_000 && q > 0.4) url = toDataUrl(canvas, (q -= 0.12));
  return url;
}

/** Dimensions and a tiny blurred preview shown while the full image transfers. */
export async function imageInfo(file: Blob): Promise<{ width: number; height: number; thumb: string }> {
  const { canvas, width, height } = await drawScaled(file, 24, false);
  return { width, height, thumb: toDataUrl(canvas, 0.6) };
}
