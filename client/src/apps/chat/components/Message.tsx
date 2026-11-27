import { Ban, Copy, Eye, EyeOff, EllipsisVertical, Flame, Download, ExternalLink, FileText, ImageOff, LoaderCircle, MapPin, Reply, RotateCcw, Trash2, Undo2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatBytes } from '../../../lib/format';
import { GestureCard, PromiseCard } from './Promise';
import { VoiceCard } from './VoiceCall';
import { useEngine, useFileUrl } from '../hooks';
import type { ViewOnceSnapshot } from '../lib/engine';
import { formatCoord, mapsLink } from '../lib/geo';
import { isEmojiOnly, linkify } from '../lib/linkify';
import { extOf, sanitizeName } from '../lib/media';
import { clockTime } from '../lib/time';
import { REACTIONS, type FileBody, type GifBody, type LocationBody, type Reaction, type StoredEvent } from '../lib/types';
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
    const value = event.kind === 'text' ? text : event.kind === 'promise' ? String(body.text) : event.kind === 'location' ? `${(body as unknown as LocationBody).lat}, ${(body as unknown as LocationBody).lng}` : sanitizeName(body.name);
    void navigator.clipboard?.writeText(value).then(() => e.toast('Copied', 'success'), () => e.toast("Couldn't copy", 'error'));
  };

  const viewOnce = (body as { viewOnce?: boolean }).viewOnce === true;
  const secret = (body as { secret?: boolean }).secret === true && !viewOnce;
  const [revealed, setRevealed] = useState(false);
  const sticker = event.kind === 'gif' && !!(body as { sticker?: boolean }).sticker && !viewOnce;
  const media = (event.kind === 'image' || event.kind === 'location' || event.kind === 'gif') && !viewOnce;
  const fullTime = new Date(event.ts).toLocaleString([], { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const revoked = !!event.local.revoked;
  const reactions = e.reactionsOf(event.id);

  // "Delete for everyone" is only offered for 5 seconds after sending.
  const [, tick] = useState(0);
  const windowLeft = e.deleteWindowLeft(event);
  useEffect(() => {
    if (windowLeft <= 0) return;
    const t = window.setTimeout(() => tick((n) => n + 1), Math.min(1000, windowLeft + 20));
    return () => window.clearTimeout(t);
  });
  const deleteEveryone = () =>
    void e.deleteForEveryone(event.id).then((how) => how === 'me' && e.toast('Too late to delete for everyone, so it was deleted only for you.'));
  const deleteMe = () => window.confirm('Delete this message from this device? Others will still have it.') && void e.deleteLocal([event.id]);
  const react = (r: Reaction) => void e.react(event, r);
  const noCopy = event.kind === 'image' || event.kind === 'gif' || event.kind === 'hug' || event.kind === 'slap' || event.kind === 'voice' || viewOnce || (secret && !revealed) || revoked;
  const menuItems = [
    { label: 'Reply', icon: Reply, onSelect: () => onReply(event), hidden: revoked },
    { label: 'Copy', icon: Copy, onSelect: copy, hidden: noCopy },
    {
      label: `Delete for everyone (${Math.ceil(windowLeft / 1000)}s)`,
      icon: Undo2,
      danger: true,
      hidden: windowLeft <= 0,
      onSelect: deleteEveryone,
    },
    { label: 'Delete for me', icon: Trash2, danger: true, onSelect: deleteMe },
  ];

  return (
    <div className={`group relative flex gap-2.5 focus-within:z-30 ${mine ? 'justify-end' : 'justify-start'} ${showSender ? 'chat-row-first mt-4' : 'mt-0.5'}`} id={`m-${event.id}`}>
      {!mine && (
        <span className="w-8 shrink-0 pt-[22px]">{showSender && <Avatar avatar={profile?.avatar} name={e.nameOf(event.author)} seed={event.author} size={32} ring={e.ringFor(event.author)} />}</span>
      )}
      <div className={`flex min-w-0 max-w-[min(82%,640px)] flex-col ${mine ? 'items-end' : 'items-start'}`}>
        {showSender && (
          <p className="chat-meta mb-1 flex items-baseline gap-2 px-0.5 text-muted">
            {!mine && <span className="font-semibold text-ink-soft">{e.nameOf(event.author)}</span>}
            <span>{clockTime(event.ts)}</span>
          </p>
        )}
        <div className={`flex items-end gap-1 ${mine ? 'flex-row' : 'flex-row-reverse'}`}>
          <div className="relative min-w-0" title={fullTime}>
            <div
              className={`min-w-0 ${
                (bigEmoji || sticker) && !revoked ? '' : `rounded-md ${media && !revoked ? 'p-1' : 'chat-bubble px-3 py-2'} ${mine ? 'bg-bubble-own' : 'bg-panel shadow-card'}`
              }`}
            >
              {event.replyTo && !revoked && (
                <button
                  type="button"
                  onClick={() => replied && onJump(replied.id)}
                  className={`mb-1.5 block w-full rounded border-l-[3px] border-accent bg-ink/[0.05] px-2.5 py-1.5 text-left ${media ? 'm-1 w-[calc(100%-8px)]' : ''}`}
                >
                  <span className="block text-[12px] font-semibold text-ink-soft">{replied ? e.nameOf(replied.author) : 'Message'}</span>
                  <span className="line-clamp-2 text-[13px] text-muted">{replied ? e.describe(replied) : 'Original message not available'}</span>
                </button>
              )}
              {revoked ? (
                <p className="chat-text flex items-center gap-1.5 italic text-muted">
                  <Ban className="size-3.5" />
                  {mine ? 'You deleted this message' : 'This message was deleted'}
                </p>
              ) : viewOnce ? (
                <ViewOnceCard event={event} mine={mine} />
              ) : (
              <SecretCover active={secret} revealed={revealed} onReveal={() => setRevealed(true)} onHide={() => setRevealed(false)} media={media}>
              {event.kind === 'text' &&
                (bigEmoji ? (
                  <p className="text-4xl leading-tight">{text}</p>
                ) : (
                  <p className="chat-text whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{linkify(text)}</p>
                ))}
              {event.kind === 'image' && <ImageContent body={body as unknown as FileBody} onOpen={onOpenImage} />}
              {event.kind === 'file' && <FileContent body={body as unknown as FileBody} />}
              {event.kind === 'location' && <LocationContent body={body as unknown as LocationBody} />}
              {event.kind === 'gif' && <GifContent body={body as unknown as GifBody} />}
              {event.kind === 'promise' && <PromiseCard event={event} mine={mine} />}
              {event.kind === 'voice' && <VoiceCard event={event} mine={mine} />}
              {(event.kind === 'hug' || event.kind === 'slap') && (
                <GestureCard kind={event.kind} mine={mine} onReplay={() => window.dispatchEvent(new CustomEvent('urchat:hug-replay', { detail: event.id }))} />
              )}
              </SecretCover>
              )}
            </div>
            {/* Hover action bar, like Teams */}
            <div
              className={`absolute -top-4 z-10 flex items-center rounded-md border border-line bg-panel shadow-card opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:hidden ${
                mine ? 'right-1' : 'left-1'
              }`}
            >
              {!revoked && (
                <>
                  {REACTIONS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => react(r.id)}
                      className={`grid size-7 place-items-center text-[15px] leading-none transition-transform hover:scale-125 ${reactions.mine === r.id ? 'rounded bg-accent-soft' : ''}`}
                      aria-label={reactions.mine === r.id ? `Remove ${r.label} reaction` : `React with ${r.label}`}
                      aria-pressed={reactions.mine === r.id}
                      title={r.label}
                    >
                      {r.emoji}
                    </button>
                  ))}
                  <span className="mx-0.5 h-4 w-px bg-line" />
                  <button type="button" onClick={() => onReply(event)} className="p-1.5 text-muted hover:text-accent" aria-label="Reply" title="Reply">
                    <Reply className="size-4" />
                  </button>
                </>
              )}
              {windowLeft > 0 && (
                <button type="button" onClick={deleteEveryone} className="p-1.5 text-danger hover:bg-danger/10" aria-label="Delete for everyone" title={`Delete for everyone (${Math.ceil(windowLeft / 1000)}s left)`}>
                  <Undo2 className="size-4" />
                </button>
              )}
              <Menu label="Message options" align="right" trigger={<EllipsisVertical className="size-4" />} items={menuItems} />
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
                ...REACTIONS.map((r) => ({
                  label: `${r.emoji} ${reactions.mine === r.id ? `Remove ${r.label.toLowerCase()}` : r.label}`,
                  onSelect: () => react(r.id),
                  hidden: revoked,
                })),
                ...menuItems,
              ]}
            />
          </div>
        </div>
        {!revoked && REACTIONS.some((r) => reactions.counts[r.id] > 0) && (
          <div className={`-mt-1.5 flex flex-wrap gap-1 px-1 ${mine ? 'mr-5 justify-end' : 'ml-1'}`}>
            {REACTIONS.filter((r) => reactions.counts[r.id] > 0).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => react(r.id)}
                aria-pressed={reactions.mine === r.id}
                aria-label={`${r.label}: ${reactions.counts[r.id]}${reactions.mine === r.id ? ', including you' : ''}`}
                title={reactions.mine === r.id ? `You reacted with ${r.label.toLowerCase()} (click to remove)` : `React with ${r.label.toLowerCase()}`}
                className={`relative z-[1] inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[12px] font-medium shadow-sm ${
                  reactions.mine === r.id ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-panel text-ink-soft hover:border-accent/50'
                }`}
              >
                <span className="text-[13px] leading-none">{r.emoji}</span>
                {reactions.counts[r.id]}
              </button>
            ))}
          </div>
        )}
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

