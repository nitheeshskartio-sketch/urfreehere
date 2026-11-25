import { Lock, Server, Wifi } from 'lucide-react';
import type { RouteKind } from '../lib/peer';

const copy: Record<RouteKind, { label: string; title: string; Icon: typeof Lock }> = {
  'direct-lan': { label: 'Direct · same network', title: 'Devices are connected directly on the local network.', Icon: Wifi },
  direct: { label: 'Direct connection', title: 'Devices are connected directly, peer to peer.', Icon: Lock },
  relay: {
    label: 'Encrypted relay',
    title: 'A direct path was blocked, so encrypted data is forwarded by a relay server. The relay cannot read it.',
    Icon: Server,
  },
};

export function RouteBadge({ route }: { route?: RouteKind | null }) {
  if (!route) return null;
  const { label, title, Icon } = copy[route];
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-xs font-medium text-ink-soft"
    >
      <Icon className="size-3.5 text-muted" />
      {label}
    </span>
  );
}
