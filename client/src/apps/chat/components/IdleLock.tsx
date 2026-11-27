import { Lock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const IDLE_MS = 20_000;
const ACTIVITY = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

/**
 * Privacy screen: after 20 seconds without activity the app is blurred behind
 * a lock. Any movement, tap or key brings it straight back, exactly where it was.
 */
export function IdleLock({ enabled }: { enabled: boolean }) {
  const [locked, setLocked] = useState(false);
  const timer = useRef<number>();
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLocked(false);
      return;
    }
    const arm = () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setLocked(true), IDLE_MS);
    };
    const activity = () => {
      setLocked(false);
      arm();
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now();
      // Back from another tab or app after a while: show the lock until there's activity.
      else if (hiddenAt.current && Date.now() - hiddenAt.current >= IDLE_MS) setLocked(true);
    };
    for (const ev of ACTIVITY) window.addEventListener(ev, activity, { passive: true, capture: true });
    document.addEventListener('visibilitychange', visibility);
    arm();
    return () => {
      window.clearTimeout(timer.current);
      for (const ev of ACTIVITY) window.removeEventListener(ev, activity, { capture: true });
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [enabled]);

  if (!locked) return null;
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/25 backdrop-blur-xl" role="dialog" aria-modal="true" aria-label="Locked">
      <button
        type="button"
        onClick={() => setLocked(false)}
        className="flex flex-col items-center gap-3 rounded-2xl px-8 py-6 text-white focus:outline-none"
        aria-label="Unlock"
      >
        <span className="grid size-20 place-items-center rounded-full bg-white/20 shadow-lg ring-1 ring-white/40 backdrop-blur-md">
          <Lock className="size-9" />
        </span>
        <span className="text-[15px] font-medium drop-shadow">Move or tap to continue</span>
      </button>
    </div>
  );
}
