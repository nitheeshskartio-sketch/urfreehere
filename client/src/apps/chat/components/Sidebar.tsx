import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  BellOff,
  EllipsisVertical,
  Inbox,
  KeyRound,
  LogOut,
  MessageSquarePlus,
  Pin,
  PinOff,
  QrCode,
  Search,
  Settings,
  Trash2,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from '../../../site/Link';
import { SiteMark } from '../../../site/Logo';
import { Button } from '../../../ui/Button';
import { useEngine } from '../hooks';
import type { Conversation } from '../lib/types';
import { shortTime } from '../lib/time';
import { Avatar } from '../../../ui/avatar/Avatar';
import { Menu } from '../../../ui/Menu';
import { Ticks } from './Ticks';

export type Dialog = 'new-chat' | 'new-group' | 'join' | 'scan' | 'settings' | 'sign-out' | null;

type Filter = 'all' | 'dm' | 'group' | 'unread';

export function Sidebar({
  activeId,
  onOpen,
  onDialog,
}: {
  activeId: string | null;
  onOpen: (convId: string) => void;
  onDialog: (d: Dialog) => void;
}) {
  const e = useEngine();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<'chats' | 'archived' | 'requests'>('chats');
  const me = e.profile!;

  const all = useMemo(() => [...e.convs.values()], [e.version]);
  const requestIds = new Set(e.requests().map((c) => c.userId));
  const isRequest = (c: Conversation) => c.type === 'dm' && requestIds.has(c.peerId!);
  const isBlocked = (c: Conversation) => c.type === 'dm' && e.contacts.get(c.peerId!)?.state === 'blocked';
  const hiddenGroup = (c: Conversation) => c.type === 'group' && !e.group(c)?.valid && !c.joining;

  const q = query.trim().toLowerCase();
  const list = all
    .filter((c) => !hiddenGroup(c))
    .filter((c) => {
      if (view === 'requests') return isRequest(c);
      if (isRequest(c)) return false;
      if (view === 'archived') return c.archived;
      return !c.archived;
    })
    .filter((c) => (filter === 'dm' ? c.type === 'dm' : filter === 'group' ? c.type === 'group' : filter === 'unread' ? c.unread > 0 : true))
    .filter((c) => !q || e.convTitle(c).toLowerCase().includes(q) || (e.lastEvent(c.id) && e.describe(e.lastEvent(c.id)!).toLowerCase().includes(q)))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastTs - a.lastTs);

  const archivedCount = all.filter((c) => c.archived && !isRequest(c) && !hiddenGroup(c)).length;
  const requestCount = all.filter(isRequest).length;

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Profile bar */}
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-line px-3">
        <Link href="/" className="rounded-md p-1" aria-label="UR Free Here home">
          <SiteMark className="size-7" />
        </Link>
        <button
          type="button"
          onClick={() => onDialog('settings')}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 py-1 text-left hover:bg-surface"
          aria-label="Profile and settings"
        >
          <Avatar avatar={me.avatar} name={me.name} seed={e.me} size={36} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{me.name}</span>
            <span className="block truncate text-[12px] text-muted">{e.net === 'online' ? 'Online' : e.net === 'connecting' ? 'Connecting…' : 'Offline'}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => onDialog('new-chat')}
          className="rounded-md p-2 text-muted hover:bg-surface hover:text-ink"
          aria-label="New chat"
          title="New chat"
        >
          <MessageSquarePlus className="size-5" />
        </button>
        <Menu
          label="More options"
          trigger={<EllipsisVertical className="size-5" />}
          items={[
            { label: 'New group', icon: Users, onSelect: () => onDialog('new-group') },
            { label: 'Join a group', icon: KeyRound, onSelect: () => onDialog('join') },
            { label: 'Scan QR code', icon: QrCode, onSelect: () => onDialog('scan') },
            { label: 'Settings', icon: Settings, onSelect: () => onDialog('settings') },
            { label: 'Sign out', icon: LogOut, danger: true, onSelect: () => onDialog('sign-out') },
          ]}
        />
      </div>

      {e.net === 'replaced' ? (
        <div className="flex items-center gap-3 border-b border-warning/20 bg-warning-soft px-4 py-3 text-sm">
          <span className="flex-1 text-ink-soft">UR Chat is open in another tab.</span>
          <Button size="sm" variant="secondary" onClick={() => e.reclaim()}>
            Use here
          </Button>
        </div>
      ) : e.net === 'offline' ? (
        <div className="flex items-center gap-2.5 border-b border-line bg-surface px-4 py-2.5 text-[13px] text-muted">
          <WifiOff className="size-4" />
          Offline. Messages are saved and will be sent when you reconnect.
        </div>
      ) : null}

      {/* Search + filters */}
      <div className="shrink-0 space-y-2 px-3 pb-2 pt-3">
        {view !== 'chats' ? (
          <button type="button" onClick={() => setView('chats')} className="flex items-center gap-2 rounded-md px-1 py-1 text-sm font-semibold hover:text-accent">
            <ArrowLeft className="size-4" />
            {view === 'archived' ? 'Archived' : 'Message requests'}
          </button>
        ) : null}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="h-9 w-full rounded-lg border border-transparent bg-surface pl-9 pr-8 text-sm placeholder:text-muted focus:border-accent focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink" aria-label="Clear search">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        {view === 'chats' && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {(
              [
                ['all', 'All'],
                ['unread', 'Unread'],
                ['dm', 'Direct'],
                ['group', 'Groups'],
              ] as [Filter, string][]
            ).map(([f, label]) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`shrink-0 rounded-full border px-3 py-1 text-[13px] font-medium transition-colors ${
                  filter === f ? 'border-accent/30 bg-accent-soft text-accent' : 'border-line text-muted hover:border-line-strong hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === 'chats' && requestCount > 0 && (
          <SpecialRow icon={Inbox} label="Message requests" count={requestCount} onClick={() => setView('requests')} accent />
        )}
        {view === 'chats' && archivedCount > 0 && !q && <SpecialRow icon={Archive} label="Archived" count={archivedCount} onClick={() => setView('archived')} />}

        {list.length === 0 ? (
          <EmptyList view={view} searching={!!q} onDialog={onDialog} hasAny={all.length > 0} />
        ) : (
          <ul>
            {list.map((c) => (
              <ConversationRow key={c.id} conv={c} active={c.id === activeId} onOpen={() => onOpen(c.id)} blocked={isBlocked(c)} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SpecialRow({ icon: Icon, label, count, onClick, accent }: { icon: typeof Archive; label: string; count: number; onClick: () => void; accent?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface">
      <span className={`flex size-10 items-center justify-center rounded-full ${accent ? 'bg-accent-soft text-accent' : 'bg-surface text-muted'}`}>
        <Icon className="size-[18px]" />
      </span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${accent ? 'bg-accent text-white' : 'bg-surface text-muted'}`}>{count}</span>
    </button>
  );
}

