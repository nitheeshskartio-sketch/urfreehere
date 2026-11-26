import {
  Archive,
  ArrowDown,
  ArrowLeft,
  BellOff,
  Ban,
  EllipsisVertical,
  Info,
  LoaderCircle,
  Pin,
  Server,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Button } from '../../../ui/Button';
import { useEngine } from '../hooks';
import { sanitizeName } from '../lib/media';
import { dayLabel } from '../lib/time';
import type { Conversation, StoredEvent } from '../lib/types';
import { Avatar } from '../../../ui/avatar/Avatar';
import { Composer } from './Composer';
import { ImageViewer } from './ImageViewer';
import { Menu } from '../../../ui/Menu';
import { Message, SystemMessage } from './Message';

export function ChatView({
  conv,
  onBack,
  onInfo,
  onInvite,
  showBack,
}: {
  conv: Conversation;
  onBack: () => void;
  onInfo: () => void;
  onInvite: () => void;
  showBack: boolean;
}) {
  const e = useEngine();
  const [replyTo, setReplyTo] = useState<StoredEvent | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dropped, setDropped] = useState<File[] | null>(null);
  const clearDropped = useCallback(() => setDropped(null), []);
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const events = e.eventsOf(conv.id);
  const title = e.convTitle(conv);
  const group = e.group(conv);
  const isGroup = conv.type === 'group';
  const self = e.isSelfChat(conv);
  const contact = conv.peerId ? e.contacts.get(conv.peerId) : undefined;
  const canPost = isGroup ? !!group?.members.has(e.me) && !group.deleted && !conv.joining : contact?.state !== 'blocked';

  useEffect(() => {
    e.setActive(conv.id);
    setReplyTo(null);
    atBottom.current = true;
    return () => e.setActive(null);
  }, [conv.id, e]);

  // Mark as read while the chat is open.
  useEffect(() => {
    if (conv.unread) e.markRead(conv.id);
  }, [conv.unread, conv.id, e]);

  // Stick to the bottom when new messages arrive (if already there, or the message is mine).
  const lastId = events[events.length - 1]?.id;
  const lastMine = events[events.length - 1]?.author === e.me;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (atBottom.current || lastMine) el.scrollTop = el.scrollHeight;
  }, [lastId, lastMine, conv.id]);

  const onScroll = () => {
    const el = scroller.current!;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottom.current = near;
    setShowJump(!near);
  };

  const images = useMemo(() => events.filter((x) => x.kind === 'image' && !x.body.viewOnce && !x.body.secret && e.hasFile(String(x.body.fileId))).map((x) => String(x.body.fileId)), [events, e]);

  const jumpTo = (id: string) => {
    const el = document.getElementById(`m-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('bg-accent-soft/60');
    window.setTimeout(() => el.classList.remove('bg-accent-soft/60'), 1200);
  };

  // --- header subtitle
  let subtitle: React.ReactNode = '';
  const typing = e.typingIn(conv.id);
  if (typing.length) subtitle = <span className="text-accent">{isGroup ? `${typing.map((u) => e.nameOf(u).split(' ')[0]).join(', ')} typing…` : 'typing…'}</span>;
  else if (isGroup) {
    if (conv.joining) subtitle = 'Waiting to be added';
    else if (group?.valid) {
      const names = [...group.members.keys()].map((u) => (u === e.me ? 'You' : e.nameOf(u).split(' ')[0]));
      subtitle = `${group.members.size} participants · ${names.slice(0, 6).join(', ')}${names.length > 6 ? '…' : ''}`;
    }
  } else if (self) {
    subtitle = 'Only on this device · never sent anywhere';
  } else if (conv.peerId) {
    const st = e.peerStatus(conv.peerId);
    const route = e.routeOf(conv.peerId);
    subtitle = (
      <span className="inline-flex items-center gap-1.5">
        {st === 'connected' ? 'online' : st === 'connecting' ? 'connecting…' : st === 'online' ? 'online' : 'offline'}
        {st === 'connected' && route === 'relay' && (
          <span className="inline-flex items-center gap-1 text-muted" title="A direct connection wasn't possible, so encrypted data is forwarded by a relay server that can't read it.">
            · <Server className="size-3" /> via relay
          </span>
        )}
      </span>
    );
  }

  const waiting = !isGroup && events.some((x) => x.author === e.me && e.deliveryOf(x) === 'waiting');

  // --- drag & drop files into the chat
  const onDrop = (ev: DragEvent) => {
    ev.preventDefault();
    setDragging(false);
    if (!canPost) return;
    // Dropped files open the preview, where the caption and Send as mode are chosen.
    const files = Array.from(ev.dataTransfer.files);
    if (files.length) setDropped(files);
  };

  return (
    <div
      className="relative flex h-full min-w-0 flex-col bg-canvas"
      onDragOver={(ev) => {
        if (canPost && ev.dataTransfer.types.includes('Files')) {
          ev.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(ev) => !ev.currentTarget.contains(ev.relatedTarget as Node) && setDragging(false)}
      onDrop={onDrop}
    >
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-canvas px-2 sm:px-4">
        {showBack && (
          <button type="button" onClick={onBack} className="rounded-md p-2 text-muted hover:bg-surface hover:text-ink" aria-label="Back to chats">
            <ArrowLeft className="size-5" />
          </button>
        )}
        <button type="button" onClick={onInfo} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 text-left hover:bg-surface">
          <Avatar
            avatar={e.convImage(conv)}
            name={title}
            seed={conv.peerId ?? conv.groupId}
            size={40}
            group={isGroup}
            online={!isGroup && !self && conv.peerId ? e.peerStatus(conv.peerId) !== 'offline' : undefined}
          />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold">{title}</span>
            <span className="block truncate text-[12.5px] text-muted">{subtitle}</span>
          </span>
        </button>
        {isGroup && e.isAdmin(conv.groupId!) && !group?.deleted && (
          <button type="button" onClick={onInvite} className="hidden rounded-md p-2 text-muted hover:bg-surface hover:text-ink sm:block" aria-label="Invite people" title="Invite people">
            <UserPlus className="size-5" />
          </button>
        )}
        <button type="button" onClick={onInfo} className="rounded-md p-2 text-muted hover:bg-surface hover:text-ink" aria-label={isGroup ? 'Group info' : 'Contact info'} title="Info">
          <Info className="size-5" />
        </button>
        <Menu
          label="Chat options"
          trigger={<EllipsisVertical className="size-5" />}
          items={[
            { label: isGroup ? 'Group info' : 'Contact info', icon: Info, onSelect: onInfo },
            { label: 'Invite people', icon: UserPlus, onSelect: onInvite, hidden: !isGroup || !e.isAdmin(conv.groupId!) || !!group?.deleted },
            { label: conv.pinned ? 'Unpin chat' : 'Pin chat', icon: Pin, onSelect: () => e.updateConv(conv.id, { pinned: !conv.pinned }) },
            { label: conv.muted ? 'Unmute' : 'Mute', icon: BellOff, hidden: self, onSelect: () => e.updateConv(conv.id, { muted: !conv.muted }) },
            { label: conv.archived ? 'Unarchive' : 'Archive', icon: Archive, onSelect: () => e.updateConv(conv.id, { archived: !conv.archived }) },
            {
              label: 'Block',
              icon: Ban,
              danger: true,
              hidden: isGroup || self || contact?.state === 'blocked',
              onSelect: () => window.confirm(`Block ${title}? They won't be able to connect to you or send you messages.`) && e.blockUser(conv.peerId!),
            },
            {
              label: 'Delete chat history',
              icon: Trash2,
              danger: true,
              onSelect: () => window.confirm('Delete all messages in this chat from this device?') && void e.clearHistory(conv.id),
            },
          ]}
        />
      </div>

      {/* Banners */}
      {contact?.state === 'request' && (
        <div className="flex flex-col gap-3 border-b border-line bg-panel px-4 py-3 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm text-ink-soft">
            <span className="font-semibold">{title}</span> isn't in your contacts. Read receipts are off and files won't download until you accept.
          </p>
          <div className="flex gap-2">
            <Button variant="danger" size="sm" onClick={() => window.confirm(`Block ${title}?`) && e.blockUser(conv.peerId!)}>
              Block
            </Button>
            <Button size="sm" onClick={() => e.acceptRequest(conv.peerId!)}>
              Accept
            </Button>
          </div>
        </div>
      )}
      {contact?.state === 'blocked' && (
        <div className="flex items-center gap-3 border-b border-line bg-panel px-4 py-3">
          <p className="flex-1 text-sm text-ink-soft">You blocked this contact.</p>
          <Button variant="secondary" size="sm" onClick={() => e.unblockUser(conv.peerId!)}>
            Unblock
          </Button>
        </div>
      )}
      {conv.joining && (
        <div className="flex items-start gap-3 border-b border-line bg-panel px-4 py-3">
          {conv.joining.status === 'pending' ? <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin text-accent" /> : <Ban className="mt-0.5 size-4 shrink-0 text-danger" />}
          <p className="text-sm text-ink-soft">
            {conv.joining.status === 'pending'
              ? 'Your request was sent. You will be added automatically as soon as a group member is online.'
              : `Your request to join was declined${conv.joining.reason ? `: ${conv.joining.reason}` : '.'}`}
          </p>
        </div>
      )}

      {/* Messages */}
      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-2 py-3 sm:px-6">
        {events.length === 0 && !conv.joining && (
          <div className="mx-auto mt-10 max-w-sm rounded-xl bg-panel/80 px-5 py-4 text-center text-sm text-muted shadow-card">
            {self
              ? 'Your personal space. Keep notes, links, photos and files here. They stay only on this device and are never sent anywhere.'
              : isGroup
                ? 'No messages yet. Say hello to the group.'
                : `No messages yet. Messages to ${title} are delivered directly when you're both online.`}
          </div>
        )}
        <MessageList events={events} isGroup={isGroup} onReply={setReplyTo} onOpenImage={(id) => setViewer(Math.max(0, images.indexOf(id)))} onJump={jumpTo} />
      </div>

      {showJump && (
        <button
          type="button"
          onClick={() => {
            const el = scroller.current!;
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
          }}
          className="absolute bottom-24 right-4 flex size-10 items-center justify-center rounded-full border border-line bg-panel text-muted shadow-pop hover:text-ink"
          aria-label="Jump to latest message"
        >
          <ArrowDown className="size-5" />
        </button>
      )}

      {waiting && e.peerStatus(conv.peerId!) === 'offline' && (
        <p className="shrink-0 border-t border-line bg-panel px-4 py-1.5 text-center text-[12px] text-muted">
          {title} is offline. Waiting messages are delivered automatically when you're both online.
        </p>
      )}

      {canPost ? (
        <Composer convId={conv.id} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} dropped={dropped} onDroppedHandled={clearDropped} />
      ) : (
        <div className="shrink-0 border-t border-line bg-panel px-4 py-4 text-center text-sm text-muted">
          {conv.joining
            ? 'You can send messages once you have been added.'
            : group?.deleted
              ? 'This group was deleted.'
              : isGroup
                ? "You're no longer a participant in this group."
                : 'Unblock this contact to send messages.'}
        </div>
      )}

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-accent-soft/80">
          <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-accent bg-panel px-8 py-6 text-accent">
            <Upload className="size-7" />
            <p className="text-sm font-semibold">Drop to send</p>
          </div>
        </div>
      )}

      {viewer !== null && images.length > 0 && (
        <ImageViewer
          fileIds={images}
          index={Math.min(viewer, images.length - 1)}
          onIndex={setViewer}
          onClose={() => setViewer(null)}
          title={(id) => sanitizeName(events.find((x) => x.body.fileId === id)?.body.name)}
        />
      )}
    </div>
  );
}

