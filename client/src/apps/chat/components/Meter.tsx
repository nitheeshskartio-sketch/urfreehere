import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useRef, type PointerEvent } from 'react';
import { useEngine } from '../hooks';
import type { Meter, UserId } from '../lib/types';

function Bar({ m, className = '' }: { m: Meter; className?: string }) {
  const total = m.likes + m.dislikes;
  const pct = total ? Math.round((m.likes / total) * 100) : 50;
  return (
    <span className={`flex h-2 overflow-hidden rounded-full bg-surface ${className}`} aria-hidden>
      {total > 0 && (
        <>
          <span className="h-full bg-success transition-[width] duration-500" style={{ width: `${pct}%` }} />
          <span className="h-full flex-1 bg-danger transition-[width] duration-500" />
        </>
      )}
    </span>
  );
}

const fmt = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString());

/**
 * Like / dislike meter on a contact's profile. Tap as often as you like: each
 * tap adds one, and they see your totals on your profile.
 */
export function MeterSection({ peer, canTap }: { peer: UserId; canTap: boolean }) {
  const e = useEngine();
  const first = e.nameOf(peer).split(' ')[0];
  const mine = e.meterOf(peer, e.me);
  const theirs = e.meterOf(peer, peer);
  const fx = useRef<HTMLDivElement>(null);

  const tap = (which: 'like' | 'dislike', ev: PointerEvent<HTMLButtonElement>) => {
    e.bumpMeter(peer, which);
    // A little "+1" floats up from the button.
    const box = fx.current;
    if (!box || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const r = box.getBoundingClientRect();
    const s = document.createElement('span');
    s.textContent = which === 'like' ? '👍 +1' : '👎 +1';
    s.className = `pointer-events-none absolute text-sm font-bold ${which === 'like' ? 'text-success' : 'text-danger'}`;
    s.style.left = `${ev.clientX - r.left - 16}px`;
    s.style.top = `${ev.clientY - r.top - 12}px`;
    box.appendChild(s);
    s.animate(
      [
        { transform: 'translateY(0) scale(0.8)', opacity: 1 },
        { transform: `translate(${Math.random() * 30 - 15}px, -46px) scale(1.15)`, opacity: 0 },
      ],
      { duration: 700, easing: 'ease-out' },
    ).finished.then(() => s.remove(), () => s.remove());
  };

  return (
    <section className="border-t border-line px-4 py-4">
      <h3 className="mb-2 text-[13px] font-semibold text-ink-soft">Like meter</h3>
      <div ref={fx} className="relative rounded-lg border border-line p-3">
        <p className="text-[12.5px] text-muted">From you to {first}</p>
        <div className="mt-1 flex items-center justify-between text-[15px] font-semibold tabular-nums">
          <span className="text-success">👍 {fmt(mine.likes)}</span>
          <span className="text-danger">{fmt(mine.dislikes)} 👎</span>
        </div>
        <Bar m={mine} className="mt-1.5" />
        {canTap && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onPointerDown={(ev) => tap('like', ev)}
              onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && e.bumpMeter(peer, 'like')}
              className="flex items-center justify-center gap-1.5 rounded-md border border-line py-2 text-[13.5px] font-semibold text-success transition-transform hover:bg-success-soft active:scale-95"
              aria-label={`Like ${first}`}
            >
              <ThumbsUp className="size-4" /> Like
            </button>
            <button
              type="button"
              onPointerDown={(ev) => tap('dislike', ev)}
              onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && e.bumpMeter(peer, 'dislike')}
              className="flex items-center justify-center gap-1.5 rounded-md border border-line py-2 text-[13.5px] font-semibold text-danger transition-transform hover:bg-danger-soft active:scale-95"
              aria-label={`Dislike ${first}`}
            >
              <ThumbsDown className="size-4" /> Dislike
            </button>
          </div>
        )}
        {canTap && <p className="mt-2 text-[12px] text-muted">Tap as many times as you like. {first} sees these totals on your profile.</p>}
      </div>
      <div className="mt-3 px-1">
        <div className="flex items-center justify-between text-[12.5px]">
          <span className="text-muted">From {first} to you</span>
          <span className="font-semibold tabular-nums">
            <span className="text-success">👍 {fmt(theirs.likes)}</span>
            <span className="mx-1.5 text-muted">·</span>
            <span className="text-danger">👎 {fmt(theirs.dislikes)}</span>
          </span>
        </div>
        <Bar m={theirs} className="mt-1.5 !h-1.5" />
      </div>
    </section>
  );
}

/** Compact totals under a contact's name (what I gave them). */
export function MeterChips({ peer }: { peer: UserId }) {
  const e = useEngine();
  const m = e.meterOf(peer, e.me);
  if (!m.likes && !m.dislikes) return null;
  return (
    <p className="mt-2 flex items-center justify-center gap-3 text-[13px] font-semibold tabular-nums" title="Your likes and dislikes for them">
      <span className="text-success">👍 {fmt(m.likes)}</span>
      <span className="text-danger">👎 {fmt(m.dislikes)}</span>
    </p>
  );
}
