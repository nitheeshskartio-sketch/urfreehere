import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Centered state block for errors, success and empty states. */
export function StateMessage({
  icon: Icon,
  tone,
  title,
  message,
  children,
}: {
  icon: LucideIcon;
  tone: 'success' | 'error' | 'neutral';
  title: string;
  message?: ReactNode;
  children?: ReactNode;
}) {
  const ring = {
    success: 'bg-success-soft text-success',
    error: 'bg-danger-soft text-danger',
    neutral: 'bg-surface text-muted',
  }[tone];
  return (
    <div className="flex flex-col items-center px-4 py-8 text-center sm:py-10" role={tone === 'error' ? 'alert' : 'status'}>
      <span className={`flex size-11 items-center justify-center rounded-full ${ring}`}>
        <Icon className="size-[22px]" strokeWidth={2} />
      </span>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      {message && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{message}</p>}
      {children && <div className="mt-6 flex w-full flex-col-reverse justify-center gap-2 sm:w-auto sm:flex-row">{children}</div>}
    </div>
  );
}
