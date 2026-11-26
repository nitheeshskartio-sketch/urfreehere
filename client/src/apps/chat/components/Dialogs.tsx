import { Camera, CameraOff, ImageUp, LoaderCircle, QrCode, RotateCcw, Users } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '../../../ui/Button';
import { CopyButton } from '../../../ui/CopyButton';
import { useEngine } from '../hooks';
import { formatUserId, parseUserId } from '../lib/encoding';
import type { LocalInvite } from '../lib/engine';
import { MAX_GROUP_MEMBERS } from '../lib/groups';
import { decodeQr, parseScan, type ScanTarget } from '../../../lib/qr';
import type { InviteLookup } from '../lib/signaling';
import type { AvatarRef } from '../lib/types';
import { Avatar } from '../../../ui/avatar/Avatar';
import { AvatarPicker } from '../../../ui/avatar/AvatarPicker';
import { ContactPicker } from './InfoPanel';
import { Field, Modal, inputClass } from '../../../ui/Modal';
import { ShareCard } from '../../../ui/ShareCard';

export const userLink = (id: string) => `${window.location.origin}/chat/u/${id}`;
export const inviteLink = (token: string) => `${window.location.origin}/join/${token}`;
const formatInviteCode = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;

// ---------------------------------------------------------------- new chat

export function NewChatDialog({ onClose, onOpen, onScan }: { onClose: () => void; onOpen: (convId: string) => void; onScan: () => void }) {
  const e = useEngine();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [showMine, setShowMine] = useState(false);

  const [checking, setChecking] = useState(false);
  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const id = parseUserId(value);
    if (!id) return setError('Enter a 16-character chat ID or paste a UR Chat link.');
    if (id !== e.me && !e.convs.has(`dm:${[e.me, id].sort().join(':')}`)) {
      setChecking(true);
      const { enabled, found } = await e.lookupUsers([id]);
      setChecking(false);
      if (enabled && !found.has(id)) {
        return setError('No UR Chat account uses this ID. Check it, or the account may have been removed after 7 days without activity.');
      }
    }
    const conv = e.startDirectChat(id);
    if (conv) {
      onOpen(conv);
      onClose();
    }
  };

  return (
    <Modal title="New chat" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3 p-4 sm:p-5" noValidate>
        <Field label="Their chat ID or link" hint="Ask them for their ID, link or QR code (Settings → Your chat ID).">
          <input
            className={`${inputClass} font-mono uppercase tracking-wider placeholder:font-sans placeholder:normal-case placeholder:tracking-normal`}
            value={value}
            onChange={(ev) => {
              setValue(ev.target.value);
              setError('');
            }}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        {error && <p className="text-[13px] text-danger">{error}</p>}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" className="flex-1" disabled={checking}>
            {checking ? 'Checking…' : 'Start chat'}
          </Button>
          <Button variant="secondary" onClick={onScan}>
            <QrCode />
            Scan QR code
          </Button>
        </div>
      </form>
      <div className="border-t border-line p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ink-soft">Your chat ID</p>
            <p className="mt-0.5 font-mono text-[15px] font-semibold tracking-wider">{formatUserId(e.me)}</p>
          </div>
          <CopyButton text={e.me} size="sm" />
        </div>
        {showMine ? (
          <div className="mt-4">
            <ShareCard link={userLink(e.me)} qrName="my-ur-chat-qr" shareTitle={`Chat with ${e.profile?.name} on UR Chat`} />
          </div>
        ) : (
          <Button variant="ghost" size="sm" className="mt-3 -ml-2" onClick={() => setShowMine(true)}>
            Show my invite link and QR code
          </Button>
        )}
      </div>
    </Modal>
  );
}

// --------------------------------------------------------------- new group

