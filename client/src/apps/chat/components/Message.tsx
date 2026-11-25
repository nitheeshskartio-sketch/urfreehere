import { ChevronDown, Copy, Download, ExternalLink, FileText, ImageOff, LoaderCircle, MapPin, Reply, RotateCcw, Trash2, X } from 'lucide-react';
import { formatBytes } from '../../../lib/format';
import { useEngine, useFileUrl } from '../hooks';
import { formatCoord, mapsLink } from '../lib/geo';
import { isEmojiOnly, linkify } from '../lib/linkify';
import { extOf, sanitizeName } from '../lib/media';
import { clockTime } from '../lib/time';
import type { FileBody, LocationBody, StoredEvent } from '../lib/types';
import { Avatar } from './Avatar';
import { Menu } from './Menu';
import { Ticks } from './Ticks';

export function Message({
  event,
  showSender,
  isGroup,
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

  const actions = (
    <Menu
      label="Message options"
      align={mine ? 'right' : 'left'}
      trigger={<ChevronDown className="size-4" />}
      items={[
        { label: 'Reply', icon: Reply, onSelect: () => onReply(event) },
        { label: 'Copy', icon: Copy, onSelect: copy, hidden: event.kind === 'image' },
        {
          label: 'Delete for me',
          icon: Trash2,
          danger: true,
          onSelect: () => window.confirm('Delete this message from this device? Others will still have it.') && void e.deleteLocal([event.id]),
        },
      ]}
    />
  );

  return (
    <div className={`group flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'} ${showSender ? 'mt-2.5' : 'mt-0.5'}`} id={`m-${event.id}`}>
      {isGroup && !mine && (
        <span className="w-8 shrink-0">{showSender && <Avatar avatar={profile?.avatar} name={e.nameOf(event.author)} seed={event.author} size={32} />}</span>
      )}
      <div className={`flex max-w-[min(78%,560px)] items-start gap-1 ${mine ? 'flex-row-reverse' : ''}`}>
        <div
          className={`relative min-w-0 ${
            bigEmoji
              ? ''
              : `rounded-2xl border px-3 py-2 shadow-card ${mine ? 'rounded-br-md border-accent/15 bg-[#E7F0FF]' : 'rounded-bl-md border-line bg-white'}`
          } ${event.kind === 'image' || event.kind === 'location' ? '!p-1' : ''}`}
        >
          {isGroup && !mine && showSender && (
            <p className={`mb-0.5 truncate text-[12.5px] font-semibold ${event.kind === 'image' || event.kind === 'location' ? 'px-2 pt-1' : ''}`} style={{ color: senderColor(event.author) }}>
              {e.nameOf(event.author)}
            </p>
          )}
          {event.replyTo && (
            <button
              type="button"
              onClick={() => replied && onJump(replied.id)}
              className={`mb-1.5 block w-full rounded-lg border-l-[3px] border-accent bg-ink/[0.04] px-2.5 py-1.5 text-left ${event.kind === 'image' || event.kind === 'location' ? 'm-1 w-[calc(100%-8px)]' : ''}`}
            >
              <span className="block text-[12px] font-semibold text-accent">{replied ? e.nameOf(replied.author) : 'Message'}</span>
              <span className="line-clamp-2 text-[13px] text-muted">{replied ? e.describe(replied) : 'Original message not available'}</span>
            </button>
          )}

          {event.kind === 'text' &&
            (bigEmoji ? (
              <p className="text-4xl leading-tight">{text}</p>
            ) : (
              <p className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed [overflow-wrap:anywhere]">{linkify(text)}</p>
            ))}
          {event.kind === 'image' && <ImageContent body={body as unknown as FileBody} onOpen={onOpenImage} />}
          {event.kind === 'file' && <FileContent body={body as unknown as FileBody} />}
          {event.kind === 'location' && (
            <div className="p-1">
              <LocationContent body={body as unknown as LocationBody} />
            </div>
          )}

          <span className={`flex items-center justify-end gap-1 text-[11px] text-muted ${event.kind === 'image' || event.kind === 'location' ? 'px-2 pb-1' : '-mb-0.5 mt-0.5'} ${bigEmoji ? 'rounded bg-white/80 px-1' : ''}`}>
            {clockTime(event.ts)}
            {mine && <Ticks status={e.deliveryOf(event)} />}
          </span>
        </div>
        <div className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100">{actions}</div>
      </div>
    </div>
  );
}

const SENDER_COLORS = ['#2563EB', '#16A34A', '#D97706', '#DB2777', '#7C3AED', '#0D9488', '#E11D48', '#4F46E5'];
function senderColor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SENDER_COLORS[h % SENDER_COLORS.length];
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
        className="relative block w-[280px] max-w-full overflow-hidden rounded-xl bg-slate-100"
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
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-accent shadow-card">
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
            className="rounded-md p-2 text-muted hover:bg-white hover:text-ink"
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

export function SystemMessage({ text }: { text: string }) {
  return (
    <div className="my-2 flex justify-center">
      <span className="max-w-[85%] rounded-lg bg-white/90 px-3 py-1 text-center text-[12.5px] text-muted shadow-card">{text}</span>
    </div>
  );
}
