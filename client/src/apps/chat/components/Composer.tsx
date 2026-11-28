import { Check, EyeOff, FileText, Flame, Hand, Handshake, Heart, Image as ImageIcon, MapPin, Paperclip, SendHorizontal, Smile, X, DoorOpen } from 'lucide-react';
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { useEngine } from '../hooks';
import { DOCUMENT_ACCEPT, IMAGE_ACCEPT, classify } from '../lib/media';
import type { SendMode, StoredEvent } from '../lib/types';
import { AttachmentPreview, type PendingAttachment } from './AttachmentPreview';
import { ExpressionPicker } from './ExpressionPicker';
import { LocationPicker } from './LocationPicker';
import { Menu } from '../../../ui/Menu';

export function Composer({
  dropped,
  onDroppedHandled,
  convId,
  replyTo,
  onCancelReply,
  twoPerson = false,
  onGesture,
}: {
  /** A direct chat with an accepted contact: hugs and promises are offered. */
  twoPerson?: boolean;
  onGesture?: (kind: 'hug' | 'slap' | 'knock') => void;
  /** Files dropped onto the conversation, to preview before sending. */
  dropped?: File[] | null;
  onDroppedHandled?: () => void;
  convId: string;
  replyTo: StoredEvent | null;
  onCancelReply: () => void;
}) {
  const e = useEngine();
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  /** Applies to everything sent from this box until changed: normal, secret (masked) or view once. */
  const [mode, setMode] = useState<SendMode>('normal');
  const [sendMenu, setSendMenu] = useState(false);
  const sendWrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sendMenu) return;
    const close = (ev: MouseEvent) => !sendWrap.current?.contains(ev.target as Node) && setSendMenu(false);
    const esc = (ev: globalThis.KeyboardEvent) => ev.key === 'Escape' && setSendMenu(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [sendMenu]);
  const [locationOpen, setLocationOpen] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);

  // Keep a draft per conversation.
  const drafts = useRef(new Map<string, string>());
  useEffect(() => {
    setText(drafts.current.get(convId) ?? '');
    setEmojiOpen(false);
    area.current?.focus({ preventScroll: true });
  }, [convId]);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  useEffect(() => {
    if (replyTo) area.current?.focus();
  }, [replyTo]);

  const update = (v: string) => {
    setText(v);
    drafts.current.set(convId, v);
    if (v.trim()) e.sendTyping(convId);
  };

  const send = (as: SendMode = mode) => {
    if (!text.trim()) return;
    void e.sendText(convId, text, replyTo?.id ?? null, as);
    update('');
    onCancelReply();
    setEmojiOpen(false);
  };

  const onKey = (ev: KeyboardEvent<HTMLTextAreaElement>) => {
    if (ev.key === 'Enter' && ev.shiftKey && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      return send('secret');
    }
    if (ev.key === 'Enter' && !ev.shiftKey && e.settings.enterToSend && !ev.nativeEvent.isComposing) {
      ev.preventDefault();
      send();
    }
  };

  /** Attachments wait in a preview where the caption and Send as mode are chosen. */
  const [pending, setPending] = useState<PendingAttachment | null>(null);
  const sendFiles = (files: File[], as?: 'image' | 'document') => {
    if (files.length) setPending({ type: 'files', files, as });
  };

  useEffect(() => {
    if (dropped?.length) {
      setPending({ type: 'files', files: dropped });
      onDroppedHandled?.();
    }
  }, [dropped, onDroppedHandled]);

  const sendPending = (p: PendingAttachment, sendMode: SendMode, caption: string) => {
    const reply = replyTo?.id ?? null;
    if (p.type === 'gif') {
      const g = p.gif;
      void e.sendGif(convId, { id: g.id, url: g.full.url, width: g.full.width, height: g.full.height, title: g.title }, p.sticker, reply, sendMode);
    } else {
      const images = p.files.filter((f) => classify(f.name) === 'image');
      const docs = p.files.filter((f) => !images.includes(f));
      // The caption goes with the first item sent.
      if (images.length) void e.sendFiles(convId, images, 'image', caption, reply, sendMode);
      if (docs.length) void e.sendFiles(convId, docs, 'document', images.length ? '' : caption, images.length ? null : reply, sendMode);
    }
    setPending(null);
    onCancelReply();
  };

  const onPaste = (ev: ClipboardEvent) => {
    const files = Array.from(ev.clipboardData.files);
    if (files.length) {
      ev.preventDefault();
      sendFiles(files);
    }
  };

  const insertEmoji = (emoji: string) => {
    const el = area.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    update(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  return (
    <div className="shrink-0 px-3 pb-3 pt-1 sm:px-5 sm:pb-4">
      {/* Teams-style compose box: an underline in the brand colour shows focus */}
      <div
        className={`relative rounded-md border bg-panel shadow-card transition-shadow focus-within:shadow-[inset_0_-2px_0_rgb(var(--c-accent)),var(--shadow-card)] ${
          mode !== 'normal' ? 'border-accent' : 'border-line'
        }`}
      >
        {mode !== 'normal' && (
          <div className="flex items-center gap-2 rounded-t-md border-b border-line bg-accent-soft px-3 py-1.5 text-[12.5px]">
            {mode === 'secret' ? <EyeOff className="size-4 shrink-0 text-accent" /> : <Flame className="size-4 shrink-0 text-accent" />}
            <span className="flex-1 text-ink-soft">
              {mode === 'secret' ? (
                <>
                  <span className="font-semibold">Secret mode</span>: what you send stays hidden until clicked.
                </>
              ) : (
                <>
                  <span className="font-semibold">View once</span>: what you send can be opened only once, then it disappears.
                </>
              )}
            </span>
            <button type="button" onClick={() => setMode('normal')} className="shrink-0 font-semibold text-accent hover:underline">
              Turn off
            </button>
          </div>
        )}
        {replyTo && (
          <div className="flex items-center gap-3 border-b border-line px-3 py-2">
            <div className="min-w-0 flex-1 border-l-[3px] border-accent pl-2.5">
              <p className="truncate text-[12px] font-semibold text-ink-soft">Replying to {e.nameOf(replyTo.author)}</p>
              <p className="truncate text-[13px] text-muted">{e.describe(replyTo).slice(0, 240)}</p>
            </div>
            <button type="button" onClick={onCancelReply} className="rounded-md p-1.5 text-muted hover:bg-subtle hover:text-ink" aria-label="Cancel reply">
              <X className="size-4" />
            </button>
          </div>
        )}

        {emojiOpen && (
          <ExpressionPicker
            onEmoji={insertEmoji}
            onGif={(g, sticker) => {
              setEmojiOpen(false);
              setPending({ type: 'gif', gif: g, sticker });
            }}
            onClose={() => setEmojiOpen(false)}
          />
        )}
        <div className="flex items-end gap-1 py-1 pl-3 pr-1.5">
          <textarea
            ref={area}
            value={text}
            onChange={(ev) => update(ev.target.value)}
            onKeyDown={onKey}
            onPaste={onPaste}
            rows={1}
            maxLength={8000}
            placeholder="Type a message"
            aria-label="Message"
            className="chat-text max-h-40 min-h-[36px] flex-1 resize-none bg-transparent py-2 placeholder:text-muted focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <button
            type="button"
            onClick={() => setEmojiOpen((o) => !o)}
            data-expression-toggle
            title="Emoji, GIFs and stickers"
            className={`mb-0.5 rounded-md p-1.5 transition-colors hover:bg-subtle ${emojiOpen ? 'text-accent' : 'text-muted hover:text-ink'}`}
            aria-label="Emoji, GIFs and stickers"
            aria-pressed={emojiOpen}
          >
            <Smile className="size-5" />
          </button>
          <div className="mb-0.5">
            <Menu
              label="Attach"
              align="right"
              trigger={<Paperclip className="size-5" />}
              items={[
                { label: 'Photos', icon: ImageIcon, onSelect: () => imageInput.current?.click() },
                { label: 'Document', icon: FileText, onSelect: () => docInput.current?.click() },
                { label: 'Location', icon: MapPin, onSelect: () => setLocationOpen(true) },
                { label: 'Virtual hug', icon: Heart, hidden: !twoPerson || !onGesture, onSelect: () => onGesture?.('hug') },
                { label: 'Virtual slap', icon: Hand, hidden: !twoPerson || !onGesture, onSelect: () => onGesture?.('slap') },
                { label: 'Knock knock', icon: DoorOpen, hidden: !twoPerson || !onGesture, onSelect: () => onGesture?.('knock') },
                {
                  label: 'Ask for a promise',
                  icon: Handshake,
                  hidden: !twoPerson,
                  onSelect: () => {
                    if (!text.trim()) {
                      e.toast('Type what they should promise, then choose "Ask for a promise" again.');
                      area.current?.focus();
                      return;
                    }
                    void e.sendPromise(convId, text);
                    update('');
                    onCancelReply();
                  },
                },
              ]}
            />
          </div>
          <span className="mx-1 mb-2 h-5 w-px bg-line" aria-hidden="true" />
          <div ref={sendWrap} className="relative mb-0.5">
            {/* Right-click (or long-press) the Send button for secret sending, like a spoiler. */}
            <button
              type="button"
              onClick={() => send()}
              onContextMenu={(ev) => {
                ev.preventDefault();
                setSendMenu(true);
              }}
              aria-disabled={!text.trim()}
              aria-haspopup="menu"
              className={`flex size-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent-soft ${text.trim() ? 'text-accent' : 'text-muted'}`}
              aria-label={mode === 'secret' ? 'Send secretly' : mode === 'once' ? 'Send as view once' : 'Send'}
              title={mode === 'normal' ? `Send (right-click to send secretly, as view once${twoPerson ? ' or as a promise' : ''})` : 'Right-click for options'}
            >
              {mode === 'secret' ? <EyeOff className="size-5" /> : mode === 'once' ? <Flame className="size-5" /> : <SendHorizontal className="size-5" />}
            </button>
            {sendMenu && (
              <div role="menu" className="absolute bottom-full right-0 z-40 mb-2 w-[260px] overflow-hidden rounded-lg border border-line bg-panel py-1 shadow-pop">
                {twoPerson && (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!text.trim()}
                    onClick={() => {
                      setSendMenu(false);
                      if (!text.trim()) return;
                      void e.sendPromise(convId, text);
                      update('');
                      onCancelReply();
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-subtle disabled:opacity-50 disabled:hover:bg-transparent"
                  >
                    <Handshake className="size-4 shrink-0 text-muted" />
                    <span className="flex-1">
                      Ask as a promise
                      <span className="block text-[11.5px] text-muted">The chat pauses until they say Yes or No</span>
                    </span>
                  </button>
                )}
                {(
                  [
                    ['secret', EyeOff, 'Send secretly', 'Hidden until clicked', 'Ctrl⇧↵'],
                    ['once', Flame, 'Send as view once', 'Can be opened only once', ''],
                  ] as const
                ).map(([m, Icon, label, hint, kbd]) => (
                  <button
                    key={m}
                    type="button"
                    role="menuitem"
                    disabled={!text.trim()}
                    onClick={() => {
                      setSendMenu(false);
                      send(m);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-subtle disabled:opacity-50 disabled:hover:bg-transparent"
                  >
                    <Icon className="size-4 shrink-0 text-muted" />
                    <span className="flex-1">
                      {label}
                      <span className="block text-[11.5px] text-muted">{hint}</span>
                    </span>
                    {kbd && <kbd className="text-[11px] text-muted">{kbd}</kbd>}
                  </button>
                ))}
                <div className="my-1 border-t border-line" />
                <p className="px-3 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Keep using for photos, GIFs &amp; files</p>
                {(
                  [
                    ['normal', 'Normal'],
                    ['secret', 'Secret mode'],
                    ['once', 'View once mode'],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    role="menuitemradio"
                    aria-checked={mode === m}
                    onClick={() => {
                      setSendMenu(false);
                      setMode(m);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm hover:bg-subtle"
                  >
                    <span className="flex size-4 items-center justify-center">{mode === m && <Check className="size-4 text-accent" />}</span>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <input
        ref={imageInput}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(ev) => {
          sendFiles(Array.from(ev.target.files ?? []), 'image');
          ev.target.value = '';
        }}
      />
      <input
        ref={docInput}
        type="file"
        accept={DOCUMENT_ACCEPT}
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(ev) => {
          sendFiles(Array.from(ev.target.files ?? []), 'document');
          ev.target.value = '';
        }}
      />
      {pending && <AttachmentPreview pending={pending} initialMode={mode} onCancel={() => setPending(null)} onSend={sendPending} />}
      {locationOpen && (
        <LocationPicker
          initialMode={mode}
          onClose={() => setLocationOpen(false)}
          onSend={(loc, sendMode) => {
            void e.sendLocation(convId, loc, replyTo?.id ?? null, sendMode);
            setLocationOpen(false);
            onCancelReply();
          }}
        />
      )}
    </div>
  );
}
