import { SmilePlus, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useEngine } from '../hooks';
import { MOODS, type UserId } from '../lib/types';

/**
 * Wraps a profile picture and shows the emoji that person set for the chat
 * with me. Nothing shows until they pick one.
 */
export function MoodBadge({ peer, size = 'md', children }: { peer: UserId | undefined; size?: 'sm' | 'md'; children: ReactNode }) {
  const e = useEngine();
  const emoji = peer ? e.moodIn(peer, peer) : null;
  return (
    <span className="relative inline-flex shrink-0">
      {children}
      {emoji && (
        <span
          className={`absolute -right-1 -top-1 grid place-items-center rounded-full bg-panel leading-none shadow-sm ring-1 ring-line ${size === 'sm' ? 'size-[18px] text-[11px]' : 'size-[22px] text-[13px]'}`}
          title={`${e.nameOf(peer!).split(' ')[0]}'s emoji for you`}
          aria-label={`${e.nameOf(peer!)}'s emoji: ${emoji}`}
          role="img"
        >
          {emoji}
        </span>
      )}
    </span>
  );
}

function MoodGrid({ peer, onPicked }: { peer: UserId; onPicked?: () => void }) {
  const e = useEngine();
  const mine = e.moodIn(peer, e.me);
  const pick = (emoji: string | null) => {
    void e.setMood(peer, emoji);
    onPicked?.();
  };
  return (
    <div>
      <div className="grid grid-cols-5 gap-1">
        {MOODS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => pick(mine === m ? null : m)}
            aria-pressed={mine === m}
            aria-label={`Set ${m}`}
            className={`grid size-9 place-items-center rounded-md text-xl transition-colors hover:bg-surface ${mine === m ? 'bg-accent-soft ring-1 ring-accent' : ''}`}
          >
            {m}
          </button>
        ))}
      </div>
      {mine && (
        <button type="button" onClick={() => pick(null)} className="mt-2 flex items-center gap-1 text-[12.5px] text-muted hover:text-ink">
          <X className="size-3.5" />
          Remove my emoji
        </button>
      )}
    </div>
  );
}

/** Header button: pick the emoji the other person will see on my picture. */
export function MoodButton({ peer }: { peer: UserId }) {
  const e = useEngine();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const mine = e.moodIn(peer, e.me);
  useEffect(() => {
    if (!open) return;
    const close = (ev: MouseEvent | TouchEvent) => !ref.current?.contains(ev.target as Node) && setOpen(false);
    const esc = (ev: KeyboardEvent) => ev.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={mine ? `Your emoji for ${e.nameOf(peer)}: ${mine}. Change it` : `Set an emoji for ${e.nameOf(peer)}`}
        title={mine ? 'Your emoji for this chat' : 'Set an emoji they’ll see on your picture'}
        className="grid size-9 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink"
      >
        {mine ? <span className="text-lg leading-none">{mine}</span> : <SmilePlus className="size-5" />}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-[232px] rounded-lg border border-line bg-panel p-3 shadow-pop" role="dialog" aria-label="Your emoji">
          <p className="mb-2 text-[12.5px] text-muted">{e.nameOf(peer).split(' ')[0]} sees this on your picture.</p>
          <MoodGrid peer={peer} onPicked={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

/** Contact info section: their emoji for me, and mine for them. */
export function MoodSection({ peer }: { peer: UserId }) {
  const e = useEngine();
  const first = e.nameOf(peer).split(' ')[0];
  const theirs = e.moodIn(peer, peer);
  return (
    <section className="border-t border-line px-4 py-4">
      <h3 className="mb-2 text-[13px] font-semibold text-ink-soft">Emoji</h3>
      <p className="mb-3 text-[13px] text-muted">
        {theirs ? (
          <>
            {first}’s emoji for you: <span className="text-lg align-middle">{theirs}</span>
          </>
        ) : (
          `${first} hasn’t set an emoji for you yet.`
        )}
      </p>
      <p className="mb-2 text-[13px] font-medium">Your emoji for {first}</p>
      <MoodGrid peer={peer} />
    </section>
  );
}
