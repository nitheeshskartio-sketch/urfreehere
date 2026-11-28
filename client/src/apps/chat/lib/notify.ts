import { navigate } from '../../../lib/router';
import type { ChatEngine } from './engine';
import type { StoredEvent } from './types';

/**
 * Teams-style notifications for new messages:
 *  - tab badge: red circle with the unread count on the favicon, blinking (with
 *    an alternating tab title) while the tab is in the background;
 *  - desktop notifications (after the user allows them);
 *  - a short sound.
 * Muted conversations never notify. Old messages that arrive during catch-up
 * (more than 2 minutes old) update the badge but don't pop up or play a sound.
 */

const BASE_TITLE = 'Humble';
const FRESH_MS = 2 * 60 * 1000;
const BLINK_MS = 900;

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window && window.isSecureContext;

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

/** Asks the browser for permission (must be called from a click). */
export async function enableDesktopNotifications(engine: ChatEngine): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  const result = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  await engine.updateSettings({ desktopNotifications: result === 'granted' });
  return result;
}

// ---- tab badge ---------------------------------------------------------------

let baseIcon: HTMLImageElement | null = null;
let iconLink: HTMLLinkElement | null = null;
let originalHref = '/bee.svg';
const iconCache = new Map<string, string>();

function faviconLink(): HTMLLinkElement {
  if (iconLink) return iconLink;
  iconLink = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (!iconLink) {
    iconLink = document.createElement('link');
    iconLink.rel = 'icon';
    document.head.appendChild(iconLink);
  }
  originalHref = iconLink.getAttribute('href') || '/bee.svg';
  return iconLink;
}

function loadBase(): Promise<HTMLImageElement> {
  if (baseIcon?.complete) return Promise.resolve(baseIcon);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve((baseIcon = img));
    img.onerror = () => resolve((baseIcon = img));
    img.src = originalHref;
  });
}

/** Favicon with a red unread circle. */
async function badgeIcon(count: number): Promise<string> {
  const label = count > 9 ? '9+' : String(count);
  const cached = iconCache.get(label);
  if (cached) return cached;
  const img = await loadBase();
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  try {
    ctx.drawImage(img, 0, 0, size, size);
  } catch {
    /* icon not drawable; badge only */
  }
  const r = 19;
  const cx = size - r;
  const cy = r;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#C4314B'; // Teams notification red
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${label.length > 1 ? 22 : 27}px "Segoe UI", Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy + 1.5);
  const url = canvas.toDataURL('image/png');
  iconCache.set(label, url);
  return url;
}

function setIcon(href: string) {
  const link = faviconLink();
  if (link.getAttribute('href') !== href) {
    link.type = href.startsWith('data:') ? 'image/png' : 'image/svg+xml';
    link.href = href;
  }
}

// ---- sound -------------------------------------------------------------------

let audioCtx: AudioContext | null = null;
let lastSound = 0;

/** Soft two-tone chime, generated (no audio file to download). */
function chime() {
  const now = Date.now();
  if (now - lastSound < 1500) return;
  lastSound = now;
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    const t = audioCtx.currentTime;
    for (const [freq, start] of [
      [880, 0],
      [1318.5, 0.11],
    ] as const) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t + start);
      gain.gain.linearRampToValueAtTime(0.12, t + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + start + 0.35);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t + start);
      osc.stop(t + start + 0.4);
    }
  } catch {
    /* audio not available until the user has interacted with the page */
  }
}

// ---- controller --------------------------------------------------------------

// ---- app icon badge (installed app) ----------------------------------------------

/** Unread count on the installed app's icon (Badging API: Chrome/Edge desktop, Android, iOS 16.4+). */
function setAppBadge(count: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (count > 0) void nav.setAppBadge?.(count).catch(() => {});
    else void nav.clearAppBadge?.().catch(() => {});
  } catch {
    /* not supported */
  }
}

/** Shows a notification, through the service worker when there is one (required on Android). */
async function showNotification(title: string, options: NotificationOptions & { data: { url: string } }, onClick: () => void) {
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration().catch(() => undefined) : undefined;
  if (reg?.active) return reg.showNotification(title, { ...options, badge: '/icons/bee-192.png' });
  const n = new Notification(title, options);
  n.onclick = () => {
    onClick();
    n.close();
  };
}

/** The person isn't looking at Humble: minimised, another tab, or another window in front. */
const away = () => document.visibilityState === 'hidden' || !document.hasFocus();

