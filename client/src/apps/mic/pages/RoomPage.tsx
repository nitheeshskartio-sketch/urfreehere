import { CircleAlert, Clock, DoorClosed, Lock, LoaderCircle, Mic, MicOff, RotateCcw, UserX, Users } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { navigate } from '../../../lib/router';
import { Link } from '../../../site/Link';
import { Button } from '../../../ui/Button';
import { Field, inputClass } from '../../../ui/Modal';
import { MicIcon } from '../../registry';
import { ProfileFields } from '../components/ProfileFields';
import { RoomView } from '../components/RoomView';
import { useRoom } from '../hooks';
import { micSupported } from '../lib/audio';
import { RoomClient, deviceId, loadProfile, saveProfile, type EndReason, type Profile } from '../lib/room';
import { ERROR_COPY, MicError, fetchConfig, fetchRoom, normalizeRoomCode, type MicConfig, type RoomInfo } from '../lib/signaling';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-surface">
      <header className="flex h-14 items-center border-b border-line bg-white px-4 sm:px-6">
        <Link href="/mic" className="flex items-center gap-2.5 rounded-md">
          <MicIcon className="size-7" />
          <span className="text-[15px] font-semibold tracking-tight">Mic</span>
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center sm:py-12">{children}</main>
    </div>
  );
}

function Screen({ icon: Icon, tone, title, message, children }: { icon: typeof Mic; tone: 'error' | 'neutral' | 'warning'; title: string; message: string; children?: React.ReactNode }) {
  const ring = { error: 'bg-danger-soft text-danger', neutral: 'bg-surface text-muted', warning: 'bg-warning-soft text-warning' }[tone];
  return (
    <Shell>
      <div className="w-full max-w-sm rounded-xl border border-line bg-white p-6 text-center shadow-card">
        <span className={`mx-auto flex size-12 items-center justify-center rounded-full ${ring}`}>
          <Icon className="size-6" />
        </span>
        <h1 className="mt-4 text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{message}</p>
        <div className="mt-6 flex flex-col gap-2">{children}</div>
      </div>
    </Shell>
  );
}

const END_COPY: Record<EndReason, { title: string; message: string }> = {
  left: { title: 'You left the room', message: 'You can rejoin while the room is open.' },
  removed: { title: 'You were removed', message: "The host removed you from this room. You can't rejoin for a while." },
  host: { title: 'The room was closed', message: 'The host closed this room.' },
  expired: { title: 'This room has expired', message: 'Its time limit was reached. Ask the host to create a new room.' },
  empty: { title: 'The room was closed', message: 'Everyone left, so the room was closed.' },
  replaced: { title: 'Opened somewhere else', message: 'You joined this room from another tab or device.' },
};

