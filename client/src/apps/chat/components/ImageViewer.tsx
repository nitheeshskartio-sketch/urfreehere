import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { useEffect } from 'react';
import { useFileUrl } from '../hooks';

/** Full-screen photo viewer with keyboard navigation. */
export function ImageViewer({
  fileIds,
  index,
  onIndex,
  onClose,
  title,
}: {
  fileIds: string[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  title: (fileId: string) => string;
}) {
  const fileId = fileIds[index];
  const url = useFileUrl(fileId);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      if (e.key === 'ArrowRight' && index < fileIds.length - 1) onIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, fileIds.length, onClose, onIndex]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0B1220]/95" role="dialog" aria-modal="true" aria-label="Photo viewer">
      <div className="flex h-14 items-center gap-2 px-3 text-white">
        <p className="min-w-0 flex-1 truncate px-2 text-sm">{title(fileId)}</p>
        <span className="text-[13px] text-white/60 tabular">
          {index + 1} / {fileIds.length}
        </span>
        {url && (
          <a href={url} download={title(fileId)} className="rounded-md p-2 hover:bg-panel/10" aria-label="Download photo">
            <Download className="size-5" />
          </a>
        )}
        <button type="button" onClick={onClose} className="rounded-md p-2 hover:bg-panel/10" aria-label="Close">
          <X className="size-5" />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-2 sm:p-6" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {url && <img src={url} alt="" className="max-h-full max-w-full select-none object-contain" />}
        {index > 0 && (
          <button type="button" onClick={() => onIndex(index - 1)} className="absolute left-2 rounded-full bg-panel/10 p-2 text-white hover:bg-panel/20" aria-label="Previous photo">
            <ChevronLeft className="size-6" />
          </button>
        )}
        {index < fileIds.length - 1 && (
          <button type="button" onClick={() => onIndex(index + 1)} className="absolute right-2 rounded-full bg-panel/10 p-2 text-white hover:bg-panel/20" aria-label="Next photo">
            <ChevronRight className="size-6" />
          </button>
        )}
      </div>
    </div>
  );
}
