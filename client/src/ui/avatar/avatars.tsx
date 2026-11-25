import type { ReactElement } from 'react';

/**
 * Avatar reference: "ill:<id>" built-in illustration, "gen:<seed>" generated pattern,
 * "data:image/…" uploaded picture, or null for initials.
 */
export type AvatarRef = string | null;

/**
 * Built-in avatar illustrations, drawn as small inline SVGs (no image files
 * to download). Referenced as "ill:<id>"; random avatars are "gen:<seed>".
 */

type Art = () => ReactElement;

const ink = '#172033';

const geometric: Record<string, Art> = {
  'geo-1': () => (
    <>
      <rect width="64" height="64" fill="#DBEAFE" />
      <circle cx="22" cy="24" r="14" fill="#2563EB" />
      <rect x="30" y="30" width="24" height="24" rx="4" fill="#93C5FD" />
    </>
  ),
  'geo-2': () => (
    <>
      <rect width="64" height="64" fill="#FEF3C7" />
      <path d="M8 52 32 10l24 42z" fill="#F59E0B" />
      <circle cx="32" cy="40" r="9" fill="#FDE68A" />
    </>
  ),
  'geo-3': () => (
    <>
      <rect width="64" height="64" fill="#DCFCE7" />
      <rect x="-8" y="28" width="80" height="12" fill="#16A34A" transform="rotate(-30 32 32)" />
      <circle cx="46" cy="18" r="8" fill="#86EFAC" />
    </>
  ),
  'geo-4': () => (
    <>
      <rect width="64" height="64" fill="#FCE7F3" />
      <circle cx="32" cy="32" r="20" fill="none" stroke="#DB2777" strokeWidth="6" />
      <circle cx="32" cy="32" r="7" fill="#F9A8D4" />
    </>
  ),
  'geo-5': () => (
    <>
      <rect width="64" height="64" fill="#E0E7FF" />
      <path d="M0 64V40c12-8 20 8 32 0s20-8 32 0v24z" fill="#4F46E5" />
      <circle cx="20" cy="20" r="7" fill="#A5B4FC" />
    </>
  ),
  'geo-6': () => (
    <>
      <rect width="64" height="64" fill="#CCFBF1" />
      <rect x="12" y="12" width="18" height="18" rx="3" fill="#0D9488" />
      <rect x="34" y="12" width="18" height="18" rx="9" fill="#5EEAD4" />
      <rect x="12" y="34" width="18" height="18" rx="9" fill="#5EEAD4" />
      <rect x="34" y="34" width="18" height="18" rx="3" fill="#0D9488" />
    </>
  ),
  'geo-7': () => (
    <>
      <rect width="64" height="64" fill="#FFE4E6" />
      <path d="M32 6a26 26 0 0 1 0 52z" fill="#E11D48" />
      <circle cx="32" cy="32" r="10" fill="#FDA4AF" />
    </>
  ),
  'geo-8': () => (
    <>
      <rect width="64" height="64" fill="#F1F5F9" />
      <path d="M10 46 24 18l14 28z" fill="#334155" />
      <path d="M30 46 42 26l12 20z" fill="#94A3B8" />
    </>
  ),
};

