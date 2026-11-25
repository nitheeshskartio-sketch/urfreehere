import { SITE } from './config';

/** UR Free Here monogram. Drawn with paths so it renders identically everywhere. */
export function SiteMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="rgb(var(--c-ink))" />
      <path d="M7.5 10.5v6.25a4 4 0 0 0 8 0V10.5" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
      <path
        d="M19 22V10.5h3.75a3.4 3.4 0 0 1 0 6.8H19m3.6 0 3.15 4.7"
        fill="none"
        stroke="rgb(var(--c-accent-soft))"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SiteLogo() {
  return (
    <span className="flex items-center gap-2.5">
      <SiteMark className="size-8" />
      <span className="text-[15px] font-semibold tracking-tight">{SITE.name}</span>
    </span>
  );
}
