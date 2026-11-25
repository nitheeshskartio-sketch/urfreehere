import { FileText, Image as ImageIcon, MapPin, Paperclip, SendHorizontal, Smile, X } from 'lucide-react';
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { useEngine } from '../hooks';
import { EMOJI } from '../lib/emoji';
import { DOCUMENT_ACCEPT, IMAGE_ACCEPT, classify } from '../lib/media';
import type { StoredEvent } from '../lib/types';
import { LocationPicker } from './LocationPicker';
import { Menu } from '../../../ui/Menu';

export function Composer({
  convId,
  replyTo,
  onCancelReply,
}: {
  convId: string;
  replyTo: StoredEvent | null;
  onCancelReply: () => void;
}) {
  const e = useEngine();
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
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

  const send = () => {
    if (!text.trim()) return;
    void e.sendText(convId, text, replyTo?.id ?? null);
    update('');
    onCancelReply();
    setEmojiOpen(false);
  };

  const onKey = (ev: KeyboardEvent<HTMLTextAreaElement>) => {
    if (ev.key === 'Enter' && !ev.shiftKey && e.settings.enterToSend && !ev.nativeEvent.isComposing) {
      ev.preventDefault();
      send();
    }
  };

  const sendFiles = (files: File[], as?: 'image' | 'document') => {
    if (!files.length) return;
    const images = files.filter((f) => classify(f.name) === 'image');
    const docs = files.filter((f) => !images.includes(f));
    if (as === 'image' || images.length) void e.sendFiles(convId, as === 'image' ? files : images, 'image', '', replyTo?.id ?? null);
    if (as !== 'image' && docs.length) void e.sendFiles(convId, docs, 'document', '', replyTo?.id ?? null);
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
    <div className="shrink-0 border-t border-line bg-white">
      {replyTo && (
        <div className="flex items-center gap-3 border-b border-line px-3 py-2 sm:px-4">
          <div className="min-w-0 flex-1 border-l-[3px] border-accent pl-2.5">
            <p className="text-[12px] font-semibold text-accent">Replying to {e.nameOf(replyTo.author)}</p>
            <p className="truncate text-[13px] text-muted">{e.describe(replyTo)}</p>
          </div>
          <button type="button" onClick={onCancelReply} className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-ink" aria-label="Cancel reply">
            <X className="size-4" />
          </button>
        </div>
      )}

      {emojiOpen && (
        <div className="max-h-[260px] overflow-y-auto border-b border-line px-3 py-2">
          {EMOJI.map((group) => (
            <div key={group.label} className="mb-2">
              <p className="sticky top-0 bg-white py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{group.label}</p>
              <div className="grid grid-cols-8 gap-0.5 sm:grid-cols-12">
                {group.items.map((em) => (
                  <button key={em} type="button" onClick={() => insertEmoji(em)} className="rounded-md p-1 text-[22px] leading-none hover:bg-surface" aria-label={`Insert ${em}`}>
                    {em}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-1 px-2 py-2 sm:px-3">
        <button
          type="button"
          onClick={() => setEmojiOpen((o) => !o)}
          className={`mb-0.5 rounded-md p-2 transition-colors hover:bg-surface ${emojiOpen ? 'text-accent' : 'text-muted hover:text-ink'}`}
          aria-label="Emoji"
          aria-pressed={emojiOpen}
        >
          <Smile className="size-5" />
        </button>
        <div className="mb-0.5">
          <Menu
            label="Attach"
            align="left"
            trigger={<Paperclip className="size-5" />}
            items={[
              { label: 'Photos', icon: ImageIcon, onSelect: () => imageInput.current?.click() },
              { label: 'Document', icon: FileText, onSelect: () => docInput.current?.click() },
              { label: 'Location', icon: MapPin, onSelect: () => setLocationOpen(true) },
            ]}
          />
        </div>
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
          className="max-h-40 min-h-[40px] flex-1 resize-none rounded-xl border border-transparent bg-surface px-3.5 py-2.5 text-[15px] leading-snug placeholder:text-muted focus:border-accent/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/15"
        />
        <button
          type="button"
          onClick={send}
          disabled={!text.trim()}
          className="mb-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent-hover disabled:bg-slate-200 disabled:text-muted"
          aria-label="Send"
        >
          <SendHorizontal className="size-[18px]" />
        </button>
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
      {locationOpen && (
        <LocationPicker
          onClose={() => setLocationOpen(false)}
          onSend={(loc) => {
            void e.sendLocation(convId, loc, replyTo?.id ?? null);
            setLocationOpen(false);
            onCancelReply();
          }}
        />
      )}
    </div>
  );
}
