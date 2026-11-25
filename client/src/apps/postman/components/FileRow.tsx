import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { highestLevel, type FileWarning } from '../lib/safety';
import { formatBytes } from '../../../lib/format';
import { FileIcon, fileKind } from '../../../ui/FileIcon';
import { ProgressBar } from '../../../ui/ProgressBar';

export function FileRow({
  name,
  size,
  type,
  progress,
  done,
  detail,
  action,
  warnings,
}: {
  /** Safety warnings shown under the name. */
  warnings?: FileWarning[];
  name: string;
  size: number;
  type?: string;
  /** 0..1 — shows a progress bar when set. */
  progress?: number;
  done?: boolean;
  detail?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 px-4 py-3 sm:items-center sm:px-5">
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${
          highestLevel(warnings) === 'high'
            ? 'border-danger/20 bg-danger-soft text-danger'
            : done
              ? 'border-success/20 bg-success-soft text-success'
              : 'border-line bg-surface text-muted'
        }`}
      >
        <FileIcon name={name} type={type} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug wrap-anywhere">{name}</p>
        <p className="mt-0.5 text-[13px] text-muted tabular">
          {detail ?? (
            <>
              {fileKind(name, type)} · {formatBytes(size)}
            </>
          )}
        </p>
        {warnings && warnings.length > 0 && (
          <ul className={`mt-1.5 space-y-0.5 text-[13px] ${highestLevel(warnings) === 'high' ? 'text-danger' : 'text-warning'}`}>
            {warnings.map((w) => (
              <li key={w.message} className="flex items-start gap-1.5">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                <span>{w.message}</span>
              </li>
            ))}
          </ul>
        )}
        {progress !== undefined && (
          <div className="mt-2">
            <ProgressBar size="sm" value={progress} tone={done ? 'success' : progress > 0 ? 'accent' : 'muted'} label={name} />
          </div>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center self-center">{action}</div>}
    </li>
  );
}
