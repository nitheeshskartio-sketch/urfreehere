import { SITE } from './config';

/** Humble logo: a honey bee in the brand purple. Drawn with shapes so it renders identically everywhere. */
export function SiteMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="rgb(var(--c-accent))" />
      <ellipse cx="9.8" cy="13.2" rx="4.8" ry="3" transform="rotate(-30 9.8 13.2)" fill="#fff" fillOpacity=".6" />
      <ellipse cx="22.2" cy="13.2" rx="4.8" ry="3" transform="rotate(30 22.2 13.2)" fill="#fff" fillOpacity=".6" />
      <path d="M14.7 7.4 12.8 4.6M17.3 7.4l1.9-2.8" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="12.6" cy="4.3" r="1.05" fill="#fff" /><circle cx="19.4" cy="4.3" r="1.05" fill="#fff" />
      <circle cx="16" cy="9.7" r="2.9" fill="#fff" stroke="rgb(var(--c-accent))" strokeWidth=".9" />
      <ellipse cx="16" cy="19.6" rx="5.6" ry="7.1" fill="#fff" stroke="rgb(var(--c-accent))" strokeWidth="1.1" />
      <rect x="10.8" y="16.2" width="10.4" height="2.2" rx="1.1" fill="rgb(var(--c-accent))" />
      <rect x="10.7" y="20.1" width="10.6" height="2.2" rx="1.1" fill="rgb(var(--c-accent))" />
      <rect x="12.6" y="24" width="6.8" height="2" rx="1" fill="rgb(var(--c-accent))" />
      <path d="M15.1 26.6 16 28.7 16.9 26.6Z" fill="#fff" />
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
