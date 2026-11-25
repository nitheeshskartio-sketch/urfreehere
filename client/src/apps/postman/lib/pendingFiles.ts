/**
 * Hand-off of files picked on the home page to the send page. Holds File
 * references (not contents) in memory only.
 */
let pending: File[] = [];

export function setPendingFiles(files: File[]) {
  pending = files;
}

/** Safe to call more than once (React may run state initializers twice in dev). */
export function peekPendingFiles(): File[] {
  return pending;
}

export function clearPendingFiles() {
  pending = [];
}
