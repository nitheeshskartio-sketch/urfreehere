import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../lib/theme';

/** Light / dark switch shown in the top-right corner of every app. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      className={`inline-flex size-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-ink ${className}`}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
    >
      {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}
