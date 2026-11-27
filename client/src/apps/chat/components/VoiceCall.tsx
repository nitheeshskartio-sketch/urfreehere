import { LoaderCircle, LogOut, Phone, PhoneOff } from 'lucide-react';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Button } from '../../../ui/Button';
import { RoomView } from '../../mic/components/RoomView';
import { useRoom } from '../../mic/hooks';
import { micSupported } from '../../mic/lib/audio';
import { RoomClient, deviceId, type EndReason } from '../../mic/lib/room';
import { fetchConfig, fetchRoom, type MicConfig } from '../../mic/lib/signaling';
import { useEngine } from '../hooks';
import type { StoredEvent } from '../lib/types';

/**
 * Voice calls inside chats. One call at a time for the whole app, so moving
 * between chats doesn't hang up. The call runs on the voice-room service; the
 * room code travels only inside the chat (as a "voice" message).
 */
interface CallState {
  code: string;
  conv: string;
  title: string;
  minimized: boolean;
}

let call: CallState | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

export function openCall(conv: string, code: string, title: string) {
  call = call?.code === code ? { ...call, minimized: false } : { code, conv, title, minimized: false };
  emit();
}

function setMinimized(minimized: boolean) {
  if (call) call = { ...call, minimized };
  emit();
}

function closeCall() {
  call = null;
  emit();
}

export const useCall = () => useSyncExternalStore(subscribe, () => call);

const END_TEXT: Record<EndReason, string> = {
  left: 'You left the call',
  removed: 'You were removed from the call',
  host: 'The call was ended',
  expired: 'The call reached its time limit',
  empty: 'The call ended',
  replaced: 'You joined this call somewhere else',
};

