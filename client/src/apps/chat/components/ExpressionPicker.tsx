import { CircleAlert, LoaderCircle, RotateCcw, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { EMOJI, recentEmoji, rememberEmoji, searchEmoji } from '../lib/emoji';
import { GifLoadError, gifErrorText, loadGifs, type GifItem } from '../lib/giphy';

type Tab = 'emoji' | 'gifs' | 'stickers';

/**
 * Teams-style expressions picker: emoji, GIFs and stickers (GIPHY).
 * GIF results come through the server's proxy, which keeps the API key and the
 * shared hourly budget; nothing is fetched until the GIFs or Stickers tab opens.
 */
export function ExpressionPicker({
  onEmoji,
  onGif,
  onClose,
}: {
  onEmoji: (emoji: string) => void;
  onGif: (gif: GifItem, sticker: boolean) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('emoji');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!ref.current?.contains(t) && !t.closest('[data-expression-toggle]')) onClose();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Emoji, GIFs and stickers"
      className="absolute bottom-full right-0 z-40 mb-2 flex h-[420px] w-[min(380px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg border border-line bg-panel shadow-pop"
    >
      <div className="flex shrink-0 items-center border-b border-line px-2" role="tablist">
        {(
          [
            ['emoji', 'Emoji'],
            ['gifs', 'GIFs'],
            ['stickers', 'Stickers'],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`relative px-3 py-2.5 text-[13px] font-semibold transition-colors ${tab === t ? 'text-ink' : 'text-muted hover:text-ink'}`}
          >
            {label}
            {tab === t && <span className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-accent" />}
          </button>
        ))}
        <button type="button" onClick={onClose} className="ml-auto rounded-md p-1.5 text-muted hover:bg-subtle hover:text-ink" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      {tab === 'emoji' ? <EmojiGrid onPick={onEmoji} /> : <GifGrid key={tab} kind={tab} onPick={(g) => onGif(g, tab === 'stickers')} />}
    </div>
  );
}

function EmojiGrid({ onPick }: { onPick: (e: string) => void }) {
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState(recentEmoji);
  const pick = (em: string) => {
    rememberEmoji(em);
    setRecent(recentEmoji());
    onPick(em);
  };
  const results = query.trim() ? searchEmoji(query) : null;
  const button = (em: string) => (
    <button key={em} type="button" onClick={() => pick(em)} className="rounded-md p-1 text-[22px] leading-none hover:bg-subtle" aria-label={`Insert ${em}`}>
      {em}
    </button>
  );
  const groups = results ? [] : [...(recent.length ? [{ label: 'Recent', items: recent }] : []), ...EMOJI];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 pt-2">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            placeholder="Search emoji"
            aria-label="Search emoji"
            className="h-8 w-full rounded-md border border-line bg-panel pl-8 pr-2 text-[13px] placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {results &&
          (results.length ? (
            <div className="grid grid-cols-8 gap-0.5">{results.map(button)}</div>
          ) : (
            <p className="py-6 text-center text-[13px] text-muted">No emoji found for "{query}".</p>
          ))}
        {groups.map((group) => (
          <div key={group.label} className="mb-2">
            <p className="sticky top-0 bg-panel py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{group.label}</p>
            <div className="grid grid-cols-8 gap-0.5">{group.items.map(button)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GifGrid({ kind, onPick }: { kind: 'gifs' | 'stickers'; onPick: (g: GifItem) => void }) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<GifItem[] | null>(null);
  const [error, setError] = useState<GifLoadError | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Wait until typing pauses: every search spends the shared GIPHY budget.
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim().length >= 2 ? query.trim() : ''), 500);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let alive = true;
    setItems(null);
    setError(null);
    loadGifs(kind, debounced).then(
      (r) => alive && setItems(r),
      (err) => alive && setError(err instanceof GifLoadError ? err : new GifLoadError('UPSTREAM')),
    );
    return () => {
      alive = false;
    };
  }, [kind, debounced, attempt]);

  const cols: GifItem[][] = [[], []];
  const heights = [0, 0];
  for (const g of items ?? []) {
    const c = heights[0] <= heights[1] ? 0 : 1;
    cols[c].push(g);
    heights[c] += g.preview.height / g.preview.width;
  }
  const errorText = error ? gifErrorText(error) : null;

  return (
    <>
      <div className="shrink-0 px-3 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find something fun"
            aria-label={`Search ${kind === 'gifs' ? 'GIFs' : 'stickers'}`}
            maxLength={50}
            autoFocus
            className="h-9 w-full rounded-md border border-line bg-surface pl-9 pr-3 text-[13px] placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {errorText ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center" role="alert">
            <CircleAlert className="size-7 text-warning" />
            <p className="mt-3 text-sm font-semibold">{errorText.title}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{errorText.message}</p>
            {(error?.code === 'UPSTREAM' || error?.code === 'OFFLINE') && (
              <button type="button" onClick={() => setAttempt((a) => a + 1)} className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline">
                <RotateCcw className="size-3.5" />
                Try again
              </button>
            )}
          </div>
        ) : items === null ? (
          <div className="flex h-full items-center justify-center">
            <LoaderCircle className="size-6 animate-spin text-muted" />
          </div>
        ) : items.length === 0 ? (
          <p className="pt-10 text-center text-sm text-muted">No results for "{debounced}".</p>
        ) : (
          <div className="flex gap-2">
            {cols.map((col, i) => (
              <div key={i} className="flex min-w-0 flex-1 flex-col gap-2">
                {col.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => onPick(g)}
                    className={`overflow-hidden rounded-md ring-accent transition hover:ring-2 focus-visible:ring-2 ${kind === 'stickers' ? 'bg-subtle/60' : 'bg-subtle'}`}
                    style={{ aspectRatio: `${g.preview.width} / ${g.preview.height}` }}
                    aria-label={`Send ${g.title || (kind === 'gifs' ? 'GIF' : 'sticker')}`}
                    title={g.title}
                  >
                    <img src={g.preview.url} alt="" loading="lazy" referrerPolicy="no-referrer" className={`size-full ${kind === 'stickers' ? 'object-contain' : 'object-cover'}`} />
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-3 py-2 text-[11px] text-muted">
        <span>
          {kind === 'gifs' ? 'GIFs' : 'Stickers'} powered by <span className="font-bold text-ink">GIPHY</span>
        </span>
        <a href="https://support.giphy.com/hc/en-us/articles/360020027752-GIPHY-User-Terms-of-Service" target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
          View Terms
        </a>
      </div>
    </>
  );
}