export default function RoomPage({ code: rawCode }: { code: string }) {
  const code = normalizeRoomCode(rawCode);
  const client = useMemo(() => new RoomClient(), []);
  // Development builds only: inspect the room from the browser console.
  if (import.meta.env.DEV) (window as unknown as { __mic: RoomClient }).__mic = client;
  const c = useRoom(client);
  const [config, setConfig] = useState<MicConfig | null>(null);
  const [preview, setPreview] = useState<RoomInfo | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(code ? null : 'INVALID_CODE');
  const [profile, setProfile] = useState<Profile>(() => loadProfile() ?? { name: '', avatar: null });
  const [password, setPassword] = useState('');
  const [withMic, setWithMic] = useState(micSupported());
  const [formError, setFormError] = useState('');
  const isCreator = !!(code && localStorage.getItem(`mic.host.${code}`));

  useEffect(() => {
    fetchConfig().then(setConfig, () => {});
  }, []);

  // Room preview, refreshed while waiting to join so the count stays current.
  useEffect(() => {
    if (!code || c.phase === 'in-room') return;
    let alive = true;
    const load = () =>
      fetchRoom(code).then(
        (r) => alive && (setPreview(r), setPreviewError(null)),
        (err: MicError) => alive && setPreviewError(err.code),
      );
    void load();
    const t = window.setInterval(load, 8000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [code, c.phase]);

  // After a refresh during a call, rejoin the same seat (microphone stays off until you unmute).
  useEffect(() => {
    if (!code || c.phase !== 'idle' || !preview) return;
    const saved = sessionStorage.getItem(`mic.rejoin.${code}`);
    const p = loadProfile();
    if (saved && p) void client.join({ code, profile: p, withMic: false, deviceId: deviceId() });
  }, [code, preview, c.phase, client]);

  useEffect(() => {
    document.title = c.room ? `${c.room.name} · Mic` : preview ? `${preview.name} · Mic` : 'Mic';
  }, [c.room, preview]);

  // Leaving the page (in-app navigation) leaves the room. A refresh keeps the seat for rejoining.
  useEffect(
    () => () => {
      if (client.phase === 'in-room' || client.phase === 'joining') client.leave();
    },
    [client],
  );
  const rejoining = !!(code && sessionStorage.getItem(`mic.rejoin.${code}`) && loadProfile());

  const join = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile.name.trim()) return setFormError('Enter your name.');
    setFormError('');
    const p = { name: profile.name.trim(), avatar: profile.avatar };
    saveProfile(p);
    await client.join({ code: code!, profile: p, password: password || undefined, withMic, deviceId: deviceId() });
  };

  // ---- in the room
  if (c.phase === 'in-room' && c.room) return <RoomView client={client} config={config} />;

  // ---- ended
  if (c.phase === 'ended' && c.endReason) {
    const copy = END_COPY[c.endReason];
    const canRejoin = c.endReason === 'left' || c.endReason === 'replaced';
    return (
      <Screen icon={c.endReason === 'removed' ? UserX : c.endReason === 'expired' ? Clock : DoorClosed} tone={c.endReason === 'removed' ? 'error' : 'neutral'} {...copy}>
        {canRejoin && (
          <Button onClick={() => window.location.reload()}>
            <RotateCcw />
            Rejoin
          </Button>
        )}
        <Button variant="secondary" onClick={() => navigate('/mic')}>
          Back to Mic
        </Button>
      </Screen>
    );
  }

  // ---- room can't be joined
  const lockedNow = preview?.locked && !isCreator && !rejoining && c.phase !== 'joining' ? 'LOCKED' : null;
  const blocking =
    previewError ?? lockedNow ?? (c.error && ['FULL', 'LOCKED', 'NOT_FOUND', 'EXPIRED', 'CLOSED', 'REVOKED', 'BANNED'].includes(c.error.code) ? c.error.code : null);
  // My own held seat counts toward the total after a refresh, so don't call the room full then.
  const fullNow = !blocking && !rejoining && preview && preview.participantCount >= preview.maxParticipants && c.phase !== 'joining';
  if (blocking || fullNow) {
    const key = blocking ?? 'FULL';
    const copy = ERROR_COPY[key] ?? ERROR_COPY.UNREACHABLE;
    const retry = key === 'FULL' || key === 'LOCKED' || key === 'UNREACHABLE';
    return (
      <Screen
        icon={key === 'FULL' ? Users : key === 'LOCKED' ? Lock : key === 'EXPIRED' ? Clock : CircleAlert}
        tone={key === 'FULL' || key === 'LOCKED' ? 'warning' : 'error'}
        title={copy.title}
        message={key === 'FULL' && preview ? `${copy.message} (${preview.participantCount}/${preview.maxParticipants})` : copy.message}
      >
        {retry && (
          <Button
            onClick={() => {
              setPreviewError(null);
              client.error = null;
              void fetchRoom(code!).then(setPreview, (err: MicError) => setPreviewError(err.code));
            }}
          >
            <RotateCcw />
            Try again
          </Button>
        )}
        <Button variant="secondary" onClick={() => navigate('/mic')}>
          Back to Mic
        </Button>
      </Screen>
    );
  }

  if (!preview || (rejoining && c.phase !== 'idle') || (rejoining && !c.error)) {
    return (
      <Shell>
        <LoaderCircle className="size-6 animate-spin text-muted" />
      </Shell>
    );
  }

  // ---- pre-join
  const joining = c.phase === 'joining';
  const joinError = c.error && !['FULL', 'LOCKED'].includes(c.error.code) ? ERROR_COPY[c.error.code] ?? ERROR_COPY.UNREACHABLE : null;
  const needsPassword = preview.hasPassword && !isCreator;

  return (
    <Shell>
      <form onSubmit={join} className="w-full max-w-[460px] overflow-hidden rounded-xl border border-line bg-white shadow-card" noValidate>
        <div className="border-b border-line px-5 py-5 sm:px-6">
          <p className="text-[13px] font-medium text-mic">{isCreator ? 'Your room' : "You're invited to"}</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{preview.name}</h1>
          {preview.description && <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted">{preview.description}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-surface px-2 py-1 tabular">
              <Users className="size-3.5" />
              {preview.participantCount} / {preview.maxParticipants} people
            </span>
            <span className="rounded-md bg-surface px-2 py-1 font-mono">{preview.code}</span>
            {preview.hasPassword && (
              <span className="inline-flex items-center gap-1 rounded-md bg-surface px-2 py-1">
                <Lock className="size-3.5" />
                Password
              </span>
            )}
          </div>
        </div>

        <div className="space-y-4 px-5 py-5 sm:px-6">
          <ProfileFields value={profile} onChange={setProfile} />
          {needsPassword && (
            <Field label="Room password">
              <input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
            </Field>
          )}
          <label className={`flex items-start gap-3 rounded-lg border border-line px-3 py-2.5 ${micSupported() ? 'cursor-pointer hover:bg-surface' : 'opacity-70'}`}>
            <input type="checkbox" className="mt-1 size-4 accent-[rgb(var(--c-accent))]" checked={withMic} disabled={!micSupported()} onChange={(e) => setWithMic(e.target.checked)} />
            <span className="text-sm">
              <span className="flex items-center gap-1.5 font-medium">
                {withMic ? <Mic className="size-4" /> : <MicOff className="size-4" />}
                Join with my microphone on
              </span>
              <span className="block text-[12.5px] text-muted">
                {micSupported()
                  ? 'Your browser will ask for permission when you join. You can mute at any time.'
                  : 'Microphones need a secure (HTTPS) page. You can still join and listen.'}
              </span>
            </span>
          </label>
          {(formError || joinError) && (
            <p className="text-sm text-danger">{formError || (joinError && `${joinError.title}. ${joinError.message}`)}</p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-line bg-surface px-5 py-4 sm:flex-row sm:justify-between sm:px-6">
          <Button variant="ghost" onClick={() => navigate('/mic')}>
            Cancel
          </Button>
          <Button type="submit" size="lg" disabled={joining}>
            {joining ? <LoaderCircle className="animate-spin" /> : <Mic />}
            {joining ? 'Joining…' : 'Join room'}
          </Button>
        </div>
      </form>
    </Shell>
  );
}