export function NewGroupDialog({ onClose, onOpen }: { onClose: () => void; onOpen: (convId: string) => void }) {
  const e = useEngine();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<AvatarRef>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const id = await e.createGroup({ name, description, image, members: [...selected] });
      onOpen(id);
      onClose();
    } catch (err) {
      e.toast((err as Error).message || "Couldn't create the group.", 'error');
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New group"
      onClose={onClose}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={create} disabled={!name.trim() || busy}>
            {busy ? 'Creating…' : 'Create group'}
          </Button>
        </div>
      }
    >
      <div className="space-y-5 p-4 sm:p-5">
        <Field label="Group name">
          <input className={inputClass} value={name} onChange={(ev) => setName(ev.target.value)} maxLength={80} placeholder="e.g. Weekend trip" />
        </Field>
        <Field label="Description (optional)">
          <textarea className={`${inputClass} min-h-[72px]`} value={description} onChange={(ev) => setDescription(ev.target.value)} maxLength={500} />
        </Field>
        <div>
          <span className="text-[13px] font-medium text-ink-soft">Group picture (optional)</span>
          <div className="mt-2">
            <AvatarPicker value={image} onChange={setImage} name={name} group />
          </div>
        </div>
        <div>
          <span className="text-[13px] font-medium text-ink-soft">Add contacts (optional)</span>
          <p className="mb-2 text-[12px] text-muted">
            Up to {MAX_GROUP_MEMBERS} participants. You'll be the group admin and can invite others with a link, code or QR code.
          </p>
          <ContactPicker
            selected={selected}
            exclude={new Set()}
            onToggle={(id) =>
              setSelected((s) => {
                const n = new Set(s);
                if (n.has(id)) n.delete(id);
                else if (n.size < MAX_GROUP_MEMBERS - 1) n.add(id);
                return n;
              })
            }
          />
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------- join

const STATUS_COPY: Record<string, string> = {
  expired: 'This invitation has expired. Ask a group admin for a new one.',
  revoked: 'This invitation was reset by a group admin. Ask for the new link.',
  'used-up': 'This invitation has reached its usage limit.',
  NOT_FOUND: "This invitation doesn't exist. Check the code or link.",
  RATE_LIMITED: 'Too many attempts. Please wait a few minutes.',
  UNAVAILABLE: "Couldn't reach the service. Check your connection.",
};

/** Looks up an invitation and shows what the user is about to join. */
export function JoinPreview({ inviteKey, onJoined, onCancel }: { inviteKey: string; onJoined: (convId: string) => void; onCancel: () => void }) {
  const e = useEngine();
  const [info, setInfo] = useState<(InviteLookup & { signedInvite?: never }) | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setInfo(null);
    setError('');
    e.lookupInvite(inviteKey)
      .then((r) => alive && setInfo(r as never))
      .catch((err: Error) => alive && setError(STATUS_COPY[err.message] ?? STATUS_COPY.UNAVAILABLE));
    return () => {
      alive = false;
    };
  }, [inviteKey, e]);

  const already = info && e.isMember(info.groupId);

  const join = async () => {
    if (!info) return;
    setBusy(true);
    try {
      onJoined(await e.joinGroup(inviteKey, info));
    } catch (err) {
      const m = (err as Error).message;
      setError(STATUS_COPY[m.toLowerCase().replace('_', '-')] ?? STATUS_COPY[m] ?? m);
      setBusy(false);
    }
  };

  if (error) return <div className="px-5 py-8 text-center text-sm text-muted">{error}</div>;
  if (!info)
    return (
      <div className="flex justify-center py-10">
        <LoaderCircle className="size-6 animate-spin text-muted" />
      </div>
    );

  const inactive = info.status !== 'active';
  return (
    <div className="flex flex-col items-center px-5 py-6 text-center">
      <Avatar avatar={info.preview.image} name={info.preview.name} seed={info.groupId} size={88} group />
      <h3 className="mt-4 text-lg font-semibold">{info.preview.name}</h3>
      <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted">
        <Users className="size-3.5" />
        {info.preview.memberCount} {info.preview.memberCount === 1 ? 'participant' : 'participants'}
      </p>
      {info.preview.description && <p className="mt-3 max-w-sm whitespace-pre-wrap text-sm text-ink-soft">{info.preview.description}</p>}
      {inactive && <p className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{STATUS_COPY[info.status]}</p>}
      {!inactive && !already && (
        <p className="mt-4 max-w-sm text-[12.5px] leading-relaxed text-muted">
          Members will see your name, picture and chat ID. You'll be added automatically as soon as a member is online.
        </p>
      )}
      <div className="mt-6 flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
        <Button variant="secondary" onClick={onCancel}>
          {already ? 'Close' : 'Cancel'}
        </Button>
        {already ? (
          <Button onClick={() => onJoined(`g:${info.groupId}`)}>Open group</Button>
        ) : (
          <Button onClick={join} disabled={inactive || busy}>
            {busy ? 'Sending request…' : 'Join group'}
          </Button>
        )}
      </div>
    </div>
  );
}

