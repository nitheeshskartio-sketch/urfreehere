/** Image resizing for profile and group pictures. */

export async function drawScaled(source: Blob, maxSize: number, square: boolean): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
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

export function toDataUrl(canvas: HTMLCanvasElement, quality: number): string {
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

