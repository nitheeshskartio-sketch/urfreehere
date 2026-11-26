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
 * Like / dislike meter under a contact's name. Tap as often as you like: each
 * tap adds one, and they see your totals on your profile.
 */
export function ProfileMeter({ peer, canTap }: { peer: UserId; canTap: boolean }) {
  const e = useEngine();
  const first = e.nameOf(peer).split(' ')[0];
  const mine = e.meterOf(peer, e.me);
  const theirs = e.meterOf(peer, peer);
  const fx = useRef<HTMLDivElement>(null);

  const tap = (which: 'like' | 'dislike', ev?: PointerEvent<HTMLButtonElement>) => {
    e.bumpMeter(peer, which);
    // A little "+1" floats up from where you tapped.
    const box = fx.current;
    if (!box || !ev || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const r = box.getBoundingClientRect();
    const s = document.createElement('span');
    s.textContent = which === 'like' ? '👍 +1' : '👎 +1';
    s.className = `pointer-events-none absolute text-sm font-bold ${which === 'like' ? 'text-success' : 'text-danger'}`;
    s.style.left = `${ev.clientX - r.left - 16}px`;
    s.style.top = `${ev.clientY - r.top - 14}px`;
    box.appendChild(s);
    s.animate(
      [
        { transform: 'translateY(0) scale(0.8)', opacity: 1 },
        { transform: `translate(${Math.random() * 30 - 15}px, -46px) scale(1.15)`, opacity: 0 },
      ],
      { duration: 700, easing: 'ease-out' },
    ).finished.then(() => s.remove(), () => s.remove());
  };

  const pill = (which: 'like' | 'dislike') => {
    const like = which === 'like';
    const n = like ? mine.likes : mine.dislikes;
    const cls = `flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold tabular-nums transition-transform ${
      like ? 'border-success/40 text-success' : 'border-danger/40 text-danger'
    }`;
    if (!canTap)
      return (
        <span className={cls}>
          {like ? <ThumbsUp className="size-4" /> : <ThumbsDown className="size-4" />}
          {fmt(n)}
        </span>
      );
    return (
      <button
        type="button"
        onPointerDown={(ev) => tap(which, ev)}
        onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && tap(which)}
        className={`${cls} ${like ? 'hover:bg-success-soft' : 'hover:bg-danger-soft'} active:scale-90`}
        aria-label={`${like ? 'Like' : 'Dislike'} ${first} (${n} so far)`}
        title={like ? `Like ${first}` : `Dislike ${first}`}
      >
        {like ? <ThumbsUp className="size-4" /> : <ThumbsDown className="size-4" />}
        {fmt(n)}
      </button>
    );
  };

  return (
    <div ref={fx} className="relative mt-3 w-full max-w-[280px]">
      <div className="flex items-center gap-2">
        {pill('like')}
        <Bar m={mine} className="flex-1" />
        {pill('dislike')}
      </div>
      <p className="mt-2 text-[12.5px] text-ink-soft">
        {first} gave you <span className="font-semibold text-success">👍 {fmt(theirs.likes)}</span> · <span className="font-semibold text-danger">👎 {fmt(theirs.dislikes)}</span>
      </p>
      {canTap && <p className="mt-0.5 text-[11.5px] text-muted">Tap 👍 or 👎 as many times as you like</p>}
    </div>
  );
}

/** Like / dislike counts shown right after a contact's name: what they gave me. */
export function MeterInline({ peer }: { peer: UserId }) {
  const e = useEngine();
  const m = e.meterOf(peer, peer);
  return (
    <span className="inline-flex shrink-0 items-center gap-2 text-[12.5px] font-semibold tabular-nums" title={`${e.nameOf(peer).split(' ')[0]} gave you ${m.likes} likes and ${m.dislikes} dislikes`}>
      <span className="text-success">👍 {fmt(m.likes)}</span>
      <span className="text-danger">👎 {fmt(m.dislikes)}</span>
    </span>
  );
}
