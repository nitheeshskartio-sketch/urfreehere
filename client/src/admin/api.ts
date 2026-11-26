/**
 * Admin console client. The password is checked only by the server; the
 * browser keeps the session token it gets back in sessionStorage (cleared when
 * the tab closes) and sends it with every admin request.
 */
const BASE: string = import.meta.env.VITE_SIGNALING_URL || '';
const KEY = 'urfree.admin';
export const LOGOUT_EVENT = 'urfree-admin-logout';

export class AdminError extends Error {
  constructor(
    readonly code: string,
    readonly status = 0,
  ) {
    super(code);
  }
}

export const adminToken = () => sessionStorage.getItem(KEY);

export async function adminLogin(password: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
  } catch {
    throw new AdminError('OFFLINE');
  }
  const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  if (!res.ok || !body.token) throw new AdminError(body.error ?? 'FAILED', res.status);
  sessionStorage.setItem(KEY, body.token);
}

export async function adminApi<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = adminToken();
  if (!token) throw new AdminError('UNAUTHORIZED', 401);
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/admin${path}`, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new AdminError('OFFLINE');
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (res.status === 401) {
    sessionStorage.removeItem(KEY);
    window.dispatchEvent(new Event(LOGOUT_EVENT));
  }
  if (!res.ok) throw new AdminError(body.error ?? 'FAILED', res.status);
  return body;
}

export async function adminLogout() {
  await adminApi('/logout', { method: 'POST' }).catch(() => {});
  sessionStorage.removeItem(KEY);
  window.dispatchEvent(new Event(LOGOUT_EVENT));
}

export function adminErrorText(err: unknown): string {
  const code = err instanceof AdminError ? err.code : 'FAILED';
  switch (code) {
    case 'WRONG_PASSWORD':
      return "That password isn't right.";
    case 'RATE_LIMITED':
      return 'Too many attempts. Wait 15 minutes and try again.';
    case 'NOT_CONFIGURED':
      return "The admin console isn't set up on this server (ADMIN_PASSWORD is empty).";
    case 'OFFLINE':
      return "Can't reach the server. Check your connection.";
    case 'UNAUTHORIZED':
      return 'Your admin session ended. Enter the password again.';
    case 'ACCOUNTS_DISABLED':
      return 'Profiles need MongoDB, which is not configured on this server (MONGODB_URI).';
    case 'ACCOUNTS_STARTING':
      return 'The profile database is still connecting. Try again in a moment.';
    case 'ACCOUNTS_UNAVAILABLE':
      return "The profile database isn't reachable right now.";
    case 'NOT_FOUND':
      return 'It no longer exists.';
    case 'INVALID_ID':
      return "That isn't a valid chat ID.";
    default:
      return 'Something went wrong. Please try again.';
  }
}
