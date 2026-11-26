import { Megaphone, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Announcement {
  text: string;
  tone: 'info' | 'warning' | 'success';
  updatedAt: number;
}

const BASE: string = import.meta.env.VITE_SIGNALING_URL || '';
const KEY = 'urfree.announcement.dismissed';
const TONE = {
  info: 'border-accent/30 [&_svg]:text-accent',
  warning: 'border-warning/40 [&_svg]:text-warning',
  success: 'border-success/40 [&_svg]:text-success',
};

/** Site-wide message from the admin console. Each new message shows once until dismissed. */
export function AnnouncementBanner() {
  const [a, setA] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState(() => Number(localStorage.getItem(KEY)) || 0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`${BASE}/api/site`)
        .then((r) => (r.ok ? r.json() : null))
        .then((s: { announcement?: Announcement | null } | null) => alive && s && setA(s.announcement ?? null))
        .catch(() => {});
    void load();
    const t = window.setInterval(load, 5 * 60 * 1000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  if (!a || a.updatedAt === dismissed) return null;
  const close = () => {
    localStorage.setItem(KEY, String(a.updatedAt));
    setDismissed(a.updatedAt);
  };
  return (
    <div role="status" className={`fixed bottom-5 left-5 z-40 flex max-w-[min(420px,calc(100vw-110px))] items-start gap-2.5 rounded-lg border bg-panel px-3.5 py-3 text-[13.5px] text-ink shadow-pop ${TONE[a.tone]}`}>
      <Megaphone className="mt-0.5 size-4 shrink-0" />
      <p className="flex-1 whitespace-pre-wrap break-words">{a.text}</p>
      <button type="button" onClick={close} className="-mr-1 -mt-0.5 rounded p-1 text-muted hover:bg-surface hover:text-ink [&_svg]:!text-current" aria-label="Dismiss announcement">
        <X className="size-4" />
      </button>
    </div>
  );
}
