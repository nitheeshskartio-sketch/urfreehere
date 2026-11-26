import {
  Activity,
  ArrowLeft,
  Ban,
  CircleCheck,
  Clock,
  Copy,
  Crown,
  EllipsisVertical,
  Gauge,
  ImageOff,
  LoaderCircle,
  LogOut,
  Megaphone,
  Mic,
  MicOff,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserMinus,
  Users,
  X,
  ThumbsDown,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { formatUserId } from '../apps/chat/lib/encoding';
import { Link } from '../site/Link';
import { SiteMark } from '../site/Logo';
import { Avatar } from '../ui/avatar/Avatar';
import { Button } from '../ui/Button';
import { Menu } from '../ui/Menu';
import { Modal } from '../ui/Modal';
import { ThemeToggle } from '../ui/ThemeToggle';
import { AdminLoginForm } from './AdminLogin';
import { LOGOUT_EVENT, adminApi, adminErrorText, adminLogout, adminToken } from './api';

// ------------------------------------------------------------------- types

interface Settings {
  signupsOpen: boolean;
  gifsEnabled: boolean;
  micCreateEnabled: boolean;
  postmanEnabled: boolean;
  announcement: { text: string; tone: 'info' | 'warning' | 'success'; updatedAt: number } | null;
}

interface Overview {
  server: { startedAt: number; uptimeSeconds: number; node: string; memoryMb: number; heapMb: number; load: number[]; adminSessions: number };
  accounts: { mode: 'connected' | 'starting' | 'error' | 'disabled'; inactiveDays: number; total?: number; new24h?: number; new7d?: number; active24h?: number; banned: number };
  chat: { online: number; groupsOnline: number; invites: number; relay?: { enabled: boolean; mbPerUserPerHour: number; mbLastHour: number } };
  mic: { rooms: number; people: number };
  postman: { total: number; waiting: number; paired: number };
  gif: { configured: boolean; used: number; limit: number; cached: number; unauthorized: boolean; upstreamLimited: boolean };
  settings: Settings;
}

interface Account {
  userId: string;
  name: string;
  status: string;
  avatar: string | null;
  createdAt: number;
  lastActiveAt: number;
  removalAt: number;
  online: boolean;
  banned: boolean;
}

interface MicParticipant {
  pid: string;
  name: string;
  avatar: string | null;
  muted: boolean;
  isHost: boolean;
  status: string;
  joinedAt: number;
}

interface MicRoom {
  code: string;
  name: string;
  description: string;
  maxParticipants: number;
  participantCount: number;
  visibility: 'private' | 'public';
  hasPassword: boolean;
  locked: boolean;
  status: string;
  expiresAt: number | null;
  createdAt: number;
  participants: MicParticipant[];
}

type Section = 'overview' | 'profiles' | 'suspended' | 'mic' | 'controls' | 'announcement' | 'log';

const SECTIONS: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: Gauge },
  { id: 'profiles', label: 'Profiles', icon: Users },
  { id: 'suspended', label: 'Suspended', icon: Ban },
  { id: 'mic', label: 'Mic rooms', icon: Mic },
  { id: 'controls', label: 'Controls', icon: SlidersHorizontal },
  { id: 'announcement', label: 'Announcement', icon: Megaphone },
  { id: 'log', label: 'Activity log', icon: Activity },
];

// ----------------------------------------------------------------- helpers

const dateTime = (ts: number) => new Date(ts).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function ago(ts: number) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

function duration(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

function useNotice() {
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const timer = useRef<number>();
  const show = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => {
    setNotice({ text, tone });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNotice(null), 4000);
  }, []);
  return { notice, show };
}

type Notify = (text: string, tone?: 'ok' | 'error') => void;

// -------------------------------------------------------------------- page

