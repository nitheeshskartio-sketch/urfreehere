import { ArrowRight, Lock, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { navigate } from '../../../lib/router';
import { Button } from '../../../ui/Button';
import { Field, Modal, inputClass } from '../../../ui/Modal';
import { ShareCard } from '../../../ui/ShareCard';
import { RoomClient } from '../lib/room';
import { ERROR_COPY, MicError, roomLink, type MicConfig, type RoomInfo } from '../lib/signaling';

const expiryLabel = (m: number | null) => (m === null ? 'No expiry' : m < 60 ? `${m} minutes` : m === 60 ? '1 hour' : m < 1440 ? `${m / 60} hours` : '24 hours');

export function CreateRoomDialog({ config, onClose }: { config: MicConfig; onClose: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [max, setMax] = useState(config.defaultRoomParticipants);
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [password, setPassword] = useState('');
  const [expiry, setExpiry] = useState<number | null>(config.defaultRoomExpiryMinutes || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<RoomInfo | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await RoomClient.createRoom({
        name: name.trim() || 'Voice room',
        description: description.trim(),
        maxParticipants: max,
        visibility,
        password: password || undefined,
        expiryMinutes: expiry,
      });
      setCreated(res.room);
    } catch (err) {
      const code = err instanceof MicError ? err.code : 'UNREACHABLE';
      setError((ERROR_COPY[code] ?? ERROR_COPY.UNREACHABLE).message);
    }
    setBusy(false);
  };

  if (created) {
    const link = roomLink(created.code);
    return (
      <Modal
        title="Your room is ready"
        onClose={onClose}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button onClick={() => navigate(`/room/${created.code}`)}>
              Enter room
              <ArrowRight />
            </Button>
          </div>
        }
      >
        <div className="space-y-4 p-4 sm:p-5">
          <div>
            <p className="text-lg font-semibold">{created.name}</p>
            <p className="mt-0.5 text-sm text-muted">
              Up to {created.maxParticipants} people
              {created.hasPassword ? ' · password protected' : ''}
              {created.expiresAt ? ` · expires ${new Date(created.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
            </p>
          </div>
          <ShareCard link={link} code={created.code} codeLabel="Room code" qrName={`mic-${created.code}`} shareTitle={`Join "${created.name}" on Mic`} />
          <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
            You're the host: you can lock the room, ask people to mute, remove people and close the room.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Create a room"
      onClose={onClose}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="create-room" disabled={busy}>
            {busy ? 'Creating…' : 'Create room'}
          </Button>
        </div>
      }
    >
      <form id="create-room" onSubmit={submit} className="space-y-4 p-4 sm:p-5" noValidate>
        <Field label="Room name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Friday catch-up" autoFocus />
        </Field>
        <Field label="Description (optional)">
          <textarea className={`${inputClass} min-h-[64px]`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Maximum participants" hint={`Up to ${config.globalMaxRoomParticipants}`}>
            <select className={inputClass} value={max} onChange={(e) => setMax(Number(e.target.value))}>
              {config.participantChoices.map((n) => (
                <option key={n} value={n}>
                  {n} people
                </option>
              ))}
            </select>
          </Field>
          <Field label="Room expires">
            <select className={inputClass} value={String(expiry)} onChange={(e) => setExpiry(e.target.value === 'null' ? null : Number(e.target.value))}>
              {config.expiryChoices.map((m) => (
                <option key={String(m)} value={String(m)}>
                  {expiryLabel(m)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {config.allowPublicRooms && (
          <Field label="Visibility">
            <select className={inputClass} value={visibility} onChange={(e) => setVisibility(e.target.value as 'private' | 'public')}>
              <option value="private">Private: only people with the invitation</option>
              <option value="public">Public: listed on the Mic page</option>
            </select>
          </Field>
        )}
        {config.allowRoomPassword && (
          <Field label="Password (optional)" hint="People joining with the link or code will also need this.">
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input className={`${inputClass} pl-9`} type="password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={100} autoComplete="new-password" />
            </div>
          </Field>
        )}
        <p className="rounded-lg bg-surface px-3 py-2 text-[12.5px] leading-relaxed text-muted">
          Host controls: you'll be able to rename the room, change the limit, lock it, ask people to mute, remove people, reset the invitation and close the room.
        </p>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
