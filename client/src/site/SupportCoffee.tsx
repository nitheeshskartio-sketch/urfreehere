import { Coffee, Heart } from 'lucide-react';

/** Your Buy Me a Coffee page, e.g. https://buymeacoffee.com/yourname (set at build time). */
const COFFEE_URL: string = import.meta.env.VITE_BUY_ME_A_COFFEE_URL || '';
const valid = /^https:\/\/(www\.)?(buymeacoffee\.com|buymeacoff\.ee)\/[A-Za-z0-9_.-]+\/?$/.test(COFFEE_URL);

/** "If you like these apps, please buy me a coffee" card shown above the site footer. */
export function SupportCoffee() {
  if (!valid) {
    // Only visible while developing, as a reminder to add the link.
    if (!import.meta.env.DEV) return null;
    return (
      <div className="page pt-8">
        <p className="rounded-md border border-dashed border-warning/50 bg-warning-soft px-4 py-3 text-[13px] text-ink-soft">
          “Buy me a coffee” is hidden: set <code className="font-mono">VITE_BUY_ME_A_COFFEE_URL=https://buymeacoffee.com/yourname</code> in <code className="font-mono">.env</code> and restart.
        </p>
      </div>
    );
  }
  return (
    <div className="page pt-4">
      <div className="flex flex-col items-start gap-4 rounded-xl border border-line bg-panel p-5 shadow-card sm:flex-row sm:items-center sm:p-6">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#FFDD00]/20 text-[#B8860B]">
          <Coffee className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[15px] font-semibold">
            Enjoying these apps?
            <Heart className="size-4 fill-danger text-danger" aria-hidden="true" />
          </p>
          <p className="mt-0.5 text-sm leading-relaxed text-muted">
            If you liked this app, please buy me a coffee. It keeps UR Free Here free, ad-free and running.
          </p>
        </div>
        <a
          href={COFFEE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg bg-[#FFDD00] px-5 text-[15px] font-semibold text-black transition-[filter] hover:brightness-95"
        >
          <Coffee className="size-[18px]" />
          Buy me a coffee
        </a>
      </div>
    </div>
  );
}