/**
 * Secret (spoiler) message: content stays blurred until clicked, and is
 * masked again whenever the chat is reopened.
 */
function SecretCover({
  active,
  revealed,
  onReveal,
  onHide,
  media,
  children,
}: {
  active: boolean;
  revealed: boolean;
  onReveal: () => void;
  onHide: () => void;
  media: boolean;
  children: React.ReactNode;
}) {
  if (!active) return <>{children}</>;
  if (revealed) {
    return (
      <div>
        {children}
        <button type="button" onClick={onHide} className={`mt-1 inline-flex items-center gap-1 text-[11.5px] font-medium text-muted hover:text-ink ${media ? 'px-2 pb-1' : ''}`}>
          <EyeOff className="size-3.5" />
          Hide
        </button>
      </div>
    );
  }
  return (
    <div className="relative min-h-[44px] min-w-[230px] overflow-hidden rounded">
      <div className={`pointer-events-none select-none ${media ? 'blur-2xl' : 'blur-[7px]'}`} aria-hidden="true">
        {children}
      </div>
      <button type="button" onClick={onReveal} className="absolute inset-0 flex items-center justify-center" aria-label="Secret message. Click to view.">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-panel/95 px-3 py-1 text-[12.5px] font-semibold text-ink shadow-card">
          <Eye className="size-3.5 text-accent" />
          Secret message · click to view
        </span>
      </button>
    </div>
  );
}

