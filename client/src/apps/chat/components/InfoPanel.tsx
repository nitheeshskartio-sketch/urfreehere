import { Ban, Copy, Crown, EllipsisVertical, FileText, LogOut, Pencil, Server, ShieldCheck, Trash2, UserMinus, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { formatBytes } from '../../../lib/format';
import { Button } from '../../../ui/Button';
import { useEngine, useFileUrl } from '../hooks';
import { formatUserId } from '../lib/encoding';
import { MAX_GROUP_MEMBERS } from '../lib/groups';
import { sanitizeName } from '../lib/media';
import type { Conversation, FileBody, StoredEvent } from '../lib/types';
import { Avatar } from './Avatar';
import { AvatarPicker } from './AvatarPicker';
import { Menu } from './Menu';
import { Field, Modal, inputClass } from './Modal';

export function InfoPanel({ conv, onClose, onInvite, onOpenChat }: { conv: Conversation; onClose: () => void; onInvite: () => void; onOpenChat: (id: string) => void }) {
  const e = useEngine();
  const isGroup = conv.type === 'group';
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-line px-3">
        <button type="button" onClick={onClose} className="rounded-md p-2 text-muted hover:bg-surface hover:text-ink" aria-label="Close info">
          <X className="size-5" />
        </button>
        <h2 className="text-[15px] font-semibold">{isGroup ? 'Group info' : 'Contact info'}</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isGroup ? <GroupInfo conv={conv} onInvite={onInvite} onOpenChat={onOpenChat} /> : <ContactInfo conv={conv} />}
        <SharedMedia events={e.eventsOf(conv.id)} />
      </div>
    </div>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border-t border-line px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-ink-soft">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function ContactInfo({ conv }: { conv: Conversation }) {
  const e = useEngine();
  const id = conv.peerId!;
  const p = e.profileOf(id);
  const contact = e.contacts.get(id);
  const st = e.peerStatus(id);
  const route = e.routeOf(id);
  return (
    <>
      <div className="flex flex-col items-center px-4 pb-5 pt-6 text-center">
        <Avatar avatar={p?.avatar} name={e.nameOf(id)} seed={id} size={96} />
        <h3 className="mt-3 text-lg font-semibold">{e.nameOf(id)}</h3>
        {p?.status && <p className="mt-1 text-sm text-muted">{p.status}</p>}
        <p className="mt-2 text-[13px] text-muted">{st === 'connected' ? 'Connected' : st === 'connecting' ? 'Connecting…' : st === 'online' ? 'Online' : 'Offline'}</p>
      </div>
      <Section title="Chat ID">
        <div className="flex items-center justify-between gap-2">
          <code className="font-mono text-sm tracking-wider">{formatUserId(id)}</code>
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(id).then(() => e.toast('Chat ID copied', 'success'))}
            className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-ink"
            aria-label="Copy chat ID"
          >
            <Copy className="size-4" />
          </button>
        </div>
        <p className="mt-2 flex items-start gap-2 text-[12.5px] leading-relaxed text-muted">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
          The connection is verified against this ID: only the device holding its key can connect as {e.nameOf(id)}.
        </p>
        {st === 'connected' && (
          <p className="mt-2 flex items-start gap-2 text-[12.5px] leading-relaxed text-muted">
            <Server className="mt-0.5 size-4 shrink-0" />
            {route === 'relay'
              ? 'Connected through a relay server because a direct path was blocked. The relay forwards encrypted data it cannot read.'
              : 'Connected directly, peer to peer.'}
          </p>
        )}
      </Section>
      <Section title="Privacy">
        {contact?.state === 'blocked' ? (
          <Button variant="secondary" className="w-full" onClick={() => e.unblockUser(id)}>
            Unblock
          </Button>
        ) : (
          <Button variant="danger" className="w-full" onClick={() => window.confirm(`Block ${e.nameOf(id)}?`) && e.blockUser(id)}>
            <Ban />
            Block {e.nameOf(id)}
          </Button>
        )}
        <Button variant="ghost" className="mt-2 w-full text-danger" onClick={() => window.confirm('Delete all messages in this chat from this device?') && void e.clearHistory(conv.id)}>
          <Trash2 />
          Delete chat history
        </Button>
      </Section>
    </>
  );
}

