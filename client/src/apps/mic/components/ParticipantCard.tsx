import { Crown, Mic, MicOff, Server, WifiOff } from 'lucide-react';
import { Avatar } from '../../../ui/avatar/Avatar';
import { statusOf, type Participant } from '../lib/room';

export type CardSize = 'xl' | 'lg' | 'md' | 'sm';

const AVATAR: Record<CardSize, number> = { xl: 112, lg: 88, md: 64, sm: 48 };

export function QualityBars({ quality, relayed }: { quality: Participant['quality']; relayed?: boolean }) {
  if (!quality) return null;
  const n = quality === 'good' ? 3 : quality === 'fair' ? 2 : 1;
  const color = quality === 'good' ? 'bg-success' : quality === 'fair' ? 'bg-warning' : 'bg-danger';
  return (
    <span className="inline-flex items-center gap-1" title={`Connection: ${quality}${relayed ? ' (via relay)' : ''}`} aria-label={`Connection ${quality}`}>
      {relayed && <Server className="size-3 text-muted" />}
      <span className="inline-flex items-end gap-[2px]">
        {[1, 2, 3].map((i) => (
          <span key={i} className={`w-[3px] rounded-sm ${i <= n ? color : 'bg-line-strong'}`} style={{ height: 4 + i * 3 }} />
        ))}
      </span>
    </span>
  );
}

const LABEL: Record<ReturnType<typeof statusOf>, string> = {
  CONNECTING: 'Connecting…',
  CONNECTED: 'Connected',
  SPEAKING: 'Speaking',
  MUTED: 'Muted',
  RECONNECTING: 'Reconnecting…',
  DISCONNECTED: 'Disconnected',
};

export function ParticipantCard({ p, size }: { p: Participant; size: CardSize }) {
  const status = statusOf(p);
  const speaking = status === 'SPEAKING';
  const offline = status === 'RECONNECTING' || status === 'DISCONNECTED' || status === 'CONNECTING';
  const minH = { xl: 'min-h-[220px] sm:min-h-[300px]', lg: 'min-h-[190px] sm:min-h-[230px]', md: 'min-h-[160px]', sm: 'min-h-[128px]' }[size];

  return (
    <div
      className={`relative flex flex-col items-center justify-center rounded-2xl border bg-panel px-3 py-4 text-center shadow-card transition-[border-color,box-shadow] duration-200 ${minH} ${
        speaking ? 'border-success ring-2 ring-success/30' : 'border-line'
      }`}
      aria-label={`${p.name}${p.self ? ' (you)' : ''}: ${LABEL[status]}`}
    >
      <div className="absolute right-3 top-3">{!p.self && <QualityBars quality={p.quality} relayed={p.relayed} />}</div>
      <span className={`rounded-full ${speaking ? 'speaking-ring' : ''} ${offline ? 'opacity-50' : ''}`}>
        <span className={`block rounded-full p-[3px] transition-colors ${speaking ? 'bg-success' : 'bg-transparent'}`}>
          <Avatar avatar={p.avatar} name={p.name} seed={p.pid} size={AVATAR[size]} />
        </span>
      </span>
      <p className={`mt-3 flex max-w-full items-center justify-center gap-1.5 font-semibold ${size === 'sm' ? 'text-sm' : 'text-[15px]'}`}>
        <span className="truncate">
          {p.name}
          {p.self && <span className="font-normal text-muted"> (you)</span>}
        </span>
        {p.isHost && (
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-mic/10 px-1.5 py-0.5 text-[11px] font-semibold text-mic" title="Host">
            <Crown className="size-3" />
            {size === 'sm' ? '' : 'Host'}
          </span>
        )}
      </p>
      <p
        className={`mt-1 inline-flex items-center gap-1.5 text-[12.5px] font-medium ${
          speaking ? 'text-success' : status === 'MUTED' ? 'text-muted' : offline ? 'text-warning' : 'text-muted'
        }`}
      >
        {status === 'MUTED' ? <MicOff className="size-3.5 text-danger" /> : offline ? <WifiOff className="size-3.5" /> : <Mic className="size-3.5" />}
        {status === 'MUTED' && p.hostMuted ? 'Muted by host' : LABEL[status]}
      </p>
    </div>
  );
}