/** View-once placeholder: open once (receiver), or see whether it was opened (sender). */
function ViewOnceCard({ event, mine }: { event: StoredEvent; mine: boolean }) {
  const e = useEngine();
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<ViewOnceSnapshot | null>(null);
  const label = e.describe(event);
  const opened = event.local.opened || (mine && e.deliveryOf(event) === 'read');
  const b = event.body as Record<string, unknown>;
  const needsFile = (event.kind === 'image' || event.kind === 'file') && !event.local.opened;
  const ready = !needsFile || e.hasFile(String(b.fileId));

  // Opening deletes the stored copy at once, so the card flips to "Opened" while the viewer is still showing.
  const viewer = snapshot && <ViewOnceViewer snapshot={snapshot} onClose={() => setSnapshot(null)} />;
  if (mine || opened) {
    return (
      <>
      {viewer}
      <div className="flex items-center gap-2.5 py-0.5">
        <Flame className={`size-5 shrink-0 ${opened ? 'text-muted' : 'text-accent'}`} />
        <span>
          <span className={`block text-[14px] font-semibold ${opened ? 'text-muted' : ''}`}>{label}</span>
          <span className="block text-[12px] text-muted">{opened ? 'Opened' : 'Not opened yet'}</span>
        </span>
      </div>
      </>
    );
  }
  return (
    <>
      <button
        type="button"
        disabled={!ready || busy}
        onClick={async () => {
          setBusy(true);
          setSnapshot(await e.takeViewOnce(event.id));
          setBusy(false);
        }}
        className="flex items-center gap-2.5 py-0.5 text-left disabled:opacity-60"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-white">
          <Flame className="size-[18px]" />
        </span>
        <span>
          <span className="block text-[14px] font-semibold">{label}</span>
          <span className="block text-[12px] text-muted">{ready ? 'Click to open · you can view it once' : 'Downloading…'}</span>
        </span>
      </button>
      {!ready && <TransferStatus fileId={String(b.fileId)} size={Number(b.size)} />}
      {viewer}
    </>
  );
}

