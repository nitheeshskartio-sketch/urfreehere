import { Handshake, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../ui/Button';
import { useEngine } from '../hooks';
import type { PromiseAnswer, StoredEvent } from '../lib/types';

/**
 * Replaces the message box while a promise is open. The asked person can only
 * answer Yes or No; the asker waits (or takes the promise back).
 */
export function PromiseBar({ promise, peerName }: { promise: StoredEvent; peerName: string }) {
  const e = useEngine();
  const [busy, setBusy] = useState<PromiseAnswer | null>(null);
  const mine = promise.author === e.me;
  const first = peerName.split(' ')[0];
  const answer = async (a: PromiseAnswer) => {
    setBusy(a);
    await e.answerPromise(promise, a);
    setBusy(null);
  };
  return (
    <div className="shrink-0 px-3 pb-3 pt-1 sm:px-5 sm:pb-4">
      <div className="rounded-md border border-accent bg-panel p-3 shadow-card" role="region" aria-label="Promise">
        <p className="flex items-center gap-2 text-[12.5px] font-semibold uppercase tracking-wide text-accent">
          <Handshake className="size-4" />
          {mine ? 'Your promise request' : `${first} asks you to promise`}
        </p>
        <p className="chat-text mt-1.5 whitespace-pre-wrap break-words font-medium">“{String(promise.body.text)}”</p>
        {mine ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] text-muted">Waiting for {first} to answer. The chat continues after they say Yes or No.</p>
            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void answer('cancel')}>
              {busy === 'cancel' && <LoaderCircle className="animate-spin" />}
              Take it back
            </Button>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={!!busy} onClick={() => void answer('no')}>
              {busy === 'no' && <LoaderCircle className="animate-spin" />}
              No
            </Button>
            <Button disabled={!!busy} onClick={() => void answer('yes')}>
              {busy === 'yes' && <LoaderCircle className="animate-spin" />}
              Yes, I promise 🤞
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** The promise inside the conversation, with its outcome. */
export function PromiseCard({ event, mine }: { event: StoredEvent; mine: boolean }) {
  const e = useEngine();
  const st = e.promiseStatus(event);
  const asker = mine ? 'You' : e.nameOf(event.author).split(' ')[0];
  const by = st.by ? (st.by === e.me ? 'You' : e.nameOf(st.by).split(' ')[0]) : '';
  const outcome =
    st.status === 'yes'
      ? `🤞 ${by} promised`
      : st.status === 'no'
        ? `${by} said no`
        : st.status === 'cancel'
          ? `${asker} took it back`
          : mine
            ? 'Waiting for an answer…'
            : 'Answer below: Yes or No';
  return (
    <div className="min-w-[200px]">
      <p className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-accent">
        <Handshake className="size-3.5" />
        Promise
      </p>
      <p className={`chat-text mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${st.status === 'no' || st.status === 'cancel' ? 'text-muted line-through' : 'font-medium'}`}>
        {String(event.body.text)}
      </p>
      <p className={`mt-1.5 text-[12.5px] ${st.status === 'yes' ? 'font-semibold text-success' : 'text-muted'}`}>{outcome}</p>
    </div>
  );
}

/** A hug or slap inside the conversation; tap to see it again. */
export function GestureCard({ kind, mine, onReplay }: { kind: 'hug' | 'slap'; mine: boolean; onReplay: () => void }) {
  return (
    <button type="button" onClick={onReplay} className="flex items-center gap-3 text-left" title="Play again">
      <span className="text-4xl leading-none">{kind === 'hug' ? '🤗' : '🖐️'}</span>
      <span>
        <span className="block font-semibold">{kind === 'hug' ? 'Virtual hug' : 'Virtual slap'}</span>
        <span className="block text-[12.5px] text-muted">{mine ? `You sent a ${kind}` : 'Tap to feel it again'}</span>
      </span>
    </button>
  );
}