export function JoinDialog({ onClose, onOpen, initialKey }: { onClose: () => void; onOpen: (convId: string) => void; initialKey?: string }) {
  const [value, setValue] = useState('');
  const [key, setKey] = useState<string | null>(initialKey ?? null);
  const [error, setError] = useState('');

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const target = parseScan(value);
    if (!target || target.kind !== 'invite') return setError('Enter an 8-character invitation code or paste an invite link.');
    setKey(target.key);
  };

  return (
    <Modal title={key ? 'Join group' : 'Join a group'} onClose={onClose} onBack={key && !initialKey ? () => setKey(null) : undefined}>
      {key ? (
        <JoinPreview
          inviteKey={key}
          onCancel={onClose}
          onJoined={(id) => {
            onOpen(id);
            onClose();
          }}
        />
      ) : (
        <form onSubmit={submit} className="space-y-3 p-4 sm:p-5" noValidate>
          <Field label="Invitation code or link">
            <input
              className={`${inputClass} font-mono uppercase tracking-widest placeholder:font-sans placeholder:normal-case placeholder:tracking-normal`}
              value={value}
              onChange={(ev) => {
                setValue(ev.target.value);
                setError('');
              }}
              placeholder="XXXX-XXXX"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          {error && <p className="text-[13px] text-danger">{error}</p>}
          <Button type="submit" className="w-full">
            Continue
          </Button>
        </form>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------- scan

export function ScanDialog({ onClose, onResult }: { onClose: () => void; onResult: (t: ScanTarget) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [camError, setCamError] = useState('');
  const [hint, setHint] = useState('');

  const handle = useCallback(
    (raw: string | null) => {
      if (!raw) return false;
      const target = parseScan(raw);
      if (!target) {
        setHint("That QR code isn't a UR Chat contact or group invitation.");
        return false;
      }
      onResult(target);
      return true;
    },
    [onResult],
  );

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: number | undefined;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
        setCamError('Camera scanning needs a secure (HTTPS) connection. You can scan a photo of the QR code instead.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const tick = async () => {
          if (stopped) return;
          try {
            if (handle(await decodeQr(v))) return;
          } catch {
            /* next frame */
          }
          timer = window.setTimeout(tick, 300);
        };
        void tick();
      } catch (err) {
        setCamError(
          (err as DOMException).name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow it in your browser settings, or scan a photo of the QR code.'
            : 'No camera available. You can scan a photo of the QR code instead.',
        );
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [handle]);

  const fromImage = async (file?: File) => {
    if (!file) return;
    try {
      const bmp = await createImageBitmap(file);
      if (!handle(await decodeQr(bmp))) setHint((h) => h || 'No QR code found in that image.');
    } catch {
      setHint("That image couldn't be read.");
    }
  };

  return (
    <Modal title="Scan QR code" onClose={onClose}>
      <div className="space-y-4 p-4 sm:p-5">
        {camError ? (
          <div className="flex flex-col items-center rounded-lg border border-line bg-surface px-4 py-8 text-center">
            <CameraOff className="size-6 text-muted" />
            <p className="mt-3 max-w-xs text-sm text-muted">{camError}</p>
          </div>
        ) : (
          <div className="relative mx-auto aspect-square w-full max-w-[340px] overflow-hidden rounded-xl bg-black">
            <video ref={video} className="size-full object-cover" playsInline muted />
            <div className="pointer-events-none absolute inset-[14%] rounded-xl border-2 border-panel/80" />
            <Camera className="absolute left-3 top-3 size-4 text-white/70" />
          </div>
        )}
        <p className="text-center text-sm text-muted">{hint || 'Point the camera at a UR Chat contact or group QR code.'}</p>
        <Button variant="secondary" className="w-full" onClick={() => fileRef.current?.click()}>
          <ImageUp />
          Scan from a photo
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          onChange={(ev) => {
            void fromImage(ev.target.files?.[0]);
            ev.target.value = '';
          }}
        />
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------------- invite

const EXPIRY: [string, number | null][] = [
  ['Never', null],
  ['1 hour', 3600_000],
  ['1 day', 86_400_000],
  ['7 days', 7 * 86_400_000],
];
const USES: [string, number | null][] = [
  ['Unlimited', null],
  ['1 person', 1],
  ['5 people', 5],
  ['10 people', 10],
];

export function InviteDialog({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const e = useEngine();
  const g = e.groups.get(groupId);
  const [expiry, setExpiry] = useState<number | null>(null);
  const [uses, setUses] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const active = e.invitesOf(groupId).filter((i) => !i.expiresAt || i.expiresAt > Date.now());
  const current: LocalInvite | undefined = active[active.length - 1];

  const create = async () => {
    setBusy(true);
    try {
      if (current) await e.revokeInvite(groupId, current.token);
      await e.createInvite(groupId, { expiresAt: expiry ? Date.now() + expiry : null, maxUses: uses });
    } catch (err) {
      e.toast((err as Error).message, 'error');
    }
    setBusy(false);
  };

  const revoke = async () => {
    if (!current || !window.confirm('Revoke this invitation? The link, code and QR code will stop working.')) return;
    setBusy(true);
    await e.revokeInvite(groupId, current.token).catch((err: Error) => e.toast(err.message, 'error'));
    setBusy(false);
  };

  return (
    <Modal title={`Invite to ${g?.name ?? 'group'}`} onClose={onClose}>
      <div className="space-y-5 p-4 sm:p-5">
        {current ? (
          <>
            <ShareCard
              link={inviteLink(current.token)}
              code={formatInviteCode(current.code)}
              codeLabel="Invitation code"
              qrName={`${(g?.name ?? 'group').replace(/[^\w-]+/g, '-').toLowerCase()}-invite`}
              shareTitle={`Join ${g?.name} on UR Chat`}
            />
            <p className="text-[12.5px] text-muted">
              {current.expiresAt ? `Expires ${new Date(current.expiresAt).toLocaleString()}` : 'Does not expire'} ·{' '}
              {current.maxUses ? `up to ${current.maxUses} ${current.maxUses === 1 ? 'person' : 'people'}` : 'unlimited uses'}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">Create a link, code and QR code that people can use to join this group.</p>
        )}

        <div className="rounded-lg border border-line p-3">
          <p className="text-[13px] font-medium text-ink-soft">{current ? 'Create a new invitation (replaces the current one)' : 'Invitation settings'}</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Expires">
              <select className={inputClass} value={String(expiry)} onChange={(ev) => setExpiry(ev.target.value === 'null' ? null : Number(ev.target.value))}>
                {EXPIRY.map(([l, v]) => (
                  <option key={l} value={String(v)}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Usage limit">
              <select className={inputClass} value={String(uses)} onChange={(ev) => setUses(ev.target.value === 'null' ? null : Number(ev.target.value))}>
                {USES.map(([l, v]) => (
                  <option key={l} value={String(v)}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={create} disabled={busy}>
              {current ? <RotateCcw /> : null}
              {current ? 'Reset link' : 'Create invite link'}
            </Button>
            {current && (
              <Button variant="danger" onClick={revoke} disabled={busy}>
                Revoke
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
