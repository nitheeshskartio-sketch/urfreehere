import type { ReceivedFile } from './transfer/receiver';

/**
 * Downloads always use application/octet-stream so the browser saves the
 * file instead of rendering it (e.g. HTML or SVG that could run scripts).
 */
function asOpaque(blob: Blob): Blob {
  return blob.type === 'application/octet-stream' ? blob : blob.slice(0, blob.size, 'application/octet-stream');
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(asOpaque(blob));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const canSaveToFolder = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/** Picks a unique name inside a directory: "photo.jpg" -> "photo (1).jpg". */
async function uniqueName(dir: FileSystemDirectoryHandle, name: string): Promise<string> {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 0; i < 1000; i++) {
    const candidate = i === 0 ? name : `${base} (${i})${ext}`;
    try {
      await dir.getFileHandle(candidate);
    } catch {
      return candidate;
    }
  }
  return `${base}-${Date.now()}${ext}`;
}

/**
 * Saves every file. Where the File System Access API exists (desktop
 * Chromium) the user picks a folder once and files are streamed into it;
 * otherwise files are downloaded one after another.
 * Returns false if the user dismissed the folder picker.
 */
export async function downloadAll(files: ReceivedFile[]): Promise<boolean> {
  if (canSaveToFolder()) {
    let dir: FileSystemDirectoryHandle;
    try {
      dir = await (window as unknown as { showDirectoryPicker(o: object): Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({
        mode: 'readwrite',
        id: 'received-files',
        startIn: 'downloads',
      });
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return false;
      return sequential(files);
    }
    for (const { meta, blob } of files) {
      const handle = await dir.getFileHandle(await uniqueName(dir, meta.name), { create: true });
      const writable = await handle.createWritable();
      await blob.stream().pipeTo(writable);
    }
    return true;
  }
  return sequential(files);
}

async function sequential(files: ReceivedFile[]): Promise<boolean> {
  for (const { meta, blob } of files) {
    downloadBlob(blob, meta.name);
    await new Promise((r) => window.setTimeout(r, 400));
  }
  return true;
}
