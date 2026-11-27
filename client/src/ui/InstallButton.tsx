import { Download, Share, X } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/** The browser's install offer (Chrome, Edge, Samsung Internet, …). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Call once at start-up: the offer can fire before React renders. */
export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // show our own button instead of the browser's mini bar
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** iPhone / iPad Safari: no install offer; installing is Share → Add to Home Screen. */
function isIosSafari() {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

/** "Install app" button. Shows only when the site can be installed and isn't already. */
export function InstallButton({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const offer = useSyncExternalStore(subscribe, () => deferred);
  const [tip, setTip] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!tip) return;
    const close = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setTip(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [tip]);

  if (isStandalone()) return null;
  const ios = !offer && isIosSafari();
  if (!offer && !ios) return null;

  const install = async () => {
    if (ios) return setTip((t) => !t);
    const e = deferred;
    if (!e) return;
    await e.prompt();
    await e.userChoice.catch(() => null);
    deferred = null; // an offer can be used only once
    emit();
  };

  return (
    <div ref={wrap} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => void install()}
        className={`flex items-center gap-1.5 rounded-md text-[13px] font-medium text-accent hover:bg-accent-soft ${compact ? 'p-2' : 'px-2.5 py-1.5'}`}
        title="Install UR Free Here as an app"
        aria-label="Install app"
      >
        <Download className="size-4" />
        {!compact && <span>Install app</span>}
      </button>
      {tip && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-line bg-panel p-3 text-left text-[13px] shadow-pop" role="dialog" aria-label="Install on iPhone or iPad">
          <button type="button" onClick={() => setTip(false)} className="absolute right-1.5 top-1.5 rounded p-1 text-muted hover:text-ink" aria-label="Close">
            <X className="size-3.5" />
          </button>
          <p className="pr-5 font-semibold">Install on your iPhone or iPad</p>
          <p className="mt-1.5 text-ink-soft">
            Tap <Share className="inline size-4 align-text-bottom" /> <span className="font-medium">Share</span> in Safari, then{' '}
            <span className="font-medium">Add to Home Screen</span>.
          </p>
        </div>
      )}
    </div>
  );
}