export default function AdminPage() {
  const [authed, setAuthed] = useState(() => !!adminToken());
  const [section, setSection] = useState<Section>('overview');
  const { notice, show } = useNotice();

  useEffect(() => {
    const out = () => setAuthed(false);
    window.addEventListener(LOGOUT_EVENT, out);
    return () => window.removeEventListener(LOGOUT_EVENT, out);
  }, []);

  if (!authed) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-surface p-6">
        <div className="w-full max-w-sm rounded-xl border border-line bg-panel p-6 shadow-card">
          <AdminLoginForm onSuccess={() => setAuthed(true)} />
          <Link href="/chat" className="mt-4 block text-center text-[13px] text-muted hover:text-ink">
            Back to UR Chat
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-surface text-ink">
      <header className="flex h-12 shrink-0 items-center gap-3 bg-rail px-3">
        <Link href="/chat" className="rounded-md p-1.5 text-muted hover:bg-subtle hover:text-ink" aria-label="Back to UR Chat">
          <ArrowLeft className="size-4" />
        </Link>
        <SiteMark className="size-6" />
        <span className="text-[14px] font-semibold">Admin console</span>
        <span className="hidden items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent sm:inline-flex">
          <Crown className="size-3" /> God mode
        </span>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={() => void adminLogout()}>
            <LogOut /> Lock
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav aria-label="Admin sections" className="flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-panel p-2 md:w-56 md:flex-col md:overflow-visible md:border-b-0 md:border-r">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              aria-current={section === s.id ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13.5px] ${
                section === s.id ? 'bg-accent-soft font-semibold text-accent' : 'text-ink-soft hover:bg-surface'
              }`}
            >
              <s.icon className="size-4" />
              {s.label}
            </button>
          ))}
        </nav>
        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-5xl">
            {section === 'overview' && <OverviewSection onGo={setSection} />}
            {section === 'profiles' && <ProfilesSection notify={show} />}
            {section === 'suspended' && <SuspendedSection notify={show} />}
            {section === 'mic' && <MicSection notify={show} />}
            {section === 'controls' && <ControlsSection notify={show} />}
            {section === 'announcement' && <AnnouncementSection notify={show} />}
            {section === 'log' && <LogSection />}
          </div>
        </main>
      </div>

      {notice && (
        <div
          role="status"
          className={`fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2.5 text-[13.5px] font-medium shadow-pop ${
            notice.tone === 'error' ? 'bg-danger text-white' : 'bg-inverse text-on-inverse'
          }`}
        >
          {notice.text}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ building blocks

function Heading({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {sub && <p className="mt-1 text-[13.5px] text-muted">{sub}</p>}
      </div>
      {actions}
    </div>
  );
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-line bg-panel p-4 shadow-card ${className}`}>{children}</section>;
}

function Stat({ icon: Icon, label, value, detail, onClick }: { icon: LucideIcon; label: string; value: ReactNode; detail?: ReactNode; onClick?: () => void }) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-[12.5px] font-medium text-muted">
        <Icon className="size-4" />
        {label}
      </span>
      <span className="mt-2 block text-2xl font-semibold tabular-nums">{value}</span>
      {detail && <span className="mt-1 block text-[12.5px] text-muted">{detail}</span>}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="rounded-lg border border-line bg-panel p-4 text-left shadow-card hover:border-accent/50">
      {body}
    </button>
  ) : (
    <div className="rounded-lg border border-line bg-panel p-4 shadow-card">{body}</div>
  );
}

function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-[13.5px] text-danger">
      {adminErrorText(error)}
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-12">
      <LoaderCircle className="size-6 animate-spin text-muted" />
    </div>
  );
}

/** Loads `path`, optionally refreshing every `every` ms. */
function useAdminData<T>(path: string, every = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      setData(await adminApi<T>(path));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    setLoading(true);
    void load();
    if (!every) return;
    const t = window.setInterval(() => void load(), every);
    return () => window.clearInterval(t);
  }, [load, every]);
  return { data, error, loading, reload: load, setData };
}

function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-3">
      <span>
        <span className="block text-[14px] font-medium">{label}</span>
        <span className="mt-0.5 block text-[13px] text-muted">{description}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-line-strong'}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </label>
  );
}

// ---------------------------------------------------------------- overview

