import { Plus, Upload } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { formatBytes } from '../../../lib/format';
import { LIMITS } from '../lib/limits';
import { Button } from '../../../ui/Button';

export function Dropzone({
  onFiles,
  compact = false,
  className = '',
}: {
  onFiles: (files: File[]) => void;
  compact?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const [over, setOver] = useState(false);

  const browse = () => inputRef.current?.click();

  const onDragEnter = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    depth.current += 1;
    setOver(true);
  };
  const onDragLeave = () => {
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setOver(false);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    depth.current = 0;
    setOver(false);
    // Folders show up as zero-byte entries without a type; skip them.
    const files = Array.from(e.dataTransfer.files).filter((_file, i) => {
      const entry = e.dataTransfer.items?.[i]?.webkitGetAsEntry?.();
      return !entry || entry.isFile;
    });
    if (files.length) onFiles(files);
  };

  const input = (
    <input
      ref={inputRef}
      type="file"
      multiple
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = '';
        if (files.length) onFiles(files);
      }}
    />
  );

  const zoneEvents = {
    onDragEnter,
    onDragLeave,
    onDragOver: (e: DragEvent) => e.dataTransfer.types.includes('Files') && e.preventDefault(),
    onDrop,
  };
  const tone = over ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface';

  if (compact) {
    return (
      <div
        {...zoneEvents}
        className={`flex items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2.5 transition-colors ${tone} ${className}`}
      >
        <span className="hidden text-sm text-muted sm:inline">{over ? 'Drop to add' : 'Drop more files here'}</span>
        <Button variant="secondary" size="sm" onClick={browse} className="w-full sm:w-auto">
          <Plus />
          Add files
        </Button>
        {input}
      </div>
    );
  }

  return (
    <div
      {...zoneEvents}
      className={`flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center transition-colors sm:py-12 ${tone} ${className}`}
    >
      <span className="flex size-11 items-center justify-center rounded-lg border border-line bg-panel text-muted shadow-card">
        <Upload className="size-5" strokeWidth={1.75} />
      </span>
      <p className="mt-4 text-[15px] font-medium">
        <span className="hidden sm:inline">{over ? 'Drop to add files' : 'Drop files here'}</span>
        <span className="sm:hidden">Choose files to send</span>
      </p>
      <p className="mt-1 text-sm text-muted">
        Up to {formatBytes(LIMITS.maxFileSize)} per file, {formatBytes(LIMITS.maxTotalSize)} per transfer.
      </p>
      <Button onClick={browse} className="mt-5 w-full sm:w-auto" size="lg">
        Browse files
      </Button>
      {input}
    </div>
  );
}
