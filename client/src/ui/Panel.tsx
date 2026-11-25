import type { HTMLAttributes } from 'react';

export function Panel({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-xl border border-line bg-white shadow-card ${className}`} {...props} />;
}

export function PanelHeader({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
      <div className="flex min-w-0 items-baseline gap-2">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {meta && <span className="truncate text-sm text-muted tabular">{meta}</span>}
      </div>
      {action}
    </div>
  );
}