function MessageList({
  events,
  isGroup,
  onReply,
  onOpenImage,
  onJump,
}: {
  events: StoredEvent[];
  isGroup: boolean;
  onReply: (e: StoredEvent) => void;
  onOpenImage: (fileId: string) => void;
  onJump: (id: string) => void;
}) {
  const e = useEngine();
  const out: React.ReactNode[] = [];
  let lastDay = '';
  let prev: StoredEvent | null = null;
  for (const ev of events) {
    const day = new Date(ev.ts).toDateString();
    if (day !== lastDay) {
      lastDay = day;
      prev = null;
      out.push(
        <div key={`d-${day}`} className="my-4 flex items-center gap-3 text-[12px] text-muted">
          <span className="h-px flex-1 bg-line" />
          {dayLabel(ev.ts)}
          <span className="h-px flex-1 bg-line" />
        </div>,
      );
    }
    if (ev.kind === 'op') {
      // The creator's own "create" is shown as a system line too.
      out.push(<SystemMessage key={ev.id} text={e.describeOp(ev)} />);
      prev = null;
      continue;
    }
    const showSender = !prev || prev.author !== ev.author || ev.ts - prev.ts > 5 * 60_000;
    out.push(
      <div key={ev.id} className="rounded-lg transition-colors duration-700">
        <Message event={ev} showSender={showSender} isGroup={isGroup} onReply={onReply} onOpenImage={onOpenImage} onJump={onJump} />
      </div>,
    );
    prev = ev;
  }
  return <>{out}</>;
}
