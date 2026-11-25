import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

const tones = {
  error: { box: 'border-danger/20 bg-danger-soft', icon: 'text-danger', Icon: CircleAlert },
  success: { box: 'border-success/20 bg-success-soft', icon: 'text-success', Icon: CircleCheck },
  warning: { box: 'border-warning/25 bg-warning-soft', icon: 'text-warning', Icon: TriangleAlert },
  info: { box: 'border-line bg-surface', icon: 'text-muted', Icon: Info },
};

export function Notice({
  tone = 'info',
  title,
  children,
}: {
  tone?: keyof typeof tones;
  title?: string;
  children?: ReactNode;
}) {
  const t = tones[tone];
  return (
    <div className={`flex gap-3 rounded-lg border px-3.5 py-3 ${t.box}`} role={tone === 'error' ? 'alert' : undefined}>
      <t.Icon className={`mt-0.5 size-4 shrink-0 ${t.icon}`} />
      <div className="min-w-0 text-sm">
        {title && <p className="font-medium text-ink">{title}</p>}
        {children && <div className={title ? 'mt-0.5 text-muted' : 'text-ink-soft'}>{children}</div>}
      </div>
    </div>
  );
}