function CallSession({ state }: { state: CallState }) {
  const e = useEngine();
  const client = useMemo(() => new RoomClient(), []);
  const c = useRoom(client);
  const [config, setConfig] = useState<MicConfig | null>(null);

  useEffect(() => {
    fetchConfig().then(setConfig, () => {});
    void client.join({
      code: state.code,
      profile: { name: e.profile?.name ?? 'Someone', avatar: e.profile?.avatar ?? null },
      withMic: micSupported(),
      deviceId: deviceId(),
    });
    return () => {
      if (client.phase === 'in-room' || client.phase === 'joining') client.leave();
    };
  }, [client, state.code]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ended or couldn't join: back to the chat with a short note.
  useEffect(() => {
    if (c.phase === 'ended') {
      e.toast(c.endReason ? END_TEXT[c.endReason] : 'The call ended');
      closeCall();
    } else if (c.phase === 'idle' && c.error) {
      const code = c.error.code;
      e.toast(
        code === 'NOT_FOUND' || code === 'CLOSED' || code === 'EXPIRED' ? 'This call has ended.' : code === 'FULL' ? 'This call is full.' : "Couldn't join the call. Try again.",
        'error',
      );
      closeCall();
    }
  }, [c.phase, c.endReason, c.error, e]);

  if (state.minimized) {
    const n = c.room?.participantCount ?? 0;
    return (
      <div className="fixed left-1/2 top-2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-success px-2 py-1.5 pl-4 text-[13px] font-medium text-white shadow-pop">
        <Phone className="size-4 animate-pulse" />
        <button type="button" onClick={() => setMinimized(false)} className="max-w-[40vw] truncate hover:underline" title="Return to the call">
          {state.title} · {n} in call
        </button>
        <button type="button" onClick={() => client.leave()} className="rounded-full bg-white/20 p-1.5 hover:bg-white/30" aria-label="Leave the call">
          <PhoneOff className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] bg-surface">
      {c.phase === 'in-room' && c.room ? (
        <RoomView client={client} config={config} call={{ title: state.title, onMinimize: () => setMinimized(true) }} />
      ) : (
        <div className="grid h-full place-items-center p-6 text-center">
          <div>
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-accent text-white">
              <Phone className="size-7" />
            </span>
            <p className="mt-4 text-lg font-semibold">{state.title}</p>
            <p className="mt-1 flex items-center justify-center gap-2 text-sm text-muted">
              <LoaderCircle className="size-4 animate-spin" />
              Joining the call…
            </p>
            <Button variant="secondary" className="mt-5" onClick={() => (client.leave(), closeCall())}>
              <LogOut />
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Mounted once in the chat app. */
export function VoiceCallLayer() {
  const state = useCall();
  return state ? <CallSession key={state.code} state={state} /> : null;
}

/** The "Voice call" message in a chat: join while it's on, "ended" afterwards. */
export function VoiceCard({ event, mine }: { event: StoredEvent; mine: boolean }) {
  const e = useEngine();
  const code = String(event.body.code);
  const current = useCall();
  const inThis = current?.code === code;
  const [open, setOpen] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    const check = () =>
      fetchRoom(code).then(
        (r) => live && setOpen(!r.locked || r.participantCount > 0),
        () => live && setOpen(false),
      );
    void check();
    const t = window.setInterval(check, 15_000);
    return () => {
      live = false;
      window.clearInterval(t);
    };
  }, [code]);

  const conv = e.convs.get(event.conv);
  const title = conv ? e.convTitle(conv) : 'Voice call';
  return (
    <div className="flex min-w-[220px] items-center gap-3">
      <span className={`grid size-10 shrink-0 place-items-center rounded-full ${open === false ? 'bg-surface text-muted' : 'bg-success text-white'}`}>
        {open === false ? <PhoneOff className="size-5" /> : <Phone className="size-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">Voice call</span>
        <span className="block text-[12.5px] text-muted">
          {open === false ? 'Ended' : inThis ? "You're in this call" : mine ? 'You started a call' : `${e.nameOf(event.author).split(' ')[0]} started a call`}
        </span>
      </span>
      {open !== false && !inThis && (
        <Button size="sm" onClick={() => openCall(event.conv, code, title)} disabled={open === null}>
          Join
        </Button>
      )}
    </div>
  );
}

/** "Alex is calling": shown when someone starts a call in one of my chats. */
export function IncomingCallPrompt() {
  const e = useEngine();
  const current = useCall();
  const [ring, setRing] = useState<{ event: StoredEvent; title: string } | null>(null);
  useEffect(
    () =>
      e.onIncoming((ev) => {
        if (ev.kind !== 'voice' || ev.author === e.me || Date.now() - ev.ts > 60_000) return;
        const conv = e.convs.get(ev.conv);
        if (!conv || conv.muted) return;
        setRing({ event: ev, title: e.convTitle(conv) });
      }),
    [e],
  );
  useEffect(() => {
    if (!ring) return;
    const t = window.setTimeout(() => setRing(null), 45_000);
    return () => window.clearTimeout(t);
  }, [ring]);
  if (!ring || current?.code === ring.event.body.code) return null;
  const who = e.nameOf(ring.event.author);
  const group = ring.event.conv.startsWith('g:');
  return (
    <div className="fixed left-1/2 top-3 z-[70] flex w-[min(92vw,380px)] -translate-x-1/2 items-center gap-3 rounded-xl border border-line bg-panel p-3 shadow-pop" role="alertdialog" aria-label={`${who} is calling`}>
      <span className="grid size-10 shrink-0 animate-pulse place-items-center rounded-full bg-success text-white">
        <Phone className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{who} is calling</span>
        <span className="block truncate text-[12.5px] text-muted">{group ? `Voice call in ${ring.title}` : 'Voice call'}</span>
      </span>
      <Button size="sm" variant="secondary" onClick={() => setRing(null)}>
        Ignore
      </Button>
      <Button
        size="sm"
        onClick={() => {
          openCall(ring.event.conv, String(ring.event.body.code), ring.title);
          setRing(null);
        }}
      >
        Join
      </Button>
    </div>
  );
}
