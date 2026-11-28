import { useEffect, useState } from 'react';

/**
 * Festive decorations: a ring and a small ornament on profile pictures, a thin
 * strip under the top bar and a greeting. Purely visual (see `[data-season]`
 * in index.css); nothing about how the app works changes.
 *
 * The admin console can pick a festival or switch them off; by default
 * ('auto') they follow the calendar below. Everyone can turn them off for
 * themselves in Settings → Appearance.
 */
export type SeasonId = 'christmas' | 'newyear' | 'onam' | 'diwali';
export type SeasonSetting = 'auto' | 'off' | SeasonId;

export interface SeasonInfo {
  id: SeasonId;
  greeting: string;
  emoji: string;
}

// Festival days that move each year (local dates). Onam: Thiruvonam day.
// Diwali: Lakshmi Puja day. Check these each year; the admin console can
// override if a date is off.
const ONAM: Record<number, string> = { 2025: '09-05', 2026: '08-26', 2027: '09-12', 2028: '08-31', 2029: '08-21', 2030: '09-09' };
const DIWALI: Record<number, string> = { 2025: '10-20', 2026: '11-08', 2027: '10-29', 2028: '10-17', 2029: '11-05', 2030: '10-26' };

const DAY = 86_400_000;
const at = (y: number, md: string) => new Date(`${y}-${md}T00:00:00`).getTime();
const near = (now: Date, table: Record<number, string>, before: number, after: number) => {
  const md = table[now.getFullYear()];
  if (!md) return false;
  const d = at(now.getFullYear(), md);
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return t >= d - before * DAY && t <= d + after * DAY;
};

/** Which festival (if any) the calendar says it is. */
export function seasonFor(now = new Date()): SeasonId | null {
  const m = now.getMonth() + 1;
  const d = now.getDate();
  if ((m === 12 && d >= 27) || (m === 1 && d <= 6)) return 'newyear';
  if (m === 12) return 'christmas'; // 1–26 December
  // Onam: the ten days from Atham to Thiruvonam, plus the day after.
  if (near(now, ONAM, 9, 1)) return 'onam';
  // Diwali: from Dhanteras to Bhai Dooj.
  if (near(now, DIWALI, 2, 2)) return 'diwali';
  return null;
}

export function seasonInfo(id: SeasonId, now = new Date()): SeasonInfo {
  switch (id) {
    case 'christmas':
      return { id, greeting: 'Merry Christmas', emoji: '🎄' };
    case 'newyear':
      return { id, greeting: `Happy New Year ${now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()}`, emoji: '✨' };
    case 'onam':
      return { id, greeting: 'Happy Onam', emoji: '🌼' };
    case 'diwali':
      return { id, greeting: 'Happy Diwali', emoji: '🪔' };
  }
}

const BASE: string = import.meta.env.VITE_SIGNALING_URL || '';

/**
 * The festival to decorate for right now, or null. Sets `data-season` on
 * <html> so the CSS decorations switch on. `enabled` is the user's own choice.
 */
export function useSeason(enabled: boolean): SeasonInfo | null {
  const [setting, setSetting] = useState<SeasonSetting>('auto');
  const [today, setToday] = useState(() => new Date().toDateString());

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`${BASE}/api/site`)
        .then((r) => (r.ok ? r.json() : null))
        .then((s: { season?: SeasonSetting } | null) => alive && s?.season && setSetting(s.season))
        .catch(() => {});
    void load();
    // Pick up admin changes and the date rolling over.
    const t = window.setInterval(() => {
      void load();
      setToday(new Date().toDateString());
    }, 30 * 60 * 1000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  const id = !enabled || setting === 'off' ? null : setting === 'auto' ? seasonFor() : setting;
  useEffect(() => {
    const html = document.documentElement;
    if (id) html.dataset.season = id;
    else delete html.dataset.season;
    return () => {
      delete html.dataset.season;
    };
  }, [id]);
  void today;
  return id ? seasonInfo(id) : null;
}
