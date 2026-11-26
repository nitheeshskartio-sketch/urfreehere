import { Copy, EllipsisVertical, Download, ExternalLink, FileText, ImageOff, LoaderCircle, MapPin, Reply, RotateCcw, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { formatBytes } from '../../../lib/format';
import { useEngine, useFileUrl } from '../hooks';
import { formatCoord, mapsLink } from '../lib/geo';
import { isEmojiOnly, linkify } from '../lib/linkify';
import { extOf, sanitizeName } from '../lib/media';
import { clockTime } from '../lib/time';
import type { FileBody, GifBody, LocationBody, StoredEvent } from '../lib/types';
import { Avatar } from '../../../ui/avatar/Avatar';
import { Menu } from '../../../ui/Menu';
import { Ticks } from './Ticks';

export function Message({
  event,
  showSender,
  isGroup: _isGroup,
  onReply,
  onOpenImage,
  onJump,
}: {
  event: StoredEvent;
  showSender: boolean;
  isGroup: boolean;
  onReply: (e: StoredEvent) => void;
  onOpenImage: (fileId: string) => void;
  onJump: (id: string) => void;
}) {
  const e = useEngine();
  const mine = event.author === e.me;
  const body = event.body as Record<string, unknown>;
  const text = event.kind === 'text' ? String(body.text) : '';
  const bigEmoji = event.kind === 'text' && isEmojiOnly(text);
  const replied = e.event(event.replyTo);
  const profile = e.profileOf(event.author);

  const copy = () => {
    const value = event.kind === 'text' ? text : event.kind === 'location' ? `${(body as unknown as LocationBody).lat}, ${(body as unknown as LocationBody).lng}` : sanitizeName(body.name);
    void navigator.clipboard?.writeText(value).then(() => e.toast('Copied', 'success'), () => e.toast("Couldn't copy", 'error'));
  };

  const sticker = event.kind === 'gif' && !!(body as { sticker?: boolean }).sticker;
  const media = event.kind === 'image' || event.kind === 'location' || event.kind === 'gif';
  const fullTime = new Date(event.ts).toLocaleString([], { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`group flex gap-2.5 ${mine ? 'justify-end' : 'justify-start'} ${showSender ? 'mt-4' : 'mt-0.5'}`} id={`m-${event.id}`}>
      {!mine && (
        <span className="w-8 shrink-0 pt-[22px]">{showSender && <Avatar avatar={profile?.avatar} name={e.nameOf(event.author)} seed={event.author} size={32} />}</span>
      )}
      <div className={`flex min-w-0 max-w-[min(82%,640px)] flex-col ${mine ? 'items-end' : 'items-start'}`}>
        {showSender && (
          <p className="mb-1 flex items-baseline gap-2 px-0.5 text-[12px] text-muted">
            {!mine && <span className="font-semibold text-ink-soft">{e.nameOf(event.author)}</span>}
            <span>{clockTime(event.ts)}</span>
          </p>
        )}
        <div className={`flex items-end gap-1 ${mine ? 'flex-row' : 'flex-row-reverse'}`}>
          <div className="relative min-w-0" title={fullTime}>
            <div
              className={`min-w-0 ${
                bigEmoji || sticker ? '' : `rounded-md ${media ? 'p-1' : 'px-3 py-2'} ${mine ? 'bg-bubble-own' : 'bg-panel shadow-card'}`
              }`}
            >
              {event.replyTo && (
                <button
                  type="button"
                  onClick={() => replied && onJump(replied.id)}
                  className={`mb-1.5 block w-full rounded border-l-[3px] border-accent bg-ink/[0.05] px-2.5 py-1.5 text-left ${media ? 'm-1 w-[calc(100%-8px)]' : ''}`}
                >
                  <span className="block text-[12px] font-semibold text-ink-soft">{replied ? e.nameOf(replied.author) : 'Message'}</span>
                  <span className="line-clamp-2 text-[13px] text-muted">{replied ? e.describe(replied) : 'Original message not available'}</span>
                </button>
              )}
              {event.kind === 'text' &&
                (bigEmoji ? (
                  <p className="text-4xl leading-tight">{text}</p>
                ) : (
                  <p className="whitespace-pre-wrap break-words text-[14px] leading-[1.45] [overflow-wrap:anywhere]">{linkify(text)}</p>
                ))}
              {event.kind === 'image' && <ImageContent body={body as unknown as FileBody} onOpen={onOpenImage} />}
              {event.kind === 'file' && <FileContent body={body as unknown as FileBody} />}
              {event.kind === 'location' && <LocationContent body={body as unknown as LocationBody} />}
              {event.kind === 'gif' && <GifContent body={body as unknown as GifBody} />}
            </div>
            {/* Hover action bar, like Teams */}
            <div
              className={`absolute -top-4 z-10 flex items-center rounded-md border border-line bg-panel shadow-card opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:hidden ${
                mine ? 'right-1' : 'left-auto right-1'
              }`}
            >
              <button type="button" onClick={() => onReply(event)} className="p-1.5 text-muted hover:text-accent" aria-label="Reply" title="Reply">
                <Reply className="size-4" />
              </button>
              <Menu
                label="Message options"
                align="right"
                trigger={<EllipsisVertical className="size-4" />}
                items={[
                  { label: 'Reply', icon: Reply, onSelect: () => onReply(event) },
                  { label: 'Copy', icon: Copy, onSelect: copy, hidden: event.kind === 'image' || event.kind === 'gif' },
                  {
                    label: 'Delete for me',
                    icon: Trash2,
                    danger: true,
                    onSelect: () => window.confirm('Delete this message from this device? Others will still have it.') && void e.deleteLocal([event.id]),
                  },
                ]}
              />
            </div>
          </div>
          {mine && <Ticks status={e.deliveryOf(event)} className="mb-0.5 shrink-0" />}
          {/* Touch devices: actions via the same menu, without hover */}
          <div className="hidden [@media(pointer:coarse)]:block">
            <Menu
              label="Message options"
              align={mine ? 'right' : 'left'}
              trigger={<EllipsisVertical className="size-4" />}
              items={[
                { label: 'Reply', icon: Reply, onSelect: () => onReply(event) },
                { label: 'Copy', icon: Copy, onSelect: copy, hidden: event.kind === 'image' || event.kind === 'gif' },
                { label: 'Delete for me', icon: Trash2, danger: true, onSelect: () => window.confirm('Delete this message from this device?') && void e.deleteLocal([event.id]) },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function TransferStatus({ fileId, size }: { fileId: string; size: number }) {
  const e = useEngine();
  const t = e.transferOf(fileId);
  if (t.status === 'downloading') {
    const pct = t.total ? Math.floor((t.received / t.total) * 100) : 0;
    return (
      <span className="flex items-center gap-2 text-[12px] text-muted">
        <LoaderCircle className="size-3.5 animate-spin" />
        {pct}% · {formatBytes(t.received)} of {formatBytes(size)}
        <button type="button" onClick={() => e.cancelDownload(fileId)} className="rounded p-0.5 hover:bg-ink/5 hover:text-ink" aria-label="Cancel download">
          <X className="size-3.5" />
        </button>
      </span>
    );
  }
  if (t.status === 'failed' || t.status === 'cancelled' || t.status === 'missing') {
    return (
      <span className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
        {t.status === 'failed' ? t.reason : t.status === 'cancelled' ? 'Download cancelled.' : 'Not downloaded.'}
        <button type="button" onClick={() => void e.download(fileId)} className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
          {t.status === 'missing' ? <Download className="size-3.5" /> : <RotateCcw className="size-3.5" />}
          {t.status === 'missing' ? `Download (${formatBytes(size)})` : 'Retry'}
        </button>
      </span>
    );
  }
  return null;
}

function ImageContent({ body, onOpen }: { body: FileBody; onOpen: (fileId: string) => void }) {
  const url = useFileUrl(body.fileId);
  const ratio = body.width && body.height ? Math.min(1.6, Math.max(0.6, body.height / body.width)) : 0.75;
  return (
    <div>
      <button
        type="button"
        onClick={() => url && onOpen(body.fileId)}
        className="relative block w-[280px] max-w-full overflow-hidden rounded-xl bg-subtle"
        style={{ aspectRatio: `1 / ${ratio}` }}
        aria-label={url ? 'Open photo' : 'Photo loading'}
      >
        {url ? (
          <img src={url} alt={body.caption ?? 'Photo'} className="size-full object-cover" />
        ) : body.thumb ? (
          <img src={body.thumb} alt="" className="size-full scale-110 object-cover blur-md" />
        ) : (
          <span className="flex size-full items-center justify-center text-muted">
            <ImageOff className="size-6" />
          </span>
        )}
      </button>
      {!url && (
        <div className="px-2 pt-1.5">
          <TransferStatus fileId={body.fileId} size={body.size} />
        </div>
      )}
      {body.caption && <p className="whitespace-pre-wrap break-words px-2 pt-1.5 text-[14.5px]">{linkify(body.caption)}</p>}
    </div>
  );
}

function FileContent({ body }: { body: FileBody }) {
  const e = useEngine();
  const url = useFileUrl(body.fileId);
  const name = sanitizeName(body.name);
  const ext = extOf(name).toUpperCase();
  return (
    <div className="w-[300px] max-w-full">
      <div className="flex items-center gap-3 rounded-lg bg-ink/[0.04] p-2.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-panel text-accent shadow-card">
          <FileText className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium" title={name}>
            {name}
          </span>
          <span className="block text-[12px] text-muted">
            {ext || 'File'} · {formatBytes(body.size)}
          </span>
        </span>
        {url && (
          <a
            href={url}
            download={name}
            className="rounded-md p-2 text-muted hover:bg-panel hover:text-ink"
            aria-label={`Download ${name}`}
            onClick={() => e.toast(`Saving ${name}`, 'info')}
          >
            <Download className="size-[18px]" />
          </a>
        )}
      </div>
      {!url && (
        <div className="pt-1.5">
          <TransferStatus fileId={body.fileId} size={body.size} />
        </div>
      )}
      {body.caption && <p className="whitespace-pre-wrap break-words pt-1.5 text-[14.5px]">{linkify(body.caption)}</p>}
    </div>
  );
}

function LocationContent({ body }: { body: LocationBody }) {
  return (
    <a
      href={mapsLink(body.lat, body.lng)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex w-[280px] max-w-full items-center gap-3 rounded-xl bg-ink/[0.04] p-3 hover:bg-ink/[0.07]"
      aria-label="Open location in Maps"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
        <MapPin className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{body.label || (body.current ? 'Current location' : 'Shared location')}</span>
        <span className="block text-[12px] text-muted tabular">
          {formatCoord(body.lat, body.lng)}
          {body.accuracy ? ` · ±${body.accuracy} m` : ''}
        </span>
        <span className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-accent">
          <ExternalLink className="size-3.5" />
          Open in Maps
        </span>
      </span>
    </a>
  );
}

function GifContent({ body }: { body: GifBody }) {
  const [failed, setFailed] = useState(false);
  const w = Math.min(260, body.width);
  if (failed) return <p className="px-2 py-1.5 text-[13px] text-muted">{body.sticker ? 'Sticker' : 'GIF'} couldn't be loaded.</p>;
  return (
    <img
      src={body.url}
      alt={body.title || (body.sticker ? 'Sticker' : 'GIF')}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`block max-w-full ${body.sticker ? '' : 'rounded'}`}
      style={{ width: w, aspectRatio: `${body.width} / ${body.height}` }}
    />
  );
}

export function SystemMessage({ text }: { text: string }) {
  return (
    <div className="my-3 flex justify-center">
      <span className="max-w-[85%] text-center text-[12px] text-muted">{text}</span>
    </div>
  );
}
