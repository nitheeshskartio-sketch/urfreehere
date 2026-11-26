import {
  Archive,
  ArchiveRestore,
  Bell,
  ArrowLeft,
  BellOff,
  ChevronDown,
  EllipsisVertical,
  Eraser,
  Inbox,
  KeyRound,
  LogOut,
  MessageSquarePlus,
  Pin,
  PinOff,
  QrCode,
  Search,
  Settings,
  SquarePen,
  Trash2,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../../ui/Button';
import { Avatar } from '../../../ui/avatar/Avatar';
import { Menu } from '../../../ui/Menu';
import { MoodBadge } from './Mood';
import { deleteChatPrompt } from './deleteChat';
import { useEngine } from '../hooks';
import { shortTime } from '../lib/time';
import type { Conversation } from '../lib/types';
import { enableDesktopNotifications, notificationPermission } from '../lib/notify';
import { Ticks } from './Ticks';

export type Dialog = 'new-chat' | 'new-group' | 'join' | 'scan' | 'settings' | 'sign-out' | null;

type Filter = 'unread' | 'dm' | 'group' | null;

/** Teams-style chat list: heading, filter chips, Pinned and Recent sections. */
export function Sidebar({
  activeId,
  onOpen,
  onDialog,
  query,
  onQuery,
}: {
  activeId: string | null;
  onOpen: (convId: string) => void;
  onDialog: (d: Dialog) => void;
  query: string;
  onQuery: (q: string) => void;
}) {
  const e = useEngine();
  const [filter, setFilter] = useState<Filter>(null);
  const [view, setView] = useState<'chats' | 'archived' | 'requests'>('chats');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [askNotify, setAskNotify] = useState(
    () => notificationPermission() === 'default' && !e.settings.desktopNotifications && localStorage.getItem('urchat.notify-prompt') !== 'dismissed',
  );

  const all = useMemo(() => [...e.convs.values()], [e.version]);
  const requestIds = new Set(e.requests().map((c) => c.userId));
  const isRequest = (c: Conversation) => c.type === 'dm' && requestIds.has(c.peerId!);
  const isBlocked = (c: Conversation) => c.type === 'dm' && e.contacts.get(c.peerId!)?.state === 'blocked';
  const hiddenGroup = (c: Conversation) => c.type === 'group' && !e.group(c)?.valid && !c.joining;

  const q = query.trim().toLowerCase();
  const list = all
    .filter((c) => !c.hidden && !hiddenGroup(c))
    .filter((c) => {
      if (view === 'requests') return isRequest(c);
      if (isRequest(c)) return false;
      if (view === 'archived') return c.archived;
      return !c.archived;
    })
    .filter((c) => (filter === 'dm' ? c.type === 'dm' : filter === 'group' ? c.type === 'group' : filter === 'unread' ? c.unread > 0 : true))
    .filter((c) => !q || e.convTitle(c).toLowerCase().includes(q) || (e.lastEvent(c.id) && e.describe(e.lastEvent(c.id)!).toLowerCase().includes(q)))
    .sort((a, b) => b.lastTs - a.lastTs);

  const archivedCount = all.filter((c) => c.archived && !c.hidden && !isRequest(c) && !hiddenGroup(c)).length;
  const requestCount = all.filter((c) => !c.hidden && isRequest(c)).length;

  // Leave an emptied Requests/Archived view (e.g. after accepting the last request).
  useEffect(() => {
    if ((view === 'requests' && requestCount === 0) || (view === 'archived' && archivedCount === 0)) setView('chats');
  }, [view, requestCount, archivedCount]);
  const sections: [string, Conversation[]][] =
    view === 'chats'
      ? [
          ['Pinned', list.filter((c) => c.pinned)],
          ['Recent', list.filter((c) => !c.pinned)],
        ]
      : [[view === 'archived' ? 'Archived' : 'Message requests', list]];

  const chip = (f: Exclude<Filter, null>, label: string) => (
    <button
      key={f}
      type="button"
      onClick={() => setFilter((cur) => (cur === f ? null : f))}
      aria-pressed={filter === f}
      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[12px] font-medium transition-colors ${
        filter === f ? 'border-accent bg-accent text-white' : 'border-line-strong text-ink-soft hover:bg-subtle'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Heading */}
      <div className="flex h-14 shrink-0 items-center gap-1 px-4">
        {view !== 'chats' ? (
          <button type="button" onClick={() => setView('chats')} className="flex min-w-0 flex-1 items-center gap-2 text-[17px] font-bold hover:text-accent">
            <ArrowLeft className="size-4 shrink-0" />
            <span className="truncate">{view === 'archived' ? 'Archived' : 'Message requests'}</span>
          </button>
        ) : (
          <h1 className="flex-1 text-[18px] font-bold">Chat</h1>
        )}
        <Menu
          label="More options"
          trigger={<EllipsisVertical className="size-[18px]" />}
          items={[
            { label: 'New group', icon: Users, onSelect: () => onDialog('new-group') },
            { label: 'Join a group', icon: KeyRound, onSelect: () => onDialog('join') },
            { label: 'Scan QR code', icon: QrCode, onSelect: () => onDialog('scan') },
            { label: 'Settings', icon: Settings, onSelect: () => onDialog('settings') },
            { label: 'Sign out', icon: LogOut, danger: true, onSelect: () => onDialog('sign-out') },
          ]}
        />
        <button type="button" onClick={() => onDialog('new-chat')} className="rounded-md p-2 text-muted hover:bg-subtle hover:text-ink" aria-label="New chat" title="New chat">
          <SquarePen className="size-[18px]" />
        </button>
      </div>

      {e.net === 'replaced' ? (
        <div className="mx-3 mb-2 flex items-center gap-3 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-[13px]">
          <span className="flex-1 text-ink-soft">UR Chat is open in another tab.</span>
          <Button size="sm" variant="secondary" onClick={() => e.reclaim()}>
            Use here
          </Button>
        </div>
      ) : e.net === 'offline' ? (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-md bg-subtle px-3 py-2 text-[12.5px] text-muted">
          <WifiOff className="size-4 shrink-0" />
          Offline. Messages are saved and sent when you reconnect.
        </div>
      ) : null}

      {askNotify && (
        <div className="mx-3 mb-2 flex items-start gap-2.5 rounded-md border border-line bg-panel px-3 py-2.5 shadow-card">
          <Bell className="mt-0.5 size-4 shrink-0 text-accent" />
          <div className="min-w-0 flex-1 text-[12.5px]">
            <p className="font-semibold">Get notified about new messages</p>
            <p className="text-muted">See a notification when a message arrives while you're in another tab.</p>
            <div className="mt-1.5 flex gap-3">
              <button
                type="button"
                className="font-semibold text-accent hover:underline"
                onClick={async () => {
                  const r = await enableDesktopNotifications(e);
                  setAskNotify(false);
                  if (r === 'denied') e.toast('Notifications are blocked. You can allow them in your browser\'s site settings.', 'error');
                }}
              >
                Turn on
              </button>
              <button
                type="button"
                className="text-muted hover:text-ink"
                onClick={() => {
                  localStorage.setItem('urchat.notify-prompt', 'dismissed');
                  setAskNotify(false);
                }}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search (phones; desktop uses the top bar) + filters */}
      <div className="shrink-0 space-y-2 px-3 pb-2">
        <div className="relative md:hidden">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(ev) => onQuery(ev.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="h-9 w-full rounded-md border border-line bg-panel pl-9 pr-8 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
          />
          {query && (
            <button type="button" onClick={() => onQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink" aria-label="Clear search">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        {view === 'chats' && <div className="flex gap-1.5 overflow-x-auto pb-0.5">{[chip('unread', 'Unread'), chip('dm', 'Chats'), chip('group', 'Groups')]}</div>}
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {view === 'chats' && !q && requestCount > 0 && (
          <SpecialRow icon={Inbox} label="Message requests" count={requestCount} onClick={() => setView('requests')} accent />
        )}
        {view === 'chats' && !q && archivedCount > 0 && <SpecialRow icon={Archive} label="Archived" count={archivedCount} onClick={() => setView('archived')} />}

        {list.length === 0 ? (
          <EmptyList view={view} searching={!!q} onDialog={onDialog} hasAny={all.length > 0} />
        ) : (
          sections
            .filter(([, items]) => items.length)
            .map(([title, items]) => (
              <section key={title} className="mt-1">
                <button
                  type="button"
                  onClick={() => setCollapsed((c) => ({ ...c, [title]: !c[title] }))}
                  className="flex w-full items-center gap-1 px-3 py-1.5 text-[12px] font-semibold text-muted hover:text-ink"
                  aria-expanded={!collapsed[title]}
                >
                  <ChevronDown className={`size-3.5 transition-transform ${collapsed[title] ? '-rotate-90' : ''}`} />
                  {title === 'Pinned' && <Pin className="size-3" />}
                  {title}
                </button>
                {!collapsed[title] && (
                  <ul>
                    {items.map((c) => (
                      <ConversationRow key={c.id} conv={c} active={c.id === activeId} onOpen={() => onOpen(c.id)} blocked={isBlocked(c)} />
                    ))}
                  </ul>
                )}
              </section>
            ))
        )}
      </div>
    </div>
  );
}

function SpecialRow({ icon: Icon, label, count, onClick, accent }: { icon: typeof Archive; label: string; count: number; onClick: () => void; accent?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="mx-2 flex w-[calc(100%-16px)] items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-subtle">
      <span className={`flex size-8 items-center justify-center rounded-full ${accent ? 'bg-accent-soft text-accent' : 'bg-subtle text-muted'}`}>
        <Icon className="size-4" />
      </span>
      <span className="flex-1 text-[13px] font-semibold">{label}</span>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${accent ? 'bg-accent text-white' : 'bg-subtle text-muted'}`}>{count}</span>
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
  const self = e.isSelfChat(conv);
  const online = conv.type === 'dm' && !self ? e.peerStatus(conv.peerId!) !== 'offline' : undefined;
  const unread = conv.unread > 0 && !conv.muted;

  let preview: React.ReactNode = '';
  if (conv.joining) preview = conv.joining.status === 'rejected' ? 'Request declined' : 'Waiting to be added…';
  else if (blocked) preview = 'Blocked';
  else if (typing.length) preview = <span className="text-accent">typing…</span>;
  else if (last) {
    const mine = last.author === e.me && last.kind !== 'op';
    const who = conv.type === 'group' && last.kind !== 'op' && !mine ? `${e.nameOf(last.author).split(' ')[0]}: ` : mine ? 'You: ' : '';
    preview = (
      <span className="flex min-w-0 items-center gap-1">
        {mine && <Ticks status={e.deliveryOf(last)} className="shrink-0" />}
        <span className="truncate">
          {who}
          {e.describe(last)}
        </span>
      </span>
    );
  } else preview = self ? 'Notes, links and files for yourself' : conv.type === 'dm' ? 'No messages yet' : '';

  return (
    <li className="group relative px-2 focus-within:z-30">
      <button
        type="button"
        onClick={onOpen}
        className={`chat-list-row flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors ${active ? 'bg-panel shadow-card' : 'hover:bg-subtle'}`}
        aria-current={active ? 'true' : undefined}
      >
        <MoodBadge peer={conv.type === 'dm' && !self && !blocked ? conv.peerId : undefined} size="sm">
          <Avatar avatar={e.convImage(conv)} name={title} seed={conv.peerId ?? conv.groupId} size={36} group={conv.type === 'group'} online={online} ring={conv.type === 'dm' && !self ? e.ringFor(conv.peerId) : null} />
        </MoodBadge>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={`chat-name min-w-0 flex-1 truncate ${unread ? 'font-bold' : 'font-medium'}`}>{title}</span>
            <span className={`shrink-0 text-[11px] ${unread ? 'font-semibold text-ink' : 'text-muted'}`}>{last ? shortTime(last.ts) : ''}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className={`chat-meta min-w-0 flex-1 truncate ${unread ? 'font-semibold text-ink' : 'text-muted'}`}>{preview}</span>
            {conv.muted && !self && <BellOff className="size-3.5 shrink-0 text-muted" aria-label="Muted" />}
            {conv.unread > 0 && (
              <span className={`min-w-5 shrink-0 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold text-white ${conv.muted ? 'bg-muted' : 'bg-danger'}`}>
                {conv.unread > 99 ? '99+' : conv.unread}
              </span>
            )}
          </span>
        </span>
      </button>
      <div className="absolute right-4 top-1/2 z-10 -translate-y-1/2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:hidden">
        <div className="rounded-md border border-line bg-panel shadow-card">
          <Menu
            label={`Options for ${title}`}
            trigger={<EllipsisVertical className="size-4" />}
            items={[
              { label: conv.pinned ? 'Unpin' : 'Pin', icon: conv.pinned ? PinOff : Pin, onSelect: () => e.updateConv(conv.id, { pinned: !conv.pinned }) },
              { label: conv.muted ? 'Unmute' : 'Mute', icon: BellOff, hidden: self, onSelect: () => e.updateConv(conv.id, { muted: !conv.muted }) },
              {
                label: conv.archived ? 'Unarchive' : 'Archive',
                icon: conv.archived ? ArchiveRestore : Archive,
                onSelect: () => e.updateConv(conv.id, { archived: !conv.archived }),
              },
              {
                label: 'Delete chat history',
                icon: Eraser,
                danger: true,
                onSelect: () => window.confirm(`Delete all messages in "${title}" from this device?`) && void e.clearHistory(conv.id),
              },
              {
                label: 'Delete chat',
                icon: Trash2,
                danger: true,
                hidden: self,
                onSelect: () => window.confirm(deleteChatPrompt(e, conv, title)) && void e.deleteChat(conv.id),
              },
            ]}
          />
        </div>
      </div>
    </li>
  );
}
