/**
 * Coffee cup illustration (inline SVG). With `pour`, the coffee fills the cup
 * and the steam rises; change `pourKey` to pour again.
 */
export function CoffeeCup({ className = 'size-28', pour = false, pourKey = 0 }: { className?: string; pour?: boolean; pourKey?: number }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true" key={pourKey}>
      <defs>
        <clipPath id={`cup-inside-${pourKey}`}>
          <path d="M28 44h64l-7 42a12 12 0 0 1-12 10H47a12 12 0 0 1-12-10z" />
        </clipPath>
      </defs>
      <g fill="none" stroke="#C9A27A" strokeWidth="4" strokeLinecap="round" className="coffee-steam">
        <path d="M46 30c-6-7 6-11 0-19" />
        <path d="M60 28c-6-7 6-11 0-19" />
        <path d="M74 30c-6-7 6-11 0-19" />
      </g>
      {pour && <path d="M60 0v44" stroke="#6F4E37" strokeWidth="5" strokeLinecap="round" className="coffee-stream" />}
      <ellipse cx="60" cy="100" rx="44" ry="9" fill="#E9DCCB" />
      <ellipse cx="60" cy="98" rx="34" ry="5.5" fill="#D8C6AE" />
      <path d="M90 52h6a13 13 0 0 1 0 26h-7" fill="none" stroke="#F5F0E8" strokeWidth="7" strokeLinecap="round" />
      {/* Cup body */}
      <path d="M26 42h68l-7 44a12 12 0 0 1-12 10H45a12 12 0 0 1-12-10z" fill="#F5F0E8" stroke="#E2D5C3" strokeWidth="2" />
      {/* Coffee: fills up when pouring */}
      <g clipPath={`url(#cup-inside-${pourKey})`}>
        <rect x="20" y="44" width="80" height="56" fill="#6F4E37" className={pour ? 'coffee-fill' : ''} />
        <rect x="20" y="44" width="80" height="6" fill="#A57B5A" className={pour ? 'coffee-fill' : ''} />
      </g>
      <ellipse cx="60" cy="42" rx="34" ry="7" fill="#F5F0E8" stroke="#E2D5C3" strokeWidth="2" />
      <ellipse cx="60" cy="42.5" rx="29" ry="4.5" fill="#8B6248" className={pour ? 'coffee-top' : ''} />
      <path d="M50 66c0-5 4.5-8 10-3 5.5-5 10-2 10 3 0 5.5-10 12-10 12s-10-6.5-10-12z" fill="#FF5E5B" className={pour ? 'coffee-heart' : ''} />
    </svg>
  );
}