/** Starts notifications for the chat engine. Returns a function that stops them. */
export function startNotifications(engine: ChatEngine): () => void {
  let blinkTimer: number | undefined;
  let blinkOn = false;
  let alertText: string | null = null; // "Priya sent a message"
  let unseen = false; // new message arrived while the tab was in the background
  let lastCount = -1;
  let stopped = false;

  const render = async () => {
    if (stopped) return;
    const count = engine.unreadTotal();
    setAppBadge(count);
    const blinking = unseen && away() && count > 0;
    if (count === 0) {
      setIcon(originalHref);
      document.title = BASE_TITLE;
    } else if (blinking) {
      // Blink: badge on/off, title alternates with who wrote.
      setIcon(blinkOn ? await badgeIcon(count) : originalHref);
      document.title = blinkOn || !alertText ? `(${count}) ${BASE_TITLE}` : alertText;
    } else {
      setIcon(await badgeIcon(count));
      document.title = `(${count}) ${BASE_TITLE}`;
    }
    if (blinking && blinkTimer === undefined) {
      blinkTimer = window.setInterval(() => {
        blinkOn = !blinkOn;
        void render();
      }, BLINK_MS);
    } else if (!blinking && blinkTimer !== undefined) {
      window.clearInterval(blinkTimer);
      blinkTimer = undefined;
      blinkOn = true;
    }
  };

  const unsubscribeState = engine.subscribe(() => {
    const count = engine.unreadTotal();
    if (count !== lastCount) {
      lastCount = count;
      void render();
    }
  });

  const onVisibility = () => {
    if (!away()) {
      unseen = false;
      alertText = null;
    }
    void render();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', onVisibility);
  window.addEventListener('blur', onVisibility);

  const unsubscribeIncoming = engine.onIncoming((e: StoredEvent) => {
    const conv = engine.convs.get(e.conv);
    if (!conv || conv.muted) return;
    const fresh = Date.now() - e.ts < FRESH_MS;
    const viewingIt = engine.activeConv === e.conv && !away();
    if (viewingIt || !fresh) return;

    const sender = engine.nameOf(e.author);
    const group = e.conv.startsWith('g:') ? engine.convTitle(conv) : null;
    if (away()) {
      unseen = true;
      alertText = group ? `${sender} in ${group}` : `${sender} sent a message`;
    }
    // Let the engine count the unread message first.
    queueMicrotask(() => void render());

    if (engine.settings.notificationSound) chime();

    if (engine.settings.desktopNotifications && notificationsSupported() && Notification.permission === 'granted' && away()) {
      const avatar = engine.profileOf(e.author)?.avatar;
      const url = `/chat/c/${encodeURIComponent(e.conv)}`;
      void showNotification(
        group ? `${sender} in ${group}` : sender,
        {
          body: engine.settings.notificationPreview && !engine.hasLock(e.conv) ? engine.describe(e).slice(0, 160) : 'New message',
          icon: avatar?.startsWith('data:image/') ? avatar : '/icons/bee-192.png',
          tag: e.conv, // one notification per conversation, replaced by newer ones
          silent: true, // we play our own sound
          data: { url },
        },
        () => {
          window.focus();
          navigate(url);
        },
      ).catch(() => {});
    }
  });

  // A notification shown by the service worker was tapped: open that chat here.
  const onSwMessage = (ev: MessageEvent) => {
    const d = ev.data as { type?: string; url?: string } | null;
    if (d?.type === 'open' && typeof d.url === 'string' && d.url.startsWith('/chat')) navigate(d.url);
  };
  navigator.serviceWorker?.addEventListener('message', onSwMessage);

  // Pushes counted while the app was closed are now read here: reset that counter.
  const resetPushCount = () => navigator.serviceWorker?.controller?.postMessage({ type: 'badge-reset' });
  resetPushCount();
  const onFocusReset = () => !away() && resetPushCount();
  window.addEventListener('focus', onFocusReset);

  void render();

  return () => {
    window.removeEventListener('focus', onFocusReset);
    navigator.serviceWorker?.removeEventListener('message', onSwMessage);
    window.removeEventListener('focus', onVisibility);
    window.removeEventListener('blur', onVisibility);
    setAppBadge(0);
    stopped = true;
    unsubscribeState();
    unsubscribeIncoming();
    document.removeEventListener('visibilitychange', onVisibility);
    window.clearInterval(blinkTimer);
    setIcon(originalHref);
    document.title = BASE_TITLE;
  };
}
