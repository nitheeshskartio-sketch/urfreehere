import { ArrowRight, AudioLines, Lock, Mic, QrCode, ShieldCheck, Users, Volume2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { navigate } from '../../../lib/router';
import { Button } from '../../../ui/Button';
import { Panel } from '../../../ui/Panel';
import { MicIcon } from '../../registry';
import { CreateRoomDialog } from '../components/CreateRoomDialog';
import { QrScanDialog } from '../components/QrScanDialog';
import { fetchConfig, normalizeRoomCode, type MicConfig, type RoomInfo } from '../lib/signaling';

export default function Landing() {
  const [config, setConfig] = useState<MicConfig | null>(null);
  const [creating, setCreating] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [publicRooms, setPublicRooms] = useState<RoomInfo[]>([]);

  useEffect(() => {
    fetchConfig()
      .then((c) => {
        setConfig(c);
        if (c.allowPublicRooms)
          fetch('/api/mic/rooms')
            .then((r) => r.json())
            .then((r: { rooms: RoomInfo[] }) => setPublicRooms(r.rooms))
            .catch(() => {});
      })
      .catch(() => setError("Can't reach Mic right now. Check your connection."));
  }, []);

  const join = (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeRoomCode(code);
    if (!normalized) return setError('Room codes look like MIC-8K92PX.');
    navigate(`/room/${normalized}`);
  };

  return (
    <>
      <section className="page pb-14 pt-10 sm:pb-20 sm:pt-16">
        <div className="flex items-center gap-3">
          <MicIcon className="size-11" />
          <div>
            <p className="text-xl font-semibold tracking-tight">Mic</p>
            <p className="text-sm text-muted">Your room. Your people. Just talk.</p>
          </div>
        </div>
        <h1 className="mt-8 max-w-[640px] text-[30px] font-semibold leading-[1.15] tracking-tight sm:text-[40px]">Voice rooms that start in seconds.</h1>
        <p className="mt-3 max-w-[560px] text-base leading-relaxed text-muted sm:text-lg">
          Create a room, invite people with a link, code or QR code, and talk. No accounts, and you can always see who's speaking.
        </p>

        <div className="mt-8 grid gap-4 md:mt-10 md:grid-cols-2 md:gap-5">
          <Panel className="flex flex-col p-5 sm:p-6">
            <div className="flex items-start gap-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-mic/10 text-mic">
                <Mic className="size-5" />
              </span>
              <div>
                <h2 className="text-[17px] font-semibold">Create a room</h2>
                <p className="mt-0.5 text-sm leading-relaxed text-muted">
                  Set a name and how many people can join{config ? `, up to ${config.globalMaxRoomParticipants}` : ''}. You'll be the host.
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-1 items-end">
              <Button size="lg" className="w-full" onClick={() => setCreating(true)} disabled={!config}>
                Create a room
                <ArrowRight />
              </Button>
            </div>
          </Panel>

          <Panel className="flex flex-col p-5 sm:p-6">
            <div className="flex items-start gap-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-mic/10 text-mic">
                <Users className="size-5" />
              </span>
              <div>
                <h2 className="text-[17px] font-semibold">Join a room</h2>
                <p className="mt-0.5 text-sm leading-relaxed text-muted">Enter the room code, open the invitation link, or scan the QR code.</p>
              </div>
            </div>
            <form onSubmit={join} className="mt-6 flex flex-1 flex-col justify-end gap-2" noValidate>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setError('');
                  }}
                  placeholder="MIC-XXXXXX"
                  aria-label="Room code"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  className="h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-white px-3.5 font-mono text-[15px] uppercase tracking-[0.12em] placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-muted/80 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
                <Button type="submit" size="lg" variant="secondary">
                  Join
                </Button>
              </div>
              <button type="button" onClick={() => setScanning(true)} className="inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-accent hover:underline">
                <QrCode className="size-4" />
                Scan a QR code
              </button>
              {error && <p className="text-[13px] text-danger">{error}</p>}
            </form>
          </Panel>
        </div>

        {publicRooms.length > 0 && (
          <div className="mt-10">
            <h2 className="text-[15px] font-semibold">Public rooms</h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {publicRooms.map((r) => (
                <li key={r.code}>
                  <a
                    href={`/room/${r.code}`}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`/room/${r.code}`);
                    }}
                    className="flex items-center gap-3 rounded-xl border border-line bg-white p-4 hover:bg-surface"
                  >
                    <AudioLines className="size-5 text-mic" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.name}</span>
                      <span className="block text-[13px] text-muted">
                        {r.participantCount} / {r.maxParticipants} people
                        {r.hasPassword ? ' · password' : ''}
                      </span>
                    </span>
                    <ArrowRight className="size-4 text-muted" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="border-t border-line bg-surface">
        <div className="page py-12 sm:py-16">
          <div id="how-it-works" className="scroll-mt-24">
            <p className="text-[13px] font-medium text-accent">How it works</p>
            <h2 className="mt-1 text-[22px] font-semibold tracking-tight sm:text-2xl">Create. Invite. Talk.</h2>
          </div>
          <ol className="mt-8 grid gap-4 sm:grid-cols-3 sm:gap-5">
            {[
              ['Create a room', 'Pick a name and a participant limit. Add a password or an expiry if you like.'],
              ['Invite people', 'Share the link, the room code or the QR code. People join from any browser.'],
              ['Talk', "Turn on your mic and speak. The speaker's card lights up, so everyone knows who's talking."],
            ].map(([t, d], i) => (
              <li key={t} className="rounded-xl border border-line bg-white p-5">
                <span className="flex size-7 items-center justify-center rounded-md border border-line text-[13px] font-semibold tabular text-ink-soft">{i + 1}</span>
                <h3 className="mt-4 text-[15px] font-semibold">{t}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="page py-12 sm:py-16">
          <div id="privacy" className="scroll-mt-24">
            <p className="text-[13px] font-medium text-accent">Privacy</p>
            <h2 className="mt-1 text-[22px] font-semibold tracking-tight sm:text-2xl">Your voice goes straight to your people</h2>
          </div>
          <ul className="mt-8 grid gap-x-10 gap-y-7 sm:grid-cols-2">
            {[
              [Volume2, 'Peer-to-peer audio', 'Voices travel directly between participants over encrypted WebRTC connections. If a direct path is blocked, an encrypted relay may forward audio it cannot listen to.'],
              [ShieldCheck, 'Nothing recorded', 'Mic never records or stores audio. The server only helps people find each other and keeps the room details while the room exists.'],
              [Mic, 'You control your microphone', 'Your microphone is only used after you press Join or Unmute. Muting stops sending your audio.'],
              [Lock, 'Private by default', "Rooms aren't listed anywhere. Hosts can add a password, lock the room and remove people."],
            ].map(([Icon, t, d]) => {
              const I = Icon as typeof Mic;
              return (
                <li key={t as string} className="flex gap-3.5">
                  <I className="mt-0.5 size-5 shrink-0 text-ink-soft" strokeWidth={1.75} />
                  <div>
                    <h3 className="text-[15px] font-semibold">{t as string}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{d as string}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {creating && config && <CreateRoomDialog config={config} onClose={() => setCreating(false)} />}
      {scanning && (
        <QrScanDialog
          onClose={() => setScanning(false)}
          onCode={(c) => {
            setScanning(false);
            navigate(`/room/${c}`);
          }}
        />
      )}
    </>
  );
}
