import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const KEY = 'urfree.theme';
const listeners = new Set<(t: Theme) => void>();

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/** Applies and remembers a theme for every Humble app. */
export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* storage unavailable */
  }
  for (const l of listeners) l(theme);
}

// Follow the system setting until the user picks a theme themselves.
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
media?.addEventListener('change', (e) => {
  if (localStorage.getItem(KEY)) return;
  const t: Theme = e.matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  for (const l of listeners) l(t);
});

export type ThemePreference = Theme | 'system';

export function themePreference(): ThemePreference {
  const saved = localStorage.getItem(KEY);
  return saved === 'light' || saved === 'dark' ? saved : 'system';
}

/** Light, dark, or follow the device ("system"). */
export function setThemePreference(pref: ThemePreference) {
  if (pref !== 'system') return setTheme(pref);
  localStorage.removeItem(KEY);
  const t: Theme = media?.matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  for (const l of listeners) l(t);
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, set] = useState<Theme>(currentTheme);
  useEffect(() => {
    listeners.add(set);
    return () => void listeners.delete(set);
  }, []);
  return [theme, setTheme];
}

// ---- Colour themes (palettes) ------------------------------------------------
// Work with both light and dark mode; see the data-palette blocks in tokens.css.

export type Palette = 'normal' | 'lavender' | 'mint' | 'coffee' | 'midnight';
export const PALETTES: { id: Palette; label: string; swatch: [string, string, string] }[] = [
  { id: 'normal', label: 'Normal', swatch: ['#5B5FC7', '#E8EBFA', '#F5F5F5'] },
  { id: 'lavender', label: 'Lavender', swatch: ['#7C4DC8', '#EBE2FC', '#F5F1FB'] },
  { id: 'mint', label: 'Mint', swatch: ['#0D8C70', '#D6F1E6', '#F0F8F5'] },
  { id: 'coffee', label: 'Coffee', swatch: ['#8C5836', '#F0E2D3', '#F5EFE8'] },
  { id: 'midnight', label: 'Midnight', swatch: ['#2563EB', '#DBE7FE', '#0D1322'] },
];
const PALETTE_KEY = 'humble.palette';
const paletteListeners = new Set<(p: Palette) => void>();

export function currentPalette(): Palette {
  const p = document.documentElement.dataset.palette as Palette | undefined;
  return p && PALETTES.some((x) => x.id === p) ? p : 'normal';
}

export function setPalette(p: Palette) {
  if (p === 'normal') delete document.documentElement.dataset.palette;
  else document.documentElement.dataset.palette = p;
  try {
    if (p === 'normal') localStorage.removeItem(PALETTE_KEY);
    else localStorage.setItem(PALETTE_KEY, p);
  } catch {
    /* storage unavailable */
  }
  for (const l of paletteListeners) l(p);
}

export function usePalette(): [Palette, (p: Palette) => void] {
  const [p, set] = useState<Palette>(currentPalette);
  useEffect(() => {
    paletteListeners.add(set);
    return () => void paletteListeners.delete(set);
  }, []);
  return [p, setPalette];
}
