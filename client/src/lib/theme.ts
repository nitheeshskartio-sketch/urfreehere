import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const KEY = 'urfree.theme';
const listeners = new Set<(t: Theme) => void>();

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/** Applies and remembers a theme for every UR Free Here app. */
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

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, set] = useState<Theme>(currentTheme);
  useEffect(() => {
    listeners.add(set);
    return () => void listeners.delete(set);
  }, []);
  return [theme, setTheme];
}
