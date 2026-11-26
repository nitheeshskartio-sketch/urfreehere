import { Coffee, Heart } from 'lucide-react';

import { openCoffee } from './coffee/config';

/** "If you like these apps, please buy me a coffee" card shown above the site footer. */
export function SupportCoffee() {
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
            If you liked this app, please buy me a coffee. It keeps UR Free Here free and ad-free.
          </p>
        </div>
        <button
          type="button"
          onClick={openCoffee}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg bg-[#FFDD00] px-5 text-[15px] font-semibold text-black transition-[filter] hover:brightness-95"
        >
          <Coffee className="size-[18px]" />
          Buy me a coffee
        </button>
      </div>
    </div>
  );
}
