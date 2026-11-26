export function ProgressBar({
  value,
  tone = 'accent',
  size = 'md',
  label,
}: {
  /** 0..1 */
  value: number;
  tone?: 'accent' | 'success' | 'danger' | 'muted';
  size?: 'sm' | 'md';
  label?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const color = { accent: 'bg-accent', success: 'bg-success', danger: 'bg-danger', muted: 'bg-muted/50' }[tone];
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={`w-full overflow-hidden rounded-full bg-subtle ${size === 'sm' ? 'h-1' : 'h-2'}`}
    >
      <div className={`h-full rounded-full transition-[width] duration-300 ease-out ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
