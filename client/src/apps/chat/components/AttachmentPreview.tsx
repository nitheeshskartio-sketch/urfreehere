import { CircleAlert, FileText, Plus, SendHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatBytes } from '../../../lib/format';
import { Button } from '../../../ui/Button';
import { Modal } from '../../../ui/Modal';
import type { GifItem } from '../lib/giphy';
import { DOCUMENT_ACCEPT, IMAGE_ACCEPT, classify, validateOutgoing } from '../lib/media';
import type { SendMode } from '../lib/types';
import { SendModeChooser } from './SendModeChooser';

export type PendingAttachment =
  | { type: 'files'; files: File[]; as?: 'image' | 'document' }
  | { type: 'gif'; gif: GifItem; sticker: boolean };

/**
 * Preview before sending photos, documents, GIFs or stickers: review, remove
 * or add items, write a caption, and choose Normal / Secret / View once.
 */
export function AttachmentPreview({
  pending,
  initialMode,
  onCancel,
  onSend,
}: {
  pending: PendingAttachment;
  initialMode: SendMode;
  onCancel: () => void;
  onSend: (p: PendingAttachment, mode: SendMode, caption: string) => void;
}) {
  const [files, setFiles] = useState<File[]>(pending.type === 'files' ? pending.files : []);
  const [mode, setMode] = useState<SendMode>(initialMode);
  const [caption, setCaption] = useState('');
  const addRef = useRef<HTMLInputElement>(null);

  // Object URLs for image thumbnails, released when the preview closes.
  const urls = useMemo(() => new Map(files.filter((f) => classify(f.name) === 'image').map((f) => [f, URL.createObjectURL(f)])), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const items = files.map((f) => ({ file: f, error: validateOutgoing(f, pending.type === 'files' && pending.as === 'image' ? 'image' : 'document') }));
  const sendable = pending.type === 'gif' ? 1 : items.filter((i) => !i.error).length;
  const isGif = pending.type === 'gif';
  const images = items.filter((i) => classify(i.file.name) === 'image').length;
  const title = isGif
    ? `Send ${pending.sticker ? 'sticker' : 'GIF'}`
    : items.length === 1
      ? images
        ? 'Send photo'
        : 'Send file'
      : `Send ${items.length} ${images === items.length ? 'photos' : 'items'}`;

  const submit = () => {
    if (!sendable) return;
    if (isGif) onSend(pending, mode, '');
    else onSend({ type: 'files', files: items.filter((i) => !i.error).map((i) => i.file), as: pending.as }, mode, caption.trim());
  };

  // Enter sends from anywhere in this popup (not only the caption box), except
  // on a button, where Enter presses that button.
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Enter' || ev.shiftKey || ev.isComposing || ev.defaultPrevented) return;
      const t = ev.target as HTMLElement | null;
      if (t && (t.closest('button, a, select, textarea') || (t.tagName === 'INPUT' && t.getAttribute('aria-label') !== 'Caption' && (t as HTMLInputElement).type !== 'file'))) return;
      ev.preventDefault();
      submitRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Modal
      title={title}
      onClose={onCancel}
      wide
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!sendable} data-autofocus={isGif ? "" : undefined}>
            <SendHorizontal />
            {mode === 'secret' ? 'Send secretly' : mode === 'once' ? 'Send as view once' : 'Send'}
            {sendable > 1 ? ` (${sendable})` : ''}
          </Button>
        </div>
      }
    >
      <div className="space-y-5 p-4 sm:p-5">
        {isGif ? (
          <div className="flex justify-center rounded-lg bg-canvas p-3">
            <img src={pending.gif.full.url} alt={pending.gif.title} referrerPolicy="no-referrer" className="max-h-[300px] max-w-full rounded" />
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {items.map(({ file, error }, i) => (
                <div key={`${file.name}-${i}`} className={`relative overflow-hidden rounded-md border ${error ? 'border-danger/50' : 'border-line'} bg-canvas`}>
                  {urls.get(file) ? (
                    <img src={urls.get(file)} alt={file.name} className="aspect-square w-full object-cover" />
                  ) : (
                    <div className="flex aspect-square flex-col items-center justify-center gap-1.5 p-2 text-center">
                      <FileText className="size-7 text-accent" />
                      <span className="line-clamp-2 break-all text-[11.5px] font-medium">{file.name}</span>
                      <span className="text-[11px] text-muted">{formatBytes(file.size)}</span>
                    </div>
                  )}
                  {error && (
                    <div className="absolute inset-x-0 bottom-0 flex items-start gap-1 bg-danger/90 px-1.5 py-1 text-[11px] text-white">
                      <CircleAlert className="mt-px size-3 shrink-0" />
                      <span className="line-clamp-2">{error.replace(`${file.name}: `, '').replace(`${file.name} `, '')}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setFiles((fs) => fs.filter((x) => x !== file))}
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line-strong text-[12px] text-muted hover:border-accent hover:text-accent"
              >
                <Plus className="size-5" />
                Add more
              </button>
            </div>
            <input
              ref={addRef}
              type="file"
              multiple
              accept={pending.type === 'files' && pending.as === 'image' ? IMAGE_ACCEPT : `${IMAGE_ACCEPT},${DOCUMENT_ACCEPT}`}
              className="sr-only"
              tabIndex={-1}
              onChange={(ev) => {
                const more = Array.from(ev.target.files ?? []);
                ev.target.value = '';
                setFiles((fs) => [...fs, ...more]);
              }}
            />
            {items.length === 0 && <p className="mt-2 text-sm text-muted">Nothing selected. Add photos or files to send.</p>}
          </div>
        )}

        {!isGif && (
          <input
            value={caption}
            onChange={(ev) => setCaption(ev.target.value)}
            data-autofocus=""
            maxLength={1000}
            placeholder="Add a caption (optional)"
            aria-label="Caption"
            className="h-10 w-full rounded-md border border-line bg-panel px-3 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
          />
        )}

        <SendModeChooser value={mode} onChange={setMode} />
      </div>
    </Modal>
  );
}
