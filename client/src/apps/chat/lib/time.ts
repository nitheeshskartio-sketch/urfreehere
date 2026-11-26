let hour12: boolean | undefined;

/** 'auto' follows the browser's locale. */
export function setClockFormat(format: 'auto' | '12h' | '24h') {
  hour12 = format === '12h' ? true : format === '24h' ? false : undefined;
}

export function shortTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ts >= startOfToday) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12 });
  if (ts >= startOfToday - 86_400_000) return 'Yesterday';
  if (ts >= startOfToday - 6 * 86_400_000) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : '2-digit' });
}

export function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12 });
}

export function dayLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ts >= startOfToday) return 'Today';
  if (ts >= startOfToday - 86_400_000) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

export function lastSeenLabel(online: boolean) {
  return online ? 'online' : 'offline';
}
