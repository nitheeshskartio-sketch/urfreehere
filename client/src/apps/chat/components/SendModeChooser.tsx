import { Eye, EyeOff, Flame } from 'lucide-react';
import type { SendMode } from '../lib/types';

const MODES: [SendMode, string, typeof Eye, string][] = [
  ['normal', 'Normal', Eye, 'Shown as usual.'],
  ['secret', 'Secret', EyeOff, 'Blurred until clicked, for everyone.'],
  ['once', 'View once', Flame, 'Can be opened only once, then it disappears.'],
];

/** "Send as" choice used before sending photos, files, GIFs and locations. */
export function SendModeChooser({ value, onChange }: { value: SendMode; onChange: (m: SendMode) => void }) {
  const hint = MODES.find(([m]) => m === value)![3];
  return (
    <div>
      <p className="text-[13px] font-medium text-ink-soft">Send as</p>
      <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-md border border-line bg-surface p-0.5" role="radiogroup" aria-label="Send as">
        {MODES.map(([m, label, Icon]) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={value === m}
            onClick={() => onChange(m)}
            className={`inline-flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-[13px] font-medium transition-colors ${
              value === m ? 'bg-accent text-white shadow-card' : 'text-ink-soft hover:bg-subtle'
            }`}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[12px] text-muted">{hint}</p>
    </div>
  );
}
