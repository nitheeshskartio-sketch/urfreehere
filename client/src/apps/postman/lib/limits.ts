import { formatBytes } from '../../../lib/format';

const MB = 1024 * 1024;

function mb(value: string | undefined, fallbackMb: number): number {
  const n = Number(value);
  return (Number.isFinite(n) && n > 0 ? n : fallbackMb) * MB;
}

function count(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const env = import.meta.env;

/**
 * Transfer limits. Enforced by the sender when choosing files and again by
 * the receiver when it reads the file list (the receiver never trusts the
 * sender's client). Configure at build time with VITE_* variables in `.env`.
 */
export const LIMITS = {
  /** Largest single file. */
  maxFileSize: mb(env.VITE_MAX_FILE_SIZE_MB, 4096),
  /** Largest total per transfer. */
  maxTotalSize: mb(env.VITE_MAX_TOTAL_SIZE_MB, 10240),
  /** Most files per transfer. */
  maxFiles: count(env.VITE_MAX_FILES, 500),
  /** Largest total a receiver accepts when it cannot stream to disk (held in memory). */
  maxInMemory: mb(env.VITE_MAX_IN_MEMORY_MB, 1024),
};

export interface RejectedFile {
  name: string;
  reason: string;
}

/** Adds files to a selection while respecting the limits. */
export function addWithinLimits(current: File[], incoming: File[]): { files: File[]; rejected: RejectedFile[] } {
  const files = current.slice();
  const rejected: RejectedFile[] = [];
  let total = files.reduce((s, f) => s + f.size, 0);

  for (const f of incoming) {
    if (f.size > LIMITS.maxFileSize) {
      rejected.push({ name: f.name, reason: `larger than the ${formatBytes(LIMITS.maxFileSize)} per-file limit` });
    } else if (files.length >= LIMITS.maxFiles) {
      rejected.push({ name: f.name, reason: `a transfer can include at most ${LIMITS.maxFiles} files` });
    } else if (total + f.size > LIMITS.maxTotalSize) {
      rejected.push({ name: f.name, reason: `the transfer would exceed the ${formatBytes(LIMITS.maxTotalSize)} total limit` });
    } else {
      files.push(f);
      total += f.size;
    }
  }
  return { files, rejected };
}

/** Receiver-side check of an offered file list. Returns a reason when it must be refused. */
export function checkOffer(files: { size: number }[]): string | null {
  if (files.length > LIMITS.maxFiles) return `More than ${LIMITS.maxFiles} files were offered.`;
  const tooBig = files.find((f) => f.size > LIMITS.maxFileSize);
  if (tooBig) return `A file is larger than the ${formatBytes(LIMITS.maxFileSize)} per-file limit.`;
  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > LIMITS.maxTotalSize) return `The transfer is larger than the ${formatBytes(LIMITS.maxTotalSize)} limit.`;
  return null;
}