function GroupInfo({ conv, onInvite, onOpenChat }: { conv: Conversation; onInvite: () => void; onOpenChat: (id: string) => void }) {
  const e = useEngine();
  const g = e.group(conv);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  if (!g?.valid) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted">
        {conv.joining ? 'Group details appear once you have been added.' : 'Loading group details…'}
      </div>
    );
  }
  const admin = e.isAdmin(g.groupId);
  const member = g.members.has(e.me);
  const members = [...g.members.values()].sort((a, b) => (a.userId === e.me ? -1 : b.userId === e.me ? 1 : a.role === b.role ? e.nameOf(a.userId).localeCompare(e.nameOf(b.userId)) : a.role === 'admin' ? -1 : 1));

  const run = (p: Promise<unknown>) => p.catch((err: Error) => e.toast(err.message, 'error'));

  return (
    <>
      <div className="flex flex-col items-center px-4 pb-5 pt-6 text-center">
        <Avatar avatar={g.image} name={g.name} seed={g.groupId} size={96} group />
        <h3 className="mt-3 text-lg font-semibold">{g.name}</h3>
        <p className="mt-1 text-[13px] text-muted">
          Group · {g.members.size} {g.members.size === 1 ? 'participant' : 'participants'}
        </p>
        {g.description && <p className="mt-3 whitespace-pre-wrap text-sm text-ink-soft">{g.description}</p>}
        {g.deleted && <p className="mt-3 rounded-md bg-danger-soft px-3 py-1.5 text-[13px] text-danger">This group was deleted.</p>}
        {admin && !g.deleted && (
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              <Pencil />
              Edit
            </Button>
            <Button variant="secondary" size="sm" onClick={onInvite}>
              <UserPlus />
              Invite
            </Button>
          </div>
        )}
      </div>

      <Section
        title={`${g.members.size} of ${MAX_GROUP_MEMBERS} participants`}
        action={
          admin && !g.deleted ? (
            <button type="button" onClick={() => setAdding(true)} className="text-[13px] font-medium text-accent hover:underline">
              Add
            </button>
          ) : undefined
        }
      >
        <ul className="-mx-2">
          {members.map((m) => {
            const online = m.userId !== e.me && e.peerStatus(m.userId) !== 'offline';
            return (
              <li key={m.userId} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => m.userId !== e.me && onOpenChat(m.userId)} disabled={m.userId === e.me}>
                  <Avatar avatar={e.profileOf(m.userId)?.avatar} name={e.nameOf(m.userId)} seed={m.userId} size={36} online={m.userId === e.me ? undefined : online} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{m.userId === e.me ? 'You' : e.nameOf(m.userId)}</span>
                    <span className="block truncate text-[12px] text-muted">{e.profileOf(m.userId)?.status || formatUserId(m.userId)}</span>
                  </span>
                </button>
                {m.role === 'admin' && <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent">Admin</span>}
                {admin && m.userId !== e.me && !g.deleted && (
                  <Menu
                    label={`Options for ${e.nameOf(m.userId)}`}
                    trigger={<EllipsisVertical className="size-4" />}
                    items={[
                      { label: 'Message', icon: UserPlus, onSelect: () => onOpenChat(m.userId) },
                      {
                        label: m.role === 'admin' ? 'Dismiss as admin' : 'Make admin',
                        icon: Crown,
                        hidden: m.userId === g.createdBy,
                        onSelect: () => void run(e.setRole(g.groupId, m.userId, m.role === 'admin' ? 'member' : 'admin')),
                      },
                      {
                        label: 'Remove from group',
                        icon: UserMinus,
                        danger: true,
                        hidden: m.userId === g.createdBy,
                        onSelect: () => window.confirm(`Remove ${e.nameOf(m.userId)} from the group?`) && void run(e.removeMember(g.groupId, m.userId)),
                      },
                    ]}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Actions">
        <div className="space-y-2">
          {member && !g.deleted && (
            <Button variant="danger" className="w-full" onClick={() => window.confirm(`Leave "${g.name}"?`) && void run(e.leaveGroup(g.groupId))}>
              <LogOut />
              Leave group
            </Button>
          )}
          {admin && !g.deleted && (
            <Button
              variant="danger"
              className="w-full"
              onClick={() => window.confirm(`Delete "${g.name}" for everyone? Members keep their history but can't send messages.`) && void run(e.deleteGroup(g.groupId))}
            >
              <Trash2 />
              Delete group
            </Button>
          )}
          <Button variant="ghost" className="w-full text-danger" onClick={() => window.confirm('Delete all messages in this group from this device?') && void e.clearHistory(conv.id)}>
            Delete chat history
          </Button>
          {(!member || g.deleted) && (
            <Button variant="ghost" className="w-full" onClick={() => void e.forgetConversation(conv.id)}>
              Remove from chat list
            </Button>
          )}
        </div>
      </Section>

      {editing && <EditGroup groupId={g.groupId} onClose={() => setEditing(false)} />}
      {adding && <AddMembers groupId={g.groupId} onClose={() => setAdding(false)} />}
    </>
  );
}

function EditGroup({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const e = useEngine();
  const g = e.groups.get(groupId)!;
  const [name, setName] = useState(g.name);
  const [description, setDescription] = useState(g.description);
  const [image, setImage] = useState(g.image);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const patch: { name?: string; description?: string; image?: string | null } = {};
    if (name.trim() !== g.name) patch.name = name.trim();
    if (description.trim() !== g.description) patch.description = description.trim();
    if (image !== g.image) patch.image = image;
    try {
      if (Object.keys(patch).length) await e.updateGroup(groupId, patch);
      onClose();
    } catch (err) {
      e.toast((err as Error).message, 'error');
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Edit group"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !name.trim()}>
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-5 p-4 sm:p-5">
        <AvatarPicker value={image} onChange={setImage} name={name} group />
        <Field label="Group name">
          <input className={inputClass} value={name} onChange={(ev) => setName(ev.target.value)} maxLength={80} />
        </Field>
        <Field label="Description">
          <textarea className={`${inputClass} min-h-[90px]`} value={description} onChange={(ev) => setDescription(ev.target.value)} maxLength={500} />
        </Field>
      </div>
    </Modal>
  );
}

export function ContactPicker({ selected, onToggle, exclude }: { selected: Set<string>; onToggle: (id: string) => void; exclude: Set<string> }) {
  const e = useEngine();
  const contacts = [...e.contacts.values()].filter((c) => c.state === 'contact' && !exclude.has(c.userId));
  if (!contacts.length) return <p className="rounded-lg bg-surface px-3 py-4 text-center text-sm text-muted">No contacts yet. You can invite people with a link after creating the group.</p>;
  return (
    <ul className="max-h-[280px] overflow-y-auto rounded-lg border border-line">
      {contacts.map((c) => {
        const ok = e.canAdd(c.userId);
        return (
          <li key={c.userId} className="border-b border-line last:border-0">
            <label className={`flex items-center gap-3 px-3 py-2.5 ${ok ? 'cursor-pointer hover:bg-surface' : 'opacity-60'}`}>
              <input type="checkbox" className="size-4 accent-[rgb(var(--c-accent))]" checked={selected.has(c.userId)} disabled={!ok} onChange={() => onToggle(c.userId)} />
              <Avatar avatar={e.profileOf(c.userId)?.avatar} name={e.nameOf(c.userId)} seed={c.userId} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{e.nameOf(c.userId)}</span>
                {!ok && <span className="block text-[12px] text-muted">Connect with them once before adding</span>}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function AddMembers({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const e = useEngine();
  const g = e.groups.get(groupId)!;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setSelected((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set(s).add(id)));
  return (
    <Modal
      title="Add participants"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!selected.size}
            onClick={() => {
              void e.addMembers(groupId, [...selected]);
              onClose();
            }}
          >
            Add {selected.size || ''}
          </Button>
        </div>
      }
    >
      <div className="p-4 sm:p-5">
        <ContactPicker selected={selected} onToggle={toggle} exclude={new Set(g.members.keys())} />
      </div>
    </Modal>
  );
}

function SharedMedia({ events }: { events: StoredEvent[] }) {
  const [tab, setTab] = useState<'media' | 'docs'>('media');
  const media = events.filter((x) => x.kind === 'image');
  const docs = events.filter((x) => x.kind === 'file');
  return (
    <Section title="Shared media and documents">
      <div className="mb-3 flex gap-1">
        {(['media', 'docs'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-md px-2.5 py-1 text-[13px] font-medium ${tab === t ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface'}`}
          >
            {t === 'media' ? `Photos (${media.length})` : `Documents (${docs.length})`}
          </button>
        ))}
      </div>
      {tab === 'media' ? (
        media.length ? (
          <div className="grid grid-cols-3 gap-1.5">
            {media.slice(-60).reverse().map((m) => (
              <MediaThumb key={m.id} body={m.body as unknown as FileBody} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No photos yet.</p>
        )
      ) : docs.length ? (
        <ul className="space-y-1.5">
          {docs.slice(-60).reverse().map((d) => (
            <DocRow key={d.id} body={d.body as unknown as FileBody} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No documents yet.</p>
      )}
    </Section>
  );
}

function MediaThumb({ body }: { body: FileBody }) {
  const url = useFileUrl(body.fileId);
  return (
    <a href={url ?? undefined} download={sanitizeName(body.name)} className="block aspect-square overflow-hidden rounded-md bg-slate-100" aria-label={`Download ${sanitizeName(body.name)}`}>
      {url ? <img src={url} alt="" className="size-full object-cover" /> : body.thumb ? <img src={body.thumb} alt="" className="size-full object-cover blur-sm" /> : null}
    </a>
  );
}

function DocRow({ body }: { body: FileBody }) {
  const url = useFileUrl(body.fileId);
  const name = sanitizeName(body.name);
  return (
    <li>
      <a href={url ?? undefined} download={name} className={`flex items-center gap-3 rounded-lg px-2 py-2 ${url ? 'hover:bg-surface' : 'pointer-events-none opacity-60'}`}>
        <FileText className="size-5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{name}</span>
          <span className="block text-[12px] text-muted">{formatBytes(body.size)}{url ? '' : ' · not downloaded'}</span>
        </span>
      </a>
    </li>
  );
}
