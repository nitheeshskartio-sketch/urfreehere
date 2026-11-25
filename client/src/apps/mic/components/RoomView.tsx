import {
  Copy,
  Crown,
  EllipsisVertical,
  Link2,
  Lock,
  LockOpen,
  LogOut,
  Mic,
  MicOff,
  RotateCcw,
  Settings2,
  UserMinus,
  UserPlus,
  Users,
  VolumeX,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../../../ui/Button';
import { Menu } from '../../../ui/Menu';
import { Field, Modal, inputClass } from '../../../ui/Modal';
import { ShareCard } from '../../../ui/ShareCard';
import { Avatar } from '../../../ui/avatar/Avatar';
import { MicIcon } from '../../registry';
import { useRoom } from '../hooks';
import { canChooseOutput } from '../lib/audio';
import { statusOf, type Participant, type RoomClient } from '../lib/room';
import { roomLink, type MicConfig } from '../lib/signaling';
import { ParticipantCard, QualityBars, type CardSize } from './ParticipantCard';

function layout(n: number): { grid: string; size: CardSize } {
  if (n <= 2) return { grid: 'grid-cols-1 sm:grid-cols-2', size: 'xl' };
  if (n <= 4) return { grid: 'grid-cols-2', size: 'lg' };
  if (n <= 8) return { grid: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4', size: 'md' };
  return { grid: 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5', size: 'sm' };
}

export function RoomView({ client, config }: { client: RoomClient; config: MicConfig | null }) {
  const c = useRoom(client);
  const room = c.room!;
  const [panel, setPanel] = useState(false);
  const [settings, setSettings] = useState<null | 'audio' | 'room'>(null);
  const [invite, setInvite] = useState(false);

  const people = [...c.participants.values()].sort((a, b) => Number(b.self) - Number(a.self) || a.joinedAt - b.joinedAt);
  const { grid, size } = layout(people.length);
  const link = roomLink(room.code);

  // If autoplay was blocked, any click enables sound.
  useEffect(() => {
    const on = () => client.resumeAudio();
    window.addEventListener('pointerdown', on);
    return () => window.removeEventListener('pointerdown', on);
  }, [client]);

  const copy = () => void navigator.clipboard?.writeText(link).then(() => c.toast('Invitation link copied'), () => c.toast("Couldn't copy", 'error'));

  return (
    <div className="flex h-[100dvh] flex-col bg-surface">
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-line bg-white px-3 sm:px-5">
        <MicIcon className="size-8 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[15px] font-semibold">{room.name}</h1>
            {room.locked && <Lock className="size-3.5 shrink-0 text-muted" aria-label="Locked" />}
          </div>
          <div className="flex items-center gap-2 text-[12.5px] text-muted">
            <button type="button" onClick={copy} className="font-mono font-medium tracking-wider hover:text-ink" title="Copy invitation link">
              {room.code}
            </button>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 tabular">
              <Users className="size-3.5" />
              {room.participantCount}/{room.maxParticipants}
            </span>
            <span aria-hidden="true" className="hidden sm:inline">
              ·
            </span>
            <span className={`hidden items-center gap-1 sm:inline-flex ${c.socketOnline ? '' : 'text-warning'}`}>
              <span className={`size-1.5 rounded-full ${c.socketOnline ? 'bg-success' : 'bg-warning'}`} />
              {c.socketOnline ? 'Connected' : 'Reconnecting…'}
            </span>
          </div>
        </div>
        <button type="button" onClick={copy} className="hidden rounded-md p-2 text-muted hover:bg-surface hover:text-ink sm:block" aria-label="Copy invitation" title="Copy invitation">
          <Copy className="size-5" />
        </button>
        <button type="button" onClick={() => setInvite(true)} className="rounded-md p-2 text-muted hover:bg-surface hover:text-ink" aria-label="Invite participants" title="Invite">
          <UserPlus className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => setPanel((p) => !p)}
          className={`rounded-md p-2 hover:bg-surface hover:text-ink ${panel ? 'text-accent' : 'text-muted'}`}
          aria-label="Participants"
          aria-pressed={panel}
          title="Participants"
        >
          <Users className="size-5" />
        </button>
        <button type="button" onClick={() => setSettings('room')} className="rounded-md p-2 text-muted hover:bg-surface hover:text-ink" aria-label="Room settings" title="Room settings">
          <Settings2 className="size-5" />
        </button>
      </header>

      {!c.socketOnline && (
        <div className="border-b border-warning/20 bg-warning-soft px-4 py-2 text-center text-[13px] text-ink-soft">Connection lost. Reconnecting to the room…</div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Participants */}
        <main className="min-w-0 flex-1 overflow-y-auto p-3 sm:p-6">
          <div className={`mx-auto grid max-w-[1100px] gap-3 sm:gap-4 ${grid}`}>
            {people.map((p) => (
              <ParticipantCard key={p.pid} p={p} size={size} />
            ))}
          </div>
          {people.length === 1 && (
            <div className="mx-auto mt-6 max-w-sm rounded-xl border border-line bg-white px-5 py-4 text-center text-sm text-muted shadow-card">
              You're the only one here.{' '}
              <button type="button" onClick={() => setInvite(true)} className="font-medium text-accent hover:underline">
                Invite people
              </button>
            </div>
          )}
        </main>

        {panel && (
          <aside className="fixed inset-0 z-30 flex justify-end bg-ink/30 md:static md:z-auto md:bg-transparent" onMouseDown={(e) => e.target === e.currentTarget && setPanel(false)}>
            <ParticipantsPanel client={client} onClose={() => setPanel(false)} />
          </aside>
        )}
      </div>

      {/* Microphone controls */}
      <footer className="shrink-0 border-t border-line bg-white px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
        {c.mic.error && (
          <div className="mx-auto mb-3 flex max-w-xl items-start gap-3 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-[13px] text-ink-soft">
            <MicOff className="mt-0.5 size-4 shrink-0 text-danger" />
            <span className="flex-1">{c.mic.error}</span>
            {c.mic.permission !== 'unavailable' && (
              <button type="button" onClick={() => void c.toggleMute()} className="shrink-0 font-medium text-accent hover:underline">
                Try again
              </button>
            )}
          </div>
        )}
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSettings('audio')}
            className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-muted hover:bg-surface"
            aria-label="Audio settings"
          >
            <Settings2 className="size-4 shrink-0" />
            <span className="hidden truncate sm:block">
              {c.mic.permission === 'granted' ? 'Microphone ready' : c.mic.permission === 'denied' ? 'Microphone blocked' : 'Microphone off'}
            </span>
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void c.toggleMute()}
              className={`flex size-14 items-center justify-center rounded-full transition-colors ${
                c.mic.muted ? 'bg-danger-soft text-danger hover:bg-danger/15' : 'bg-ink text-white hover:bg-ink-soft'
              }`}
              aria-label={c.mic.muted ? 'Unmute microphone' : 'Mute microphone'}
              aria-pressed={!c.mic.muted}
            >
              {c.mic.muted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
            </button>
            <Button variant="danger" size="lg" onClick={() => c.leave()} className="rounded-full">
              <LogOut />
              Leave
            </Button>
          </div>
          <span className="w-[60px] text-right text-[12.5px] text-muted sm:w-[140px]">{c.mic.muted ? 'Muted' : 'Live'}</span>
        </div>
      </footer>

      {invite && (
        <Modal title="Invite people" onClose={() => setInvite(false)}>
          <div className="p-4 sm:p-5">
            <ShareCard link={link} code={room.code} codeLabel="Room code" qrName={`mic-${room.code}`} shareTitle={`Join "${room.name}" on Mic`} />
          </div>
        </Modal>
      )}
      {settings && <SettingsDialog client={client} config={config} initial={settings} onClose={() => setSettings(null)} />}
      <Toasts client={client} />
    </div>
  );
}

function ParticipantsPanel({ client, onClose }: { client: RoomClient; onClose: () => void }) {
  const c = useRoom(client);
  const people = [...c.participants.values()].sort((a, b) => Number(b.isHost) - Number(a.isHost) || a.joinedAt - b.joinedAt);
  return (
    <div className="flex h-full w-full max-w-[360px] flex-col border-l border-line bg-white shadow-pop md:shadow-none">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
        <h2 className="text-[15px] font-semibold">
          Participants <span className="font-normal text-muted tabular">{people.length}</span>
        </h2>
        <button type="button" onClick={onClose} className="rounded-md p-2 text-muted hover:bg-surface hover:text-ink" aria-label="Close participants">
          <X className="size-5" />
        </button>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto py-1">
        {people.map((p) => (
          <ParticipantRow key={p.pid} p={p} client={client} />
        ))}
      </ul>
    </div>
  );
}

const STATUS_STYLE: Record<ReturnType<typeof statusOf>, string> = {
  SPEAKING: 'text-success',
  CONNECTED: 'text-muted',
  MUTED: 'text-muted',
  CONNECTING: 'text-warning',
  RECONNECTING: 'text-warning',
  DISCONNECTED: 'text-danger',
};

function ParticipantRow({ p, client }: { p: Participant; client: RoomClient }) {
  const c = useRoom(client);
  const status = statusOf(p);
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span className={`rounded-full ${status === 'SPEAKING' ? 'ring-2 ring-success ring-offset-2' : ''}`}>
        <Avatar avatar={p.avatar} name={p.name} seed={p.pid} size={36} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">
            {p.name}
            {p.self ? ' (you)' : ''}
          </span>
          {p.isHost && <Crown className="size-3.5 shrink-0 text-mic" aria-label="Host" />}
        </span>
        <span className={`block text-[12px] font-medium ${STATUS_STYLE[status]}`}>
          {status === 'MUTED' && p.hostMuted ? 'MUTED BY HOST' : status}
        </span>
      </span>
      {p.muted ? <MicOff className="size-4 text-danger" aria-label="Muted" /> : <Mic className="size-4 text-muted" aria-label="Microphone on" />}
      {!p.self && <QualityBars quality={p.quality} relayed={p.relayed} />}
      {c.isHost && !p.self && (
        <Menu
          label={`Host options for ${p.name}`}
          trigger={<EllipsisVertical className="size-4" />}
          items={[
            { label: 'Ask to mute', icon: VolumeX, hidden: p.muted, onSelect: () => void c.requestMute(p.pid).catch(() => {}) },
            {
              label: 'Remove from room',
              icon: UserMinus,
              danger: true,
              onSelect: () => window.confirm(`Remove ${p.name} from the room? They won't be able to rejoin for a while.`) && void c.removeParticipant(p.pid).catch(() => {}),
            },
          ]}
        />
      )}
    </li>
  );
}

function SettingsDialog({ client, config, initial, onClose }: { client: RoomClient; config: MicConfig | null; initial: 'audio' | 'room'; onClose: () => void }) {
  const c = useRoom(client);
  const room = c.room!;
  const [tab, setTab] = useState(initial);
  const [name, setName] = useState(room.name);
  const [description, setDescription] = useState(room.description);
  const [max, setMax] = useState(room.maxParticipants);

  useEffect(() => {
    void c.refreshDevices();
  }, [c]);

  const save = async () => {
    const patch: { name?: string; description?: string; maxParticipants?: number } = {};
    if (name.trim() && name.trim() !== room.name) patch.name = name.trim();
    if (description.trim() !== room.description) patch.description = description.trim();
    if (max !== room.maxParticipants) patch.maxParticipants = max;
    if (!Object.keys(patch).length) return;
    await c.updateRoom(patch).then(() => c.toast('Room updated'), () => {});
  };

  const choices = config?.participantChoices ?? [2, 4, 6, 8, 10, 15, 20];
  const avgRtt = [...c.participants.values()].filter((p) => !p.self && p.quality).map((p) => p.quality);

  return (
    <Modal title="Settings" onClose={onClose} wide>
      <div className="flex gap-1 border-b border-line px-3 pt-2">
        {(
          [
            ['audio', 'Audio'],
            ['room', c.isHost ? 'Room (host)' : 'Room'],
          ] as const
        ).map(([t, l]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'audio' ? (
        <div className="space-y-5 p-4 sm:p-5">
          <div className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm">
            <span className="font-medium">Microphone permission: </span>
            <span className={c.mic.permission === 'granted' ? 'text-success' : c.mic.permission === 'denied' ? 'text-danger' : 'text-muted'}>
              {c.mic.permission === 'granted' ? 'allowed' : c.mic.permission === 'denied' ? 'blocked' : c.mic.permission === 'unavailable' ? 'unavailable' : 'not requested yet'}
            </span>
            {c.mic.error && <p className="mt-1 text-[13px] text-muted">{c.mic.error}</p>}
          </div>
          <Field label="Microphone" hint={c.devices.inputs.length && !c.devices.inputs[0].label ? 'Turn your microphone on once to see device names.' : undefined}>
            <select className={inputClass} value={c.mic.deviceId} onChange={(e) => void c.setInputDevice(e.target.value)}>
              <option value="">System default</option>
              {c.devices.inputs.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Microphone ${i + 1}`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Speaker" hint={canChooseOutput() ? undefined : "This browser plays sound through the system's default output."}>
            <select className={inputClass} value={c.output.deviceId} onChange={(e) => void c.setOutputDevice(e.target.value)} disabled={!canChooseOutput()}>
              <option value="">System default</option>
              {c.devices.outputs.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Speaker ${i + 1}`}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Volume · ${Math.round(c.output.volume * 100)}%`}>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(c.output.volume * 100)}
              onChange={(e) => c.setVolume(Number(e.target.value) / 100)}
              className="w-full accent-[rgb(var(--c-accent))]"
              aria-label="Speaker volume"
            />
          </Field>
          <div className="text-sm">
            <p className="font-medium">Connection quality</p>
            {avgRtt.length ? (
              <ul className="mt-2 space-y-1.5">
                {[...c.participants.values()]
                  .filter((p) => !p.self)
                  .map((p) => (
                    <li key={p.pid} className="flex items-center justify-between gap-3 text-[13px] text-muted">
                      <span className="truncate">{p.name}</span>
                      <span className="inline-flex items-center gap-2">
                        {p.quality ?? 'measuring…'}
                        <QualityBars quality={p.quality} relayed={p.relayed} />
                      </span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="mt-1 text-[13px] text-muted">Shown once you're connected to someone.</p>
            )}
          </div>
        </div>
      ) : c.isHost ? (
        <div className="space-y-5 p-4 sm:p-5">
          <Field label="Room name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </Field>
          <Field label="Description">
            <textarea className={`${inputClass} min-h-[64px]`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
          </Field>
          <Field label="Maximum participants" hint={max < room.participantCount ? "Lower than the current count: nobody is removed, but no one new can join." : `Up to ${config?.globalMaxRoomParticipants ?? 20}`}>
            <select className={inputClass} value={max} onChange={(e) => setMax(Number(e.target.value))}>
              {choices.map((n) => (
                <option key={n} value={n}>
                  {n} people
                </option>
              ))}
            </select>
          </Field>
          <div className="flex justify-end">
            <Button onClick={() => void save()}>Save changes</Button>
          </div>
          <div className="space-y-3 border-t border-line pt-4">
            {(config?.allowHostRoomLock ?? true) && (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{room.locked ? 'Room is locked' : 'Lock room'}</p>
                  <p className="text-[12.5px] text-muted">Nobody new can join while the room is locked.</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => void c.setLocked(!room.locked).catch(() => {})}>
                  {room.locked ? <LockOpen /> : <Lock />}
                  {room.locked ? 'Unlock' : 'Lock'}
                </Button>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Reset invitation</p>
                <p className="text-[12.5px] text-muted">Creates a new code and link. The old ones stop working.</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.confirm('Create a new room code? The current link and QR code will stop working.') && void c.regenerateCode().catch(() => {})}
              >
                <RotateCcw />
                Reset
              </Button>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-danger">Close room</p>
                <p className="text-[12.5px] text-muted">Disconnects everyone and ends the room.</p>
              </div>
              <Button variant="danger" size="sm" onClick={() => window.confirm('Close the room for everyone?') && void c.closeRoom().catch(() => {})}>
                Close room
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3 p-4 text-sm sm:p-5">
          <p className="text-lg font-semibold">{room.name}</p>
          {room.description && <p className="whitespace-pre-wrap text-ink-soft">{room.description}</p>}
          <p className="text-muted">
            {room.participantCount} of {room.maxParticipants} people
            {room.locked ? ' · locked' : ''}
            {room.expiresAt ? ` · ends ${new Date(room.expiresAt).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}` : ''}
          </p>
          <p className="flex items-center gap-2 text-muted">
            <Link2 className="size-4" />
            <span className="font-mono">{room.code}</span>
          </p>
          <p className="text-[12.5px] text-muted">Only the host can change room settings.</p>
        </div>
      )}
    </Modal>
  );
}

function Toasts({ client }: { client: RoomClient }) {
  const c = useRoom(client);
  if (!c.toasts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[70] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {c.toasts.map((t) => (
        <div key={t.id} className={`rounded-lg px-3.5 py-2 text-sm shadow-pop ${t.tone === 'error' ? 'bg-danger text-white' : 'bg-ink text-white'}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