const animals: Record<string, Art> = {
  cat: () => (
    <>
      <rect width="64" height="64" fill="#FEF3C7" />
      <path d="M16 26 18 10l12 10zM48 26 46 10 34 20z" fill="#F59E0B" />
      <circle cx="32" cy="36" r="19" fill="#F59E0B" />
      <circle cx="25" cy="33" r="2.6" fill={ink} />
      <circle cx="39" cy="33" r="2.6" fill={ink} />
      <path d="m30 39 2 2 2-2z" fill="#E11D48" />
      <path d="M17 38h8M17 42l8-1M47 38h-8M47 42l-8-1" stroke="#92400E" strokeWidth="1.2" strokeLinecap="round" />
    </>
  ),
  fox: () => (
    <>
      <rect width="64" height="64" fill="#DBEAFE" />
      <path d="M13 14 24 26l-8 6zM51 14 40 26l8 6z" fill="#EA580C" />
      <path d="M12 26c6 18 12 26 20 26s14-8 20-26c-6-4-13-6-20-6s-14 2-20 6z" fill="#F97316" />
      <path d="M20 38c4 8 8 14 12 14s8-6 12-14c-4 2-8 3-12 3s-8-1-12-3z" fill="#fff" />
      <circle cx="25" cy="33" r="2.4" fill={ink} />
      <circle cx="39" cy="33" r="2.4" fill={ink} />
      <circle cx="32" cy="45" r="2.6" fill={ink} />
    </>
  ),
  bear: () => (
    <>
      <rect width="64" height="64" fill="#E0E7FF" />
      <circle cx="17" cy="19" r="7" fill="#92400E" />
      <circle cx="47" cy="19" r="7" fill="#92400E" />
      <circle cx="32" cy="35" r="20" fill="#B45309" />
      <ellipse cx="32" cy="42" rx="9" ry="7" fill="#FCD34D" />
      <circle cx="25" cy="32" r="2.4" fill={ink} />
      <circle cx="39" cy="32" r="2.4" fill={ink} />
      <ellipse cx="32" cy="39.5" rx="3" ry="2.2" fill={ink} />
    </>
  ),
  panda: () => (
    <>
      <rect width="64" height="64" fill="#DCFCE7" />
      <circle cx="16" cy="18" r="7" fill={ink} />
      <circle cx="48" cy="18" r="7" fill={ink} />
      <circle cx="32" cy="35" r="20" fill="#fff" />
      <ellipse cx="24" cy="33" rx="5" ry="6.5" fill={ink} transform="rotate(-20 24 33)" />
      <ellipse cx="40" cy="33" rx="5" ry="6.5" fill={ink} transform="rotate(20 40 33)" />
      <circle cx="24.5" cy="32" r="1.6" fill="#fff" />
      <circle cx="39.5" cy="32" r="1.6" fill="#fff" />
      <ellipse cx="32" cy="42" rx="3" ry="2" fill={ink} />
    </>
  ),
  rabbit: () => (
    <>
      <rect width="64" height="64" fill="#FCE7F3" />
      <rect x="19" y="4" width="9" height="26" rx="4.5" fill="#fff" />
      <rect x="36" y="4" width="9" height="26" rx="4.5" fill="#fff" />
      <rect x="21.5" y="8" width="4" height="18" rx="2" fill="#F9A8D4" />
      <rect x="38.5" y="8" width="4" height="18" rx="2" fill="#F9A8D4" />
      <circle cx="32" cy="39" r="17" fill="#fff" />
      <circle cx="26" cy="37" r="2.3" fill={ink} />
      <circle cx="38" cy="37" r="2.3" fill={ink} />
      <path d="m30 42 2 2 2-2z" fill="#DB2777" />
    </>
  ),
  owl: () => (
    <>
      <rect width="64" height="64" fill="#FEF9C3" />
      <path d="M14 18 22 24M50 18l-8 6" stroke="#78350F" strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="32" cy="38" rx="19" ry="20" fill="#A16207" />
      <circle cx="24" cy="33" r="7.5" fill="#fff" />
      <circle cx="40" cy="33" r="7.5" fill="#fff" />
      <circle cx="24" cy="33" r="3.5" fill={ink} />
      <circle cx="40" cy="33" r="3.5" fill={ink} />
      <path d="m29 40 3 5 3-5z" fill="#F59E0B" />
    </>
  ),
  penguin: () => (
    <>
      <rect width="64" height="64" fill="#CFFAFE" />
      <ellipse cx="32" cy="38" rx="20" ry="22" fill="#1E293B" />
      <path d="M18 40c0-10 6-16 14-16s14 6 14 16-6 16-14 16-14-6-14-16z" fill="#fff" />
      <circle cx="26" cy="36" r="2.4" fill={ink} />
      <circle cx="38" cy="36" r="2.4" fill={ink} />
      <path d="m28 41 4 4 4-4z" fill="#F59E0B" />
    </>
  ),
  frog: () => (
    <>
      <rect width="64" height="64" fill="#ECFCCB" />
      <circle cx="21" cy="22" r="8" fill="#4D7C0F" />
      <circle cx="43" cy="22" r="8" fill="#4D7C0F" />
      <ellipse cx="32" cy="38" rx="21" ry="16" fill="#65A30D" />
      <circle cx="21" cy="22" r="4.5" fill="#fff" />
      <circle cx="43" cy="22" r="4.5" fill="#fff" />
      <circle cx="21" cy="22" r="2.2" fill={ink} />
      <circle cx="43" cy="22" r="2.2" fill={ink} />
      <path d="M22 41c6 5 14 5 20 0" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
};

const person = (bg: string, skin: string, hair: string, shirt: string, style: number): Art =>
  function Person() {
    return (
      <>
        <rect width="64" height="64" fill={bg} />
        <path d="M10 64c2-12 11-18 22-18s20 6 22 18z" fill={shirt} />
        <rect x="28" y="38" width="8" height="9" fill={skin} />
        <circle cx="32" cy="28" r="12" fill={skin} />
        {style === 0 && <path d="M20 27c0-9 5-14 12-14s12 5 12 14c-3-5-7-7-12-7s-9 2-12 7z" fill={hair} />}
        {style === 1 && <path d="M19 30c-1-11 5-18 13-18s14 7 13 18v12h-5V25c-4 2-12 2-16 0v17h-5z" fill={hair} />}
        {style === 2 && <circle cx="32" cy="14" r="6" fill={hair} />}
        {style === 2 && <path d="M20 26c0-7 5-12 12-12s12 5 12 12c-4-3-8-4-12-4s-8 1-12 4z" fill={hair} />}
        {style === 3 && <path d="M18 28c0-10 6-16 14-16s14 6 14 16c-2-2-3-5-3-8-4 3-17 3-22 0 0 3-1 6-3 8z" fill={hair} />}
        <circle cx="27.5" cy="29" r="1.6" fill={ink} />
        <circle cx="36.5" cy="29" r="1.6" fill={ink} />
        <path d="M28.5 34c2 1.5 5 1.5 7 0" fill="none" stroke={ink} strokeWidth="1.4" strokeLinecap="round" />
      </>
    );
  };

const people: Record<string, Art> = {
  'person-1': person('#DBEAFE', '#F2C6A0', '#3F2A1D', '#2563EB', 0),
  'person-2': person('#FCE7F3', '#E0A989', '#111827', '#DB2777', 1),
  'person-3': person('#DCFCE7', '#8D5524', '#1F2937', '#16A34A', 2),
  'person-4': person('#FEF3C7', '#FAD7B5', '#B45309', '#F59E0B', 3),
  'person-5': person('#E0E7FF', '#C68642', '#0F172A', '#4F46E5', 0),
  'person-6': person('#F1F5F9', '#EAC0A0', '#9CA3AF', '#334155', 1),
};

const characters: Record<string, Art> = {
  robot: () => (
    <>
      <rect width="64" height="64" fill="#E2E8F0" />
      <path d="M32 9v8" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="32" cy="8" r="3" fill="#EF4444" />
      <rect x="14" y="17" width="36" height="32" rx="8" fill="#94A3B8" />
      <rect x="19" y="24" width="26" height="12" rx="6" fill="#1E293B" />
      <circle cx="26" cy="30" r="3" fill="#38BDF8" />
      <circle cx="38" cy="30" r="3" fill="#38BDF8" />
      <rect x="24" y="40" width="16" height="3" rx="1.5" fill="#475569" />
      <rect x="9" y="27" width="5" height="10" rx="2" fill="#64748B" />
      <rect x="50" y="27" width="5" height="10" rx="2" fill="#64748B" />
    </>
  ),
  alien: () => (
    <>
      <rect width="64" height="64" fill="#EDE9FE" />
      <ellipse cx="32" cy="34" rx="19" ry="22" fill="#4ADE80" />
      <ellipse cx="24" cy="32" rx="6" ry="8" fill={ink} transform="rotate(-25 24 32)" />
      <ellipse cx="40" cy="32" rx="6" ry="8" fill={ink} transform="rotate(25 40 32)" />
      <path d="M28 46c2.5 1.5 5.5 1.5 8 0" fill="none" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  ghost: () => (
    <>
      <rect width="64" height="64" fill="#E0F2FE" />
      <path d="M16 54V30a16 16 0 0 1 32 0v24l-5.3-4-5.4 4-5.3-4-5.3 4-5.4-4z" fill="#fff" />
      <ellipse cx="26" cy="30" rx="2.8" ry="4" fill={ink} />
      <ellipse cx="38" cy="30" rx="2.8" ry="4" fill={ink} />
      <ellipse cx="32" cy="40" rx="3" ry="2" fill="#F9A8D4" />
    </>
  ),
  monster: () => (
    <>
      <rect width="64" height="64" fill="#FCE7F3" />
      <path d="M12 54c0-24 8-38 20-38s20 14 20 38z" fill="#A855F7" />
      <path d="M22 18l-4-8 9 5M42 18l4-8-9 5" fill="#7E22CE" />
      <circle cx="32" cy="32" r="8" fill="#fff" />
      <circle cx="33" cy="33" r="3.6" fill={ink} />
      <path d="M22 44h20v3l-3 3-3-3-4 3-4-3-3 3-3-3z" fill="#fff" />
    </>
  ),
  astronaut: () => (
    <>
      <rect width="64" height="64" fill="#1E293B" />
      <circle cx="12" cy="14" r="1.2" fill="#fff" />
      <circle cx="52" cy="10" r="1" fill="#fff" />
      <circle cx="54" cy="48" r="1.2" fill="#fff" />
      <path d="M14 64c2-10 9-15 18-15s16 5 18 15z" fill="#E2E8F0" />
      <circle cx="32" cy="30" r="18" fill="#F8FAFC" />
      <rect x="19" y="21" width="26" height="18" rx="9" fill="#0EA5E9" />
      <path d="M23 26c3-2 6-2 9-1" stroke="#BAE6FD" strokeWidth="2" strokeLinecap="round" fill="none" />
    </>
  ),
  cactus: () => (
    <>
      <rect width="64" height="64" fill="#FFEDD5" />
      <rect x="23" y="12" width="18" height="38" rx="9" fill="#16A34A" />
      <path d="M23 34h-5a5 5 0 0 1-5-5v-6a3 3 0 0 1 6 0v5h4M41 30h5a5 5 0 0 0 5-5v-4a3 3 0 0 0-6 0v3h-4" fill="#16A34A" />
      <circle cx="28.5" cy="28" r="1.7" fill={ink} />
      <circle cx="35.5" cy="28" r="1.7" fill={ink} />
      <path d="M29 33c2 1.5 4 1.5 6 0" fill="none" stroke={ink} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M18 48h28l-3 12H21z" fill="#C2410C" />
    </>
  ),
};

export const AVATAR_SETS: { label: string; items: Record<string, Art> }[] = [
  { label: 'Animals', items: animals },
  { label: 'People', items: people },
  { label: 'Characters', items: characters },
  { label: 'Shapes', items: geometric },
];

const allArt: Record<string, Art> = { ...geometric, ...animals, ...people, ...characters };

export function hasIllustration(id: string) {
  return id in allArt;
}

// ---- generated avatars ------------------------------------------------------

const PALETTES = [
  ['#DBEAFE', '#2563EB', '#93C5FD'],
  ['#DCFCE7', '#16A34A', '#86EFAC'],
  ['#FEF3C7', '#D97706', '#FCD34D'],
  ['#FCE7F3', '#DB2777', '#F9A8D4'],
  ['#E0E7FF', '#4F46E5', '#A5B4FC'],
  ['#CCFBF1', '#0D9488', '#5EEAD4'],
  ['#FFE4E6', '#E11D48', '#FDA4AF'],
  ['#EDE9FE', '#7C3AED', '#C4B5FD'],
];

function prng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function Generated({ seed }: { seed: string }) {
  const r = prng(seed);
  const [bg, a, b] = PALETTES[Math.floor(r() * PALETTES.length)];
  const shapes = [];
  for (let i = 0; i < 3; i++) {
    const x = 10 + r() * 44;
    const y = 10 + r() * 44;
    const s = 10 + r() * 16;
    const fill = i % 2 ? b : a;
    const kind = Math.floor(r() * 3);
    if (kind === 0) shapes.push(<circle key={i} cx={x} cy={y} r={s / 1.6} fill={fill} />);
    else if (kind === 1)
      shapes.push(<rect key={i} x={x - s / 2} y={y - s / 2} width={s} height={s} rx={3} fill={fill} transform={`rotate(${Math.round(r() * 90)} ${x} ${y})`} />);
    else shapes.push(<path key={i} d={`M${x} ${y - s / 1.4}l${s / 1.2} ${s * 1.2}h${-s * 1.66}z`} fill={fill} />);
  }
  return (
    <>
      <rect width="64" height="64" fill={bg} />
      {shapes}
    </>
  );
}

export function randomAvatarRef(): string {
  return `gen:${Math.random().toString(36).slice(2, 10)}`;
}

/** Renders an "ill:" or "gen:" avatar reference; null for anything else. */
export function AvatarArt({ refId }: { refId: string }) {
  let content: ReactElement | null = null;
  if (refId.startsWith('ill:')) {
    const art = allArt[refId.slice(4)];
    if (art) content = art();
  } else if (refId.startsWith('gen:')) {
    content = <Generated seed={refId.slice(4)} />;
  }
  if (!content) return null;
  return (
    <svg viewBox="0 0 64 64" className="size-full" aria-hidden="true">
      {content}
    </svg>
  );
}

const INITIAL_COLORS = ['#2563EB', '#16A34A', '#D97706', '#DB2777', '#4F46E5', '#0D9488', '#E11D48', '#7C3AED', '#475569'];

export function initialsColor(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return INITIAL_COLORS[h % INITIAL_COLORS.length];
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