function OverviewSection({ onGo }: { onGo: (s: Section) => void }) {
  const { data, error, loading, reload } = useAdminData<Overview>('/overview', 10_000);
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error} onRetry={() => void reload()} />;
  const a = data.accounts;
  const s = data.settings;
  const off = [!s.signupsOpen && 'sign-ups', !s.gifsEnabled && 'GIFs', !s.micCreateEnabled && 'new Mic rooms', !s.postmanEnabled && 'Postman'].filter(Boolean);
  return (
    <>
      <Heading
        title="Overview"
        sub="Live numbers for the whole site. Refreshes every 10 seconds."
        actions={
          <Button variant="secondary" size="sm" onClick={() => void reload()}>
            <RefreshCw /> Refresh
          </Button>
        }
      />
      {off.length > 0 && (
        <p className="mb-4 rounded-lg border border-warning/30 bg-warning-soft px-4 py-2.5 text-[13.5px] text-warning">Switched off: {off.join(', ')}.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Users} label="Chat users online" value={data.chat.online} detail={`${data.chat.groupsOnline} active groups · ${data.chat.invites} invite links${data.chat.relay?.enabled ? ` · ${data.chat.relay.mbLastHour} MB relayed this hour` : ''}`} />
        <Stat
          icon={Users}
          label="Profiles"
          value={a.mode === 'connected' ? a.total ?? '—' : '—'}
          detail={a.mode === 'connected' ? `+${a.new24h} today · +${a.new7d} this week · ${a.active24h} active today` : a.mode === 'disabled' ? 'MongoDB not configured' : `Database ${a.mode}`}
          onClick={() => onGo('profiles')}
        />
        <Stat icon={Mic} label="Mic rooms" value={data.mic.rooms} detail={`${data.mic.people} people talking`} onClick={() => onGo('mic')} />
        <Stat icon={RefreshCw} label="Postman transfers" value={data.postman.total} detail={`${data.postman.paired} connected · ${data.postman.waiting} waiting`} />
        <Stat icon={Ban} label="Suspended IDs" value={a.banned} onClick={() => onGo('suspended')} />
        <Stat
          icon={ImageOff}
          label="GIF calls this hour"
          value={`${data.gif.used} / ${data.gif.limit}`}
          detail={!data.gif.configured ? 'No GIPHY key' : data.gif.unauthorized ? 'Key rejected (unauthorized)' : data.gif.upstreamLimited ? 'GIPHY limit reached' : `${data.gif.cached} searches cached`}
          onClick={() => onGo('controls')}
        />
        <Stat icon={Clock} label="Server uptime" value={duration(data.server.uptimeSeconds)} detail={`Since ${dateTime(data.server.startedAt)}`} />
        <Stat icon={Gauge} label="Memory" value={`${data.server.memoryMb} MB`} detail={`Heap ${data.server.heapMb} MB · load ${data.server.load.join(' / ')} · Node ${data.server.node}`} />
      </div>
      <Card className="mt-4">
        <h2 className="text-[14px] font-semibold">How accounts are kept</h2>
        <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
          Profiles are removed automatically after {a.inactiveDays} days without activity. When a profile is gone, other people's apps delete their chats with it within about a day. Messages and files are never stored on this server, so they can't be read or deleted from here.
        </p>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- profiles

function ProfilesSection({ notify }: { notify: Notify }) {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'active' | 'created' | 'name'>('active');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Account | null>(null);
  const [purgeOpen, setPurgeOpen] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => {
      setQuery(q.trim());
      setPage(0);
    }, 300);
    return () => window.clearTimeout(t);
  }, [q]);
  const path = `/accounts?q=${encodeURIComponent(query)}&sort=${sort}&page=${page}&size=25`;
  const { data, error, loading, reload } = useAdminData<{ items: Account[]; total: number; page: number; size: number }>(path);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      notify(ok);
      await reload();
    } catch (err) {
      notify(adminErrorText(err), 'error');
    }
  };

  const remove = (a: Account, ban: boolean) => {
    const msg = ban
      ? `Delete ${a.name}'s profile and suspend their chat ID? They'll be signed out and can't create the account again.`
      : `Delete ${a.name}'s profile? They'll be signed out. Their contacts' apps will delete chats with them within about a day.`;
    if (!window.confirm(msg)) return;
    void act(() => adminApi(`/accounts/${a.userId}${ban ? '?ban=1' : ''}`, { method: 'DELETE' }), ban ? `Deleted and suspended ${a.name}` : `Deleted ${a.name}`);
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;

  return (
    <>
      <Heading
        title="Profiles"
        sub={data ? `${data.total} profile${data.total === 1 ? '' : 's'}${query ? ` matching "${query}"` : ''}` : 'UR Chat accounts stored in MongoDB'}
        actions={
          <Button variant="danger" size="sm" onClick={() => setPurgeOpen(true)}>
            <Trash2 /> Delete inactive…
          </Button>
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <span className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(ev) => setQ(ev.target.value)}
            placeholder="Search by name, status or chat ID"
            aria-label="Search profiles"
            className="h-9 w-full rounded-md border border-line bg-panel pl-9 pr-3 text-[13.5px] focus:border-accent focus:outline-none"
          />
        </span>
        <select
          value={sort}
          onChange={(ev) => {
            setSort(ev.target.value as typeof sort);
            setPage(0);
          }}
          aria-label="Sort profiles"
          className="h-9 rounded-md border border-line bg-panel px-2 text-[13.5px]"
        >
          <option value="active">Recently active</option>
          <option value="created">Newest</option>
          <option value="name">Name</option>
        </select>
      </div>

      {error ? (
        <ErrorBox error={error} onRetry={() => void reload()} />
      ) : loading && !data ? (
        <Loading />
      ) : (
        <div className="rounded-lg border border-line bg-panel shadow-card">
          {data?.items.length === 0 && <p className="p-8 text-center text-[13.5px] text-muted">No profiles found.</p>}
          <ul className="divide-y divide-line">
            {data?.items.map((a) => (
              <li key={a.userId} className="flex items-center gap-3 px-4 py-3">
                <Avatar avatar={a.avatar} name={a.name} seed={a.userId} size={40} online={a.online} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[14px] font-semibold">{a.name}</span>
                    {a.online && <span className="rounded-full bg-success-soft px-2 py-px text-[11px] font-medium text-success">Online</span>}
                    {a.banned && <span className="rounded-full bg-danger-soft px-2 py-px text-[11px] font-medium text-danger">Suspended</span>}
                  </p>
                  {a.status && <p className="truncate text-[12.5px] text-ink-soft">{a.status}</p>}
                  <p className="mt-0.5 text-[12px] text-muted">
                    <span className="font-mono">{formatUserId(a.userId)}</span> · joined {dateTime(a.createdAt)} · active {ago(a.lastActiveAt)} · auto-removal {dateTime(a.removalAt)}
                  </p>
                </div>
                <Menu
                  label={`Actions for ${a.name}`}
                  trigger={<EllipsisVertical className="size-4" />}
                  items={[
                    { label: 'Edit profile', icon: Pencil, onSelect: () => setEditing(a) },
                    {
                      label: 'Keep active (reset timer)',
                      icon: Clock,
                      onSelect: () => void act(() => adminApi(`/accounts/${a.userId}/keep-alive`, { method: 'POST' }), `${a.name} will be kept for another period`),
                    },
                    {
                      label: 'Clear likes & dislikes',
                      icon: ThumbsDown,
                      onSelect: () =>
                        window.confirm(`Clear all likes and dislikes ${a.name} has received? Everyone's counts for them start again from zero.`) &&
                        void act(() => adminApi(`/accounts/${a.userId}/reset-meter`, { method: 'POST' }), `Likes and dislikes cleared for ${a.name}`),
                    },
                    {
                      label: 'Copy chat ID',
                      icon: Copy,
                      onSelect: () => void navigator.clipboard?.writeText(formatUserId(a.userId)).then(() => notify('Chat ID copied')),
                    },
                    {
                      label: 'Suspend',
                      icon: Ban,
                      hidden: a.banned,
                      onSelect: () => {
                        const reason = window.prompt(`Suspend ${a.name}? They'll be signed out and can't connect. Reason (optional):`, '');
                        if (reason === null) return;
                        void act(() => adminApi('/bans', { method: 'POST', body: { userId: a.userId, reason } }), `Suspended ${a.name}`);
                      },
                    },
                    {
                      label: 'Lift suspension',
                      icon: CircleCheck,
                      hidden: !a.banned,
                      onSelect: () => void act(() => adminApi(`/bans/${a.userId}`, { method: 'DELETE' }), `${a.name} can connect again`),
                    },
                    { label: 'Delete profile', icon: Trash2, danger: true, onSelect: () => remove(a, false) },
                    { label: 'Delete and suspend', icon: UserMinus, danger: true, hidden: a.banned, onSelect: () => remove(a, true) },
                  ]}
                />
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[13px] text-muted">
              <span>
                Page {page + 1} of {pages}
              </span>
              <span className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="secondary" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </span>
            </div>
          )}
        </div>
      )}

      {editing && (
        <EditProfileDialog
          account={editing}
          onClose={() => setEditing(null)}
          onSaved={(name) => {
            setEditing(null);
            notify(`Saved ${name}`);
            void reload();
          }}
        />
      )}
      {purgeOpen && (
        <PurgeDialog
          onClose={() => setPurgeOpen(false)}
          onDone={(n) => {
            setPurgeOpen(false);
            notify(`Deleted ${n} inactive profile${n === 1 ? '' : 's'}`);
            void reload();
          }}
        />
      )}
    </>
  );
}

function EditProfileDialog({ account, onClose, onSaved }: { account: Account; onClose: () => void; onSaved: (name: string) => void }) {
  const [name, setName] = useState(account.name);
  const [status, setStatus] = useState(account.status);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await adminApi(`/accounts/${account.userId}`, { method: 'PATCH', body: { name, status, removeAvatar } });
      onSaved(name.trim());
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };
  return (
    <Modal
      title={`Edit ${account.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy || !name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4 p-5">
        <p className="text-[13px] text-muted">Changes the profile others see when they look this person up. Their own device keeps its copy until they edit their profile.</p>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium">Name</span>
          <input value={name} maxLength={60} onChange={(ev) => setName(ev.target.value)} className="h-10 w-full rounded-md border border-line bg-panel px-3 text-sm focus:border-accent focus:outline-none" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium">Status</span>
          <input value={status} maxLength={140} onChange={(ev) => setStatus(ev.target.value)} className="h-10 w-full rounded-md border border-line bg-panel px-3 text-sm focus:border-accent focus:outline-none" />
        </label>
        {account.avatar && (
          <label className="flex items-center gap-2 text-[13.5px]">
            <input type="checkbox" checked={removeAvatar} onChange={(ev) => setRemoveAvatar(ev.target.checked)} className="size-4" />
            Remove profile picture
          </label>
        )}
        {error != null && <ErrorBox error={error} />}
      </div>
    </Modal>
  );
}

function PurgeDialog({ onClose, onDone }: { onClose: () => void; onDone: (n: number) => void }) {
  const [days, setDays] = useState(3);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!window.confirm(`Delete every profile that hasn't been active for ${days} day${days === 1 ? '' : 's'}? This can't be undone.`)) return;
    setBusy(true);
    try {
      const r = await adminApi<{ deleted: number }>('/accounts/purge-inactive', { method: 'POST', body: { days } });
      onDone(r.deleted);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Delete inactive profiles"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void run()} disabled={busy || !(days >= 1)}>
            <Trash2 /> Delete
          </Button>
        </>
      }
    >
      <div className="space-y-4 p-5">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium">Not active for at least</span>
          <span className="flex items-center gap-2">
            <input type="number" min={1} max={3650} value={days} onChange={(ev) => setDays(Number(ev.target.value))} className="h-10 w-24 rounded-md border border-line bg-panel px-3 text-sm focus:border-accent focus:outline-none" />
            <span className="text-[13.5px] text-muted">days</span>
          </span>
        </label>
        <p className="text-[13px] text-muted">People who are online right now are always active, so they're never included.</p>
        {error != null && <ErrorBox error={error} />}
      </div>
    </Modal>
  );
}

// --------------------------------------------------------------- suspended

function SuspendedSection({ notify }: { notify: Notify }) {
  const { data, error, loading, reload } = useAdminData<{ items: { userId: string; reason: string; name: string | null; at: number | null }[] }>('/bans');
  const [id, setId] = useState('');
  const [reason, setReason] = useState('');
  const suspend = async () => {
    try {
      await adminApi('/bans', { method: 'POST', body: { userId: id, reason } });
      notify('Suspended');
      setId('');
      setReason('');
      void reload();
    } catch (err) {
      notify(adminErrorText(err), 'error');
    }
  };
  return (
    <>
      <Heading title="Suspended chat IDs" sub="A suspended ID is signed out at once and can't connect or create an account again until you lift it." />
      <Card className="mb-4">
        <h2 className="mb-3 text-[14px] font-semibold">Suspend a chat ID</h2>
        <div className="flex flex-wrap gap-2">
          <input value={id} onChange={(ev) => setId(ev.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX" aria-label="Chat ID" className="h-9 w-56 rounded-md border border-line bg-panel px-3 font-mono text-[13.5px] focus:border-accent focus:outline-none" />
          <input value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="Reason (optional)" aria-label="Reason" maxLength={200} className="h-9 min-w-[200px] flex-1 rounded-md border border-line bg-panel px-3 text-[13.5px] focus:border-accent focus:outline-none" />
          <Button size="sm" variant="danger" className="h-9" disabled={!id.trim()} onClick={() => void suspend()}>
            <Ban /> Suspend
          </Button>
        </div>
      </Card>
      {error ? (
        <ErrorBox error={error} onRetry={() => void reload()} />
      ) : loading && !data ? (
        <Loading />
      ) : (
        <div className="rounded-lg border border-line bg-panel shadow-card">
          {data?.items.length === 0 && <p className="p-8 text-center text-[13.5px] text-muted">Nobody is suspended.</p>}
          <ul className="divide-y divide-line">
            {data?.items.map((b) => (
              <li key={b.userId} className="flex items-center gap-3 px-4 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-danger-soft text-danger">
                  <Ban className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold">{b.name ?? 'Unknown'}</p>
                  <p className="text-[12px] text-muted">
                    <span className="font-mono">{formatUserId(b.userId)}</span>
                    {b.at ? ` · ${dateTime(b.at)}` : ''}
                    {b.reason ? ` · ${b.reason}` : ''}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    try {
                      await adminApi(`/bans/${b.userId}`, { method: 'DELETE' });
                      notify('Suspension lifted');
                      void reload();
                    } catch (err) {
                      notify(adminErrorText(err), 'error');
                    }
                  }}
                >
                  Lift
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

// --------------------------------------------------------------- mic rooms

function MicSection({ notify }: { notify: Notify }) {
  const { data, error, loading, reload } = useAdminData<{ rooms: MicRoom[] }>('/mic', 5000);
  const act = async (path: string, body: unknown, ok: string) => {
    try {
      await adminApi(path, { method: 'POST', body });
      notify(ok);
      void reload();
    } catch (err) {
      notify(adminErrorText(err), 'error');
    }
  };
  return (
    <>
      <Heading title="Mic rooms" sub="Live voice rooms and who is in them. Refreshes every 5 seconds. Audio never passes through the server." />
      {error ? (
        <ErrorBox error={error} onRetry={() => void reload()} />
      ) : loading && !data ? (
        <Loading />
      ) : data?.rooms.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-[13.5px] text-muted">No rooms right now.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {data?.rooms.map((r) => (
            <Card key={r.code}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold">{r.name}</span>
                    <span className="rounded bg-surface px-1.5 py-px font-mono text-[12px]">{r.code}</span>
                    <span className="rounded-full bg-surface px-2 py-px text-[11px] text-muted">{r.visibility}</span>
                    {r.hasPassword && <span className="rounded-full bg-surface px-2 py-px text-[11px] text-muted">password</span>}
                    {r.locked && <span className="rounded-full bg-warning-soft px-2 py-px text-[11px] text-warning">locked</span>}
                  </p>
                  {r.description && <p className="mt-0.5 text-[13px] text-ink-soft">{r.description}</p>}
                  <p className="mt-0.5 text-[12px] text-muted">
                    {r.participantCount} / {r.maxParticipants} people · created {ago(r.createdAt)} · {r.expiresAt ? `ends ${dateTime(r.expiresAt)}` : 'no end time'}
                  </p>
                </div>
                <Button variant="danger" size="sm" onClick={() => window.confirm(`Close "${r.name}" for everyone in it?`) && void act(`/mic/${r.code}/close`, {}, `Closed ${r.name}`)}>
                  <X /> Close room
                </Button>
              </div>
              {r.participants.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {r.participants.map((p) => (
                    <li key={p.pid} className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-1.5">
                      <Avatar avatar={p.avatar} name={p.name} seed={p.pid} size={24} />
                      <span className="text-[13px]">{p.name}</span>
                      {p.isHost && <Crown className="size-3.5 text-warning" aria-label="Host" />}
                      {p.muted && <MicOff className="size-3.5 text-muted" aria-label="Muted" />}
                      {p.status !== 'connected' && <span className="text-[11px] text-muted">reconnecting</span>}
                      <button
                        type="button"
                        onClick={() => window.confirm(`Remove ${p.name} from "${r.name}"?`) && void act(`/mic/${r.code}/remove`, { pid: p.pid }, `Removed ${p.name}`)}
                        className="rounded-full p-1 text-muted hover:bg-danger-soft hover:text-danger"
                        aria-label={`Remove ${p.name}`}
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- controls

function useSettings(notify: Notify) {
  const { data, error, loading, reload, setData } = useAdminData<Overview>('/overview');
  const save = async (patch: Partial<Settings>, ok: string) => {
    try {
      const r = await adminApi<{ settings: Settings }>('/settings', { method: 'PUT', body: patch });
      setData((d) => (d ? { ...d, settings: r.settings } : d));
      notify(ok);
    } catch (err) {
      notify(adminErrorText(err), 'error');
    }
  };
  return { data, error, loading, reload, setData, save };
}

function ControlsSection({ notify }: { notify: Notify }) {
  const { data, error, loading, reload, setData, save } = useSettings(notify);
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error} onRetry={() => void reload()} />;
  const s = data.settings;
  const toggle = (key: keyof Omit<Settings, 'announcement'>, label: string) => (v: boolean) => void save({ [key]: v }, `${label} ${v ? 'on' : 'off'}`);
  return (
    <>
      <Heading title="Controls" sub="Switch features on or off for everyone, right away. Saved across restarts when MongoDB is configured." />
      <Card>
        <div className="divide-y divide-line">
          <Switch checked={s.signupsOpen} onChange={toggle('signupsOpen', 'Sign-ups')} label="New UR Chat accounts" description="When off, nobody can create a new account. People who already have one keep using UR Chat." />
          <Switch checked={s.gifsEnabled} onChange={toggle('gifsEnabled', 'GIFs')} label="GIFs and stickers" description="When off, the GIF and sticker tabs say they're switched off. GIFs already sent still show." />
          <Switch checked={s.micCreateEnabled} onChange={toggle('micCreateEnabled', 'New Mic rooms')} label="Creating Mic rooms" description="When off, no new voice rooms can be created. Rooms already open keep working." />
          <Switch checked={s.postmanEnabled} onChange={toggle('postmanEnabled', 'Postman')} label="UR Postman transfers" description="When off, nobody can start a new file transfer. Transfers in progress finish." />
        </div>
      </Card>
      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-semibold">GIF budget</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              {data.gif.used} of {data.gif.limit} GIPHY calls used in the last hour
              {!data.gif.configured ? ' · no API key set' : data.gif.unauthorized ? ' · key rejected (unauthorized)' : data.gif.upstreamLimited ? ' · GIPHY says the limit is reached' : ''}.
            </p>
            <div className="mt-2 h-2 w-64 max-w-full overflow-hidden rounded-full bg-surface">
              <div className="h-full bg-accent" style={{ width: `${Math.min(100, (data.gif.used / data.gif.limit) * 100)}%` }} />
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              try {
                const r = await adminApi<{ gif: Overview['gif'] }>('/gif/reset', { method: 'POST' });
                setData((d) => (d ? { ...d, gif: r.gif } : d));
                notify('GIF budget reset');
              } catch (err) {
                notify(adminErrorText(err), 'error');
              }
            }}
          >
            <RefreshCw /> Reset budget
          </Button>
        </div>
        <p className="mt-3 text-[12.5px] text-muted">Resetting clears this server's count. GIPHY's own limit for the key still applies.</p>
      </Card>
    </>
  );
}

// ------------------------------------------------------------ announcement

const TONES = [
  { id: 'info', label: 'Information', cls: 'border-accent/30 bg-accent-soft text-accent' },
  { id: 'warning', label: 'Warning', cls: 'border-warning/30 bg-warning-soft text-warning' },
  { id: 'success', label: 'Good news', cls: 'border-success/30 bg-success-soft text-success' },
] as const;

function AnnouncementSection({ notify }: { notify: Notify }) {
  const { data, error, loading, reload, save } = useSettings(notify);
  const [text, setText] = useState<string | null>(null);
  const [tone, setTone] = useState<'info' | 'warning' | 'success'>('info');
  const current = data?.settings.announcement ?? null;
  useEffect(() => {
    if (data && text === null) {
      setText(current?.text ?? '');
      setTone(current?.tone ?? 'info');
    }
  }, [data, current, text]);
  if (loading && !data) return <Loading />;
  if (!data) return <ErrorBox error={error} onRetry={() => void reload()} />;
  const value = text ?? '';
  const toneCls = TONES.find((t) => t.id === tone)!.cls;
  return (
    <>
      <Heading title="Announcement" sub="A message shown to every visitor on every page (UR Chat, Mic, Postman and the site), until they dismiss it." />
      <Card>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium">Message</span>
          <textarea
            value={value}
            onChange={(ev) => setText(ev.target.value)}
            maxLength={300}
            rows={3}
            placeholder="e.g. Maintenance tonight from 10 to 10:30 PM. Chats may disconnect briefly."
            className="w-full resize-y rounded-md border border-line bg-panel px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
          <span className="mt-1 block text-right text-[12px] text-muted">{value.length} / 300</span>
        </label>
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Style">
          {TONES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={tone === t.id}
              onClick={() => setTone(t.id)}
              className={`rounded-full border px-3 py-1 text-[13px] ${tone === t.id ? 'border-accent bg-accent text-white' : 'border-line hover:bg-surface'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {value.trim() && (
          <div className="mt-4">
            <p className="mb-1.5 text-[12px] font-medium uppercase tracking-wide text-muted">Preview</p>
            <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[13.5px] ${toneCls}`}>
              <Megaphone className="mt-0.5 size-4 shrink-0" />
              <span className="text-ink">{value.trim()}</span>
            </div>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button disabled={!value.trim()} onClick={() => void save({ announcement: { text: value, tone, updatedAt: 0 } }, 'Announcement published')}>
            <Megaphone /> {current ? 'Update' : 'Publish'}
          </Button>
          {current && (
            <Button
              variant="danger"
              onClick={() => {
                setText('');
                void save({ announcement: null }, 'Announcement removed');
              }}
            >
              <Trash2 /> Remove
            </Button>
          )}
        </div>
        {current && <p className="mt-3 text-[12.5px] text-muted">Live since {dateTime(current.updatedAt)}.</p>}
      </Card>
    </>
  );
}

// -------------------------------------------------------------------- log

function LogSection() {
  const { data, error, loading, reload } = useAdminData<{ items: { at: number; ip: string; action: string }[] }>('/log', 15_000);
  return (
    <>
      <Heading
        title="Activity log"
        sub="Everything done in this console since the server started (newest first)."
        actions={
          <Button variant="secondary" size="sm" onClick={() => void reload()}>
            <RefreshCw /> Refresh
          </Button>
        }
      />
      {error ? (
        <ErrorBox error={error} onRetry={() => void reload()} />
      ) : loading && !data ? (
        <Loading />
      ) : (
        <div className="rounded-lg border border-line bg-panel shadow-card">
          {data?.items.length === 0 && <p className="p-8 text-center text-[13.5px] text-muted">Nothing yet.</p>}
          <ul className="divide-y divide-line">
            {data?.items.map((l, i) => (
              <li key={i} className="flex items-start gap-3 px-4 py-2.5">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted" />
                <span className="flex-1 text-[13.5px]">{l.action}</span>
                <span className="shrink-0 text-right text-[12px] text-muted">
                  {dateTime(l.at)}
                  <br />
                  {l.ip}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

