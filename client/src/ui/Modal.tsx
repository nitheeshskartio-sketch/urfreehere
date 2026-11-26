import { ArrowLeft, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Dialog on larger screens, full-screen sheet on phones. Closes on Escape
 * and on backdrop click.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false,
  onBack,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  onBack?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector<HTMLElement>('input, textarea, button:not([data-close])');
    first?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 sm:items-center sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex w-full flex-col bg-panel sm:max-h-[min(720px,90dvh)] sm:rounded-xl sm:border sm:border-line sm:shadow-pop ${wide ? 'sm:max-w-[640px]' : 'sm:max-w-[460px]'}`}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3 sm:px-4">
          {onBack && (
            <button type="button" onClick={onBack} className="rounded-md p-2 text-muted hover:bg-surface hover:text-ink" aria-label="Back">
              <ArrowLeft className="size-5" />
            </button>
          )}
          <h2 className="flex-1 truncate px-1 text-[15px] font-semibold">{title}</h2>
          <button type="button" data-close onClick={onClose} className="rounded-md p-2 text-muted hover:bg-surface hover:text-ink" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="shrink-0 border-t border-line bg-surface px-4 py-3 sm:rounded-b-xl">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-ink-soft">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-[12px] text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-lg border border-line-strong bg-panel px-3 py-2.5 text-[15px] placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';