function EmptyList({ view, searching, onDialog, hasAny }: { view: string; searching: boolean; onDialog: (d: Dialog) => void; hasAny: boolean }) {
  if (searching) return <p className="px-6 py-10 text-center text-sm text-muted">No chats match your search.</p>;
  if (view !== 'chats') return <p className="px-6 py-10 text-center text-sm text-muted">Nothing here.</p>;
  if (hasAny) return <p className="px-6 py-10 text-center text-sm text-muted">No chats in this filter.</p>;
  return (
    <div className="px-6 py-10 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
        <MessageSquarePlus className="size-6" />
      </span>
      <p className="mt-4 text-[15px] font-semibold">Start your first chat</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">Share your chat ID or invite link, or add someone by theirs.</p>
      <div className="mt-5 flex flex-col gap-2">
        <Button onClick={() => onDialog('new-chat')}>New chat</Button>
        <Button variant="secondary" onClick={() => onDialog('new-group')}>
          New group
        </Button>
        <Button variant="ghost" onClick={() => onDialog('join')}>
          Join a group with a code
        </Button>
      </div>
    </div>
  );
}

function ConversationRow({ conv, active, onOpen, blocked }: { conv: Conversation; active: boolean; onOpen: () => void; blocked: boolean }) {
  const e = useEngine();
  const title = e.convTitle(conv);
  const last = e.lastEvent(conv.id);
  const typing = e.typingIn(conv.id);
  const online = conv.type === 'dm' ? e.peerStatus(conv.peerId!) !== 'offline' : undefined;

  let preview: React.ReactNode = '';
  if (conv.joining) preview = conv.joining.status === 'rejected' ? 'Request declined' : 'Waiting to be added…';
  else if (blocked) preview = 'Blocked';
  else if (typing.length) preview = <span className="text-accent">typing…</span>;
  else if (last) {
    const mine = last.author === e.me && last.kind !== 'op';
    const who = conv.type === 'group' && last.kind !== 'op' && !mine ? `${e.nameOf(last.author).split(' ')[0]}: ` : '';
    preview = (
      <span className="flex min-w-0 items-center gap-1">
        {mine && <Ticks status={e.deliveryOf(last)} className="shrink-0" />}
        <span className="truncate">
          {who}
          {e.describe(last)}
        </span>
      </span>
    );
  } else preview = conv.type === 'dm' ? 'No messages yet' : '';

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onOpen}
        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors sm:px-4 ${active ? 'bg-accent-soft/70' : 'hover:bg-surface'}`}
        aria-current={active ? 'true' : undefined}
      >
        <Avatar avatar={e.convImage(conv)} name={title} seed={conv.peerId ?? conv.groupId} size={48} group={conv.type === 'group'} online={online} />
        <span className="min-w-0 flex-1 border-b border-line/0">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{title}</span>
            <span className={`shrink-0 text-[12px] ${conv.unread && !conv.muted ? 'font-semibold text-accent' : 'text-muted'}`}>{last ? shortTime(last.ts) : ''}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{preview}</span>
            {conv.muted && <BellOff className="size-3.5 shrink-0 text-muted" aria-label="Muted" />}
            {conv.pinned && <Pin className="size-3.5 shrink-0 text-muted" aria-label="Pinned" />}
            {conv.unread > 0 && (
              <span className={`min-w-5 shrink-0 rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold text-white ${conv.muted ? 'bg-slate-400' : 'bg-accent'}`}>
                {conv.unread > 99 ? '99+' : conv.unread}
              </span>
            )}
          </span>
        </span>
      </button>
      <div className="absolute right-2 top-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:hidden">
        <div className="rounded-md bg-white/90 shadow-card">
          <Menu
            label={`Options for ${title}`}
            trigger={<EllipsisVertical className="size-4" />}
            items={[
              { label: conv.pinned ? 'Unpin' : 'Pin', icon: conv.pinned ? PinOff : Pin, onSelect: () => e.updateConv(conv.id, { pinned: !conv.pinned }) },
              { label: conv.muted ? 'Unmute' : 'Mute', icon: BellOff, onSelect: () => e.updateConv(conv.id, { muted: !conv.muted }) },
              {
                label: conv.archived ? 'Unarchive' : 'Archive',
                icon: conv.archived ? ArchiveRestore : Archive,
                onSelect: () => e.updateConv(conv.id, { archived: !conv.archived }),
              },
              {
                label: 'Delete chat history',
                icon: Trash2,
                danger: true,
                onSelect: () => window.confirm(`Delete all messages in "${title}" from this device?`) && void e.clearHistory(conv.id),
              },
            ]}
          />
        </div>
      </div>
    </li>
  );
}
