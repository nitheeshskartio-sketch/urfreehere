import { Check, Fingerprint, Lock, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '../../../ui/Button';
import { Modal } from '../../../ui/Modal';
import { Avatar } from '../../../ui/avatar/Avatar';
import { useEngine } from '../hooks';
import { biometricAvailable, checkPin, enrollBiometric, makeLock, PIN_RE, verifyBiometric } from '../lib/chatlock';
import { normalizeLoginCode } from '../lib/identity';
import type { ConvId, StoredEvent } from '../lib/types';

const pinInput =
  'h-12 w-full rounded-md border border-line bg-panel px-3 text-center font-mono text-xl tracking-[0.5em] placeholder:tracking-normal placeholder:text-muted focus:border-accent focus:outline-none';

// ------------------------------------------------------------------ chat lock

/** Creates (or replaces) the chat-lock PIN, with optional fingerprint / face. */
export function LockSetupDialog({ onDone, onClose, title = 'Set a chat lock PIN' }: { onDone: () => void; onClose: () => void; title?: string }) {
  const e = useEngine();
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [bio, setBio] = useState(false);
  const [canBio, setCanBio] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => void biometricAvailable().then((ok) => (setCanBio(ok), setBio(ok))), []);
  const error = pin && !PIN_RE.test(pin) ? 'Use 4 to 8 digits.' : again && again !== pin ? "The PINs don't match." : '';
  const submit = async (ev?: FormEvent) => {
    ev?.preventDefault();
    if (!PIN_RE.test(pin) || pin !== again) return;
    setBusy(true);
    const credId = bio ? await enrollBiometric(e.profile?.name ?? '') : null;
    if (bio && !credId) e.toast("Fingerprint / face wasn't set up. You can still use your PIN.", 'error');
    await e.updateSettings({ chatLock: await makeLock(pin, credId ?? undefined) });
    setBusy(false);
    onDone();
  };
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy || !PIN_RE.test(pin) || pin !== again}>
            Save PIN
          </Button>
        </div>
      }
    >
      <form onSubmit={(ev) => void submit(ev)} className="space-y-3 p-4 sm:p-5">
        <p className="text-sm leading-relaxed text-ink-soft">Locked chats need this PIN to open. It's kept only on this device. Their messages are hidden from the chat list and notifications.</p>
        <input className={pinInput} inputMode="numeric" type="password" autoComplete="new-password" maxLength={8} placeholder="New PIN" aria-label="New PIN" value={pin} onChange={(ev) => setPin(ev.target.value.replace(/\D/g, ''))} data-autofocus="" />
        <input className={pinInput} inputMode="numeric" type="password" autoComplete="new-password" maxLength={8} placeholder="Repeat PIN" aria-label="Repeat PIN" value={again} onChange={(ev) => setAgain(ev.target.value.replace(/\D/g, ''))} />
        {error && <p className="text-[13px] text-danger">{error}</p>}
        {canBio && (
          <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-line px-3 py-2.5 text-sm">
            <input type="checkbox" checked={bio} onChange={(ev) => setBio(ev.target.checked)} className="size-4 accent-[rgb(var(--c-accent))]" />
            <Fingerprint className="size-4 text-accent" />
            Also unlock with fingerprint or face
          </label>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/**
 * PIN (or fingerprint / face) check. Used in place of a locked chat, and as a
 * dialog before removing a lock.
 */
export function UnlockForm({ onUnlocked, compact = false }: { onUnlocked: () => void; compact?: boolean }) {
  const e = useEngine();
  const cfg = e.settings.chatLock;
  const [pin, setPin] = useState('');
  const [wrong, setWrong] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [code, setCode] = useState('');
  const [resetting, setResetting] = useState(false);
  const tried = useRef(false);

  const bio = async () => {
    if (cfg?.credId && (await verifyBiometric(cfg.credId))) onUnlocked();
  };
  // Offer fingerprint / face straight away (once).
  useEffect(() => {
    if (!tried.current && cfg?.credId && !compact) {
      tried.current = true;
      void bio();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cfg || pin.length < 4) return;
    let alive = true;
    void checkPin(cfg, pin).then((ok) => {
      if (!alive) return;
      if (ok) onUnlocked();
      else if (pin.length >= 8) setWrong(true);
    });
    return () => {
      alive = false;
    };
  }, [pin]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cfg) return null;
  if (resetting) return <LockSetupDialog title="Set a new PIN" onClose={() => setResetting(false)} onDone={onUnlocked} />;

  const checkCode = async () => {
    const n = await normalizeLoginCode(code);
    if (n && e.identity?.loginCode && n === e.identity.loginCode) setResetting(true);
    else e.toast("That isn't your login code.", 'error');
  };

  return (
    <div className={`mx-auto flex w-full max-w-xs flex-col items-center text-center ${compact ? '' : 'py-10'}`}>
      {!compact && (
        <span className="mb-3 grid size-14 place-items-center rounded-full bg-accent-soft text-accent">
          <Lock className="size-6" />
        </span>
      )}
      {!compact && <p className="text-[15px] font-semibold">This chat is locked</p>}
      <p className="mb-4 mt-1 text-[13px] text-muted">Enter your chat lock PIN{cfg.credId ? ', or use fingerprint / face' : ''}.</p>
      {!forgot ? (
        <>
          <input
            className={pinInput}
            inputMode="numeric"
            type="password"
            autoComplete="off"
            maxLength={8}
            placeholder="PIN"
            aria-label="Chat lock PIN"
            value={pin}
            data-autofocus=""
            autoFocus={!compact}
            onChange={(ev) => {
              setWrong(false);
              setPin(ev.target.value.replace(/\D/g, ''));
            }}
            onKeyDown={(ev) => {
              if (ev.key !== 'Enter' || !pin) return;
              void checkPin(cfg, pin).then((ok) => (ok ? onUnlocked() : setWrong(true)));
            }}
          />
          {wrong && <p className="mt-2 text-[13px] text-danger">Wrong PIN. Try again.</p>}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {cfg.credId && (
              <Button variant="secondary" size="sm" onClick={() => void bio()}>
                <Fingerprint />
                Fingerprint / face
              </Button>
            )}
            {e.identity?.loginCode && (
              <button type="button" onClick={() => setForgot(true)} className="text-[13px] font-medium text-accent hover:underline">
                Forgot PIN?
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="mb-2 text-[13px] text-ink-soft">Enter your login code to set a new PIN.</p>
          <input
            className="h-10 w-full rounded-md border border-line bg-panel px-3 text-center font-mono text-sm uppercase focus:border-accent focus:outline-none"
            placeholder="Login code"
            aria-label="Login code"
            value={code}
            onChange={(ev) => setCode(ev.target.value)}
            onKeyDown={(ev) => ev.key === 'Enter' && void checkCode()}
          />
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setForgot(false)}>
              Back
            </Button>
            <Button size="sm" onClick={() => void checkCode()} disabled={!code.trim()}>
              Continue
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function UnlockDialog({ title, onUnlocked, onClose }: { title: string; onUnlocked: () => void; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="p-4 sm:p-5">
        <UnlockForm compact onUnlocked={onUnlocked} />
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ mute

const MUTE_OPTIONS: [string, number | null][] = [
  ['1 hour', 3600_000],
  ['8 hours', 8 * 3600_000],
  ['1 day', 86_400_000],
  ['1 week', 7 * 86_400_000],
  ['Until I unmute', null],
];

const pad = (n: number) => String(n).padStart(2, '0');
const localInput = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function MuteDialog({ conv, onClose }: { conv: ConvId; onClose: () => void }) {
  const e = useEngine();
  const [custom, setCustom] = useState(() => localInput(Date.now() + 3600_000));
  const pick = (until: number | null) => {
    e.muteUntil(conv, until);
    e.toast(until ? `Muted until ${mutedUntilText(until)}` : 'Muted', 'success');
    onClose();
  };
  const customTs = new Date(custom).getTime();
  return (
    <Modal title="Mute notifications" onClose={onClose}>
      <div className="space-y-1 p-3 sm:p-4">
        {MUTE_OPTIONS.map(([label, ms]) => (
          <button key={label} type="button" onClick={() => pick(ms ? Date.now() + ms : null)} className="flex w-full items-center rounded-md px-3 py-2.5 text-left text-sm hover:bg-surface">
            {label}
          </button>
        ))}
        <div className="mt-2 border-t border-line px-3 pt-3">
          <p className="mb-2 text-[13px] font-medium text-ink-soft">Until a date and time</p>
          <div className="flex flex-wrap gap-2">
            <input
              type="datetime-local"
              value={custom}
              min={localInput(Date.now())}
              onChange={(ev) => setCustom(ev.target.value)}
              className="h-10 min-w-0 flex-1 rounded-md border border-line bg-panel px-3 text-sm focus:border-accent focus:outline-none"
              aria-label="Unmute at"
            />
            <Button onClick={() => pick(customTs)} disabled={!(customTs > Date.now())}>
              Mute
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function mutedUntilText(t: number) {
  const d = new Date(t);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

// ------------------------------------------------------------------ background

/** Chat backgrounds made to sit under our message bubbles in light and dark mode (see .chat-bg-* in index.css). */
export const BACKGROUNDS: { id: string; label: string }[] = [
  { id: '', label: 'Default' },
  { id: 'lavender', label: 'Lavender' },
  { id: 'mist', label: 'Mist' },
  { id: 'mint', label: 'Mint' },
  { id: 'sand', label: 'Sand' },
  { id: 'blush', label: 'Blush' },
  { id: 'dots', label: 'Dots' },
  { id: 'grid', label: 'Grid' },
  { id: 'aurora', label: 'Aurora' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'honey', label: 'Honey' },
  { id: 'night', label: 'Night sky' },
];

export function BackgroundDialog({ conv, onClose }: { conv: ConvId; onClose: () => void }) {
  const e = useEngine();
  const current = e.convs.get(conv)?.background ?? '';
  return (
    <Modal title="Chat background" onClose={onClose} wide>
      <div className="p-4 sm:p-5">
        <p className="mb-3 text-[13px] text-muted">Only you see it, only in this chat. Each one matches the message colours in light and dark mode.</p>
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
          {BACKGROUNDS.map((b) => (
            <button
              key={b.id || 'default'}
              type="button"
              onClick={() => {
                e.updateConv(conv, { background: b.id || undefined });
                onClose();
              }}
              aria-pressed={current === b.id}
              className={`group relative overflow-hidden rounded-lg border-2 text-left ${current === b.id ? 'border-accent' : 'border-line hover:border-accent/50'}`}
            >
              <div className={`flex h-24 flex-col justify-center gap-1.5 bg-canvas px-2.5 ${b.id ? `chat-bg-${b.id}` : ''}`}>
                <span className="h-3.5 w-3/5 rounded bg-panel shadow-card" />
                <span className="ml-auto h-3.5 w-1/2 rounded bg-bubble-own" />
                <span className="h-3.5 w-2/5 rounded bg-panel shadow-card" />
              </div>
              <span className="flex items-center justify-between border-t border-line bg-panel px-2 py-1.5 text-[12px] font-medium">
                {b.label}
                {current === b.id && <Check className="size-3.5 text-accent" />}
              </span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ spotlight

const SPOT_OPTIONS: [string, number][] = [
  ['1 hour', 3600_000],
  ['8 hours', 8 * 3600_000],
  ['1 day', 86_400_000],
  ['3 days', 3 * 86_400_000],
];

export function SpotlightDialog({ event, onClose }: { event: StoredEvent; onClose: () => void }) {
  const e = useEngine();
  return (
    <Modal title="Spotlight this message" onClose={onClose}>
      <div className="p-4 sm:p-5">
        <p className="mb-3 line-clamp-3 rounded-md border-l-[3px] border-accent bg-surface px-3 py-2 text-[13px] text-ink-soft [overflow-wrap:anywhere]">{e.describe(event)}</p>
        <p className="mb-2 text-[13px] text-muted">It shows at the top of the chat for everyone here. How long?</p>
        <div className="grid grid-cols-2 gap-2">
          {SPOT_OPTIONS.map(([label, ms]) => (
            <Button
              key={label}
              variant="secondary"
              onClick={() => {
                void e.setSpotlight(event.conv, event.id, ms);
                onClose();
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

const left = (until: number) => {
  const m = Math.max(1, Math.round((until - Date.now()) / 60_000));
  return m < 60 ? `${m} min left` : m < 48 * 60 ? `${Math.round(m / 60)} h left` : `${Math.round(m / 1440)} days left`;
};

export function SpotlightBar({ conv, onJump }: { conv: ConvId; onJump: (id: string) => void }) {
  const e = useEngine();
  const s = e.spotlightOf(conv);
  // Re-check every half minute so it disappears on time.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!s) return;
    const t = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, [!!s]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s) return null;
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-line bg-panel/95 px-3 py-2 sm:px-5">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
        <Sparkles className="size-4" />
      </span>
      <button type="button" onClick={() => onJump(s.event.id)} className="min-w-0 flex-1 text-left" title="Show this message">
        <span className="block text-[11.5px] font-semibold text-accent">
          Spotlight · {e.nameOf(s.event.author)} · {left(s.spot.until)}
        </span>
        <span className="block truncate text-[13px] text-ink-soft">{e.describe(s.event)}</span>
      </button>
      <button type="button" onClick={() => void e.setSpotlight(conv, null)} className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-ink" aria-label="Remove spotlight" title="Remove spotlight">
        <X className="size-4" />
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ forward

export function ForwardDialog({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone?: () => void }) {
  const e = useEngine();
  const [picked, setPicked] = useState<Set<ConvId>>(new Set());
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const convs = [...e.convs.values()]
    .filter((c) => !c.hidden && !c.joining && (c.type === 'group' ? e.group(c)?.members.has(e.me) && !e.group(c)?.deleted : e.contacts.get(c.peerId!)?.state === 'contact' || e.isSelfChat(c.id)))
    .filter((c) => !q || e.convTitle(c).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.lastTs - a.lastTs);
  const toggle = (id: ConvId) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const send = async () => {
    setBusy(true);
    await e.forward(ids, [...picked]);
    setBusy(false);
    e.toast(`Forwarded to ${picked.size} chat${picked.size === 1 ? '' : 's'}`, 'success');
    onDone?.();
    onClose();
  };
  return (
    <Modal
      title={`Forward ${ids.length} message${ids.length === 1 ? '' : 's'}`}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void send()} disabled={!picked.size || busy}>
            Send{picked.size ? ` (${picked.size})` : ''}
          </Button>
        </div>
      }
    >
      <div className="p-3 sm:p-4">
        <input
          value={q}
          onChange={(ev) => setQ(ev.target.value)}
          placeholder="Search chats"
          aria-label="Search chats"
          className="mb-2 h-9 w-full rounded-md border border-line bg-panel px-3 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <div className="max-h-[50vh] overflow-y-auto">
          {convs.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-surface">
              <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} className="size-4 accent-[rgb(var(--c-accent))]" />
              <Avatar avatar={e.convImage(c)} name={e.convTitle(c)} seed={c.peerId ?? c.groupId} size={32} group={c.type === 'group'} />
              <span className="min-w-0 flex-1 truncate text-sm">{e.convTitle(c)}</span>
            </label>
          ))}
          {!convs.length && <p className="py-6 text-center text-sm text-muted">No chats found.</p>}
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ here now

/** "In this chat" / "Priya, Raj here": the people who have this chat open right now. */
export function HereNow({ conv, isGroup }: { conv: ConvId; isGroup: boolean }) {
  const e = useEngine();
  const here = e.hereIn(conv);
  if (!here.length) return null;
  const names = here.map((u) => e.nameOf(u).split(' ')[0]);
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-success" title={isGroup ? `${names.join(', ')} ${here.length === 1 ? 'has' : 'have'} this chat open` : 'Has this chat open right now'}>
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
        <span className="relative inline-flex size-2 rounded-full bg-success" />
      </span>
      {isGroup ? `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` +${names.length - 3}` : ''} here` : 'In this chat'}
    </span>
  );
}
