import { CircleCheck, X } from 'lucide-react';
import { formatBytes, formatDuration, formatSpeed } from '../../../lib/format';
import type { RouteKind } from '../lib/peer';
import type { TransferProgress } from '../lib/transfer/protocol';
import { FileRow } from './FileRow';
import { Button } from '../../../ui/Button';
import { Panel } from '../../../ui/Panel';
import { ProgressBar } from '../../../ui/ProgressBar';
import { RouteBadge } from './RouteBadge';

export interface TransferFile {
  name: string;
  size: number;
  type?: string;
}

/** Live transfer: overall progress, speed, per-file progress, cancel. */
export function TransferView({
  direction,
  files,
  progress,
  route,
  onCancel,
}: {
  direction: 'send' | 'receive';
  files: TransferFile[];
  progress?: TransferProgress;
  route?: RouteKind | null;
  onCancel: () => void;
}) {
  const total = progress?.total ?? files.reduce((s, f) => s + f.size, 0);
  const bytes = progress?.bytes ?? 0;
  const ratio = total > 0 ? bytes / total : 0;
  const speed = progress?.speed ?? 0;
  const eta = speed > 0 ? (total - bytes) / speed : NaN;
  const fileBytes = progress?.fileBytes ?? files.map(() => 0);
  let active = fileBytes.findIndex((b, i) => b < files[i].size);
  if (active === -1) active = files.length;

  const verb = direction === 'send' ? 'Sending' : 'Receiving';
  const noun = files.length === 1 ? 'file' : 'files';

  return (
    <Panel className="overflow-clip">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <h2 className="text-[15px] font-semibold">
          {verb} {files.length} {noun}
        </h2>
        <RouteBadge route={route} />
      </div>

      {/* Stays pinned under the header on small screens so progress is always visible. */}
      <div className="sticky top-header z-10 border-b border-line bg-panel px-4 py-4 sm:static sm:px-5 sm:py-5" aria-live="polite">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[28px] font-semibold leading-none tracking-tight tabular">{Math.floor(ratio * 100)}%</p>
          <p className="text-sm text-muted tabular">
            {formatBytes(bytes)} of {formatBytes(total)}
          </p>
        </div>
        <div className="mt-3">
          <ProgressBar value={ratio} label="Overall progress" />
        </div>
        <div className="mt-2 flex justify-between text-[13px] text-muted tabular">
          <span>{speed > 0 ? formatSpeed(speed) : bytes === 0 ? 'Starting…' : 'Measuring speed…'}</span>
          <span>{formatDuration(eta)}</span>
        </div>
      </div>

      <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
        {files.map((f, i) => {
          const done = i < active;
          const fb = fileBytes[i] ?? 0;
          return (
            <FileRow
              key={i}
              name={f.name}
              size={f.size}
              type={f.type}
              progress={f.size > 0 ? fb / f.size : done ? 1 : 0}
              done={done}
              detail={
                done ? (
                  formatBytes(f.size)
                ) : i === active ? (
                  <>
                    {formatBytes(fb)} of {formatBytes(f.size)}
                  </>
                ) : (
                  <>Queued · {formatBytes(f.size)}</>
                )
              }
              action={done ? <CircleCheck className="size-5 text-success" aria-label="Done" /> : undefined}
            />
          );
        })}
      </ul>

      <div className="flex justify-end rounded-b-xl border-t border-line bg-surface px-4 py-3 sm:px-5">
        <Button variant="danger" onClick={onCancel} className="w-full sm:w-auto">
          <X />
          Cancel transfer
        </Button>
      </div>
    </Panel>
  );
}