/** Full-screen one-time viewer. The stored content is already deleted; closing discards this copy. */
function ViewOnceViewer({ snapshot, onClose }: { snapshot: ViewOnceSnapshot; onClose: () => void }) {
  const e = useEngine();
  const close = () => {
    if (snapshot.url) URL.revokeObjectURL(snapshot.url);
    onClose();
  };
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const b = snapshot.body;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90 text-white" role="dialog" aria-modal="true" aria-label="View once">
      <div className="flex h-14 shrink-0 items-center gap-3 px-4">
        <Flame className="size-5 text-[#8f94f8]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{e.nameOf(snapshot.author)}</p>
          <p className="text-[12px] text-white/60">View once · it disappears when you close it</p>
        </div>
        <button type="button" onClick={close} className="rounded-md p-2 hover:bg-white/10" aria-label="Close">
          <X className="size-5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4" onClick={(ev) => ev.target === ev.currentTarget && close()}>
        {snapshot.kind === 'text' && <p className="max-w-2xl whitespace-pre-wrap break-words text-center text-xl leading-relaxed">{String(b.text ?? '')}</p>}
        {snapshot.kind === 'image' && snapshot.url && (
          <figure className="flex max-h-full flex-col items-center gap-3">
            <img src={snapshot.url} alt="" className="max-h-[80vh] max-w-full select-none object-contain" draggable={false} />
            {typeof b.caption === 'string' && b.caption && <figcaption className="max-w-xl text-center text-[15px] text-white/85">{b.caption}</figcaption>}
          </figure>
        )}
        {snapshot.kind === 'gif' && <img src={String(b.url)} alt="" referrerPolicy="no-referrer" className="max-h-full max-w-full object-contain" />}
        {snapshot.kind === 'file' && snapshot.url && (
          <div className="rounded-lg bg-white/10 p-6 text-center">
            <FileText className="mx-auto size-10" />
            <p className="mt-3 font-semibold">{sanitizeName(b.name)}</p>
            <p className="text-sm text-white/60">{formatBytes(Number(b.size))}</p>
            <a href={snapshot.url} download={sanitizeName(b.name)} className="mt-4 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-black">
              <Download className="size-4" />
              Save a copy
            </a>
          </div>
        )}
        {snapshot.kind === 'location' && (
          <div className="rounded-lg bg-white/10 p-6 text-center">
            <MapPin className="mx-auto size-10" />
            <p className="mt-3 font-semibold">{String(b.label ?? 'Shared location')}</p>
            <p className="text-sm text-white/70">{formatCoord(Number(b.lat), Number(b.lng))}</p>
            <a href={mapsLink(Number(b.lat), Number(b.lng))} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-black">
              <ExternalLink className="size-4" />
              Open in Maps
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export function SystemMessage({ text }: { text: string }) {
  return (
    <div className="my-3 flex justify-center">
      <span className="max-w-[85%] text-center text-[12px] text-muted">{text}</span>
    </div>
  );
}
