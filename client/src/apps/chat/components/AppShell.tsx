import { ArrowLeftRight, House, MessageSquare, Mic, Search, Settings, X } from 'lucide-react';
import { useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { AdminLoginDialog } from '../../../admin/AdminLogin';
import { navigate } from '../../../lib/router';
import { Link } from '../../../site/Link';
import { SiteMark } from '../../../site/Logo';
import { Avatar } from '../../../ui/avatar/Avatar';
import { ThemeToggle } from '../../../ui/ThemeToggle';
import { useEngine } from '../hooks';

/** Teams-style title bar: product name, search, theme switch and your profile. */
export function TopBar({ query, onQuery, onProfile }: { query: string; onQuery: (q: string) => void; onProfile: () => void }) {
  const e = useEngine();
  const me = e.profile!;
  // Double-click the logo for the admin console; a single click still goes home.
  const [adminOpen, setAdminOpen] = useState(false);
  const clickTimer = useRef<number>();
  const onLogo = (ev: MouseEvent<HTMLAnchorElement>) => {
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
    ev.preventDefault();
    window.clearTimeout(clickTimer.current);
    if (ev.detail >= 2) return setAdminOpen(true);
    if (ev.detail === 0) return navigate('/'); // keyboard
    clickTimer.current = window.setTimeout(() => navigate('/'), 280);
  };
  const status = e.net === 'online' ? 'Available' : e.net === 'connecting' ? 'Connecting…' : e.net === 'replaced' ? 'Open in another tab' : 'Offline';
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 bg-rail px-3 text-ink">
      {adminOpen && (
        <AdminLoginDialog
          onClose={() => setAdminOpen(false)}
          onSuccess={() => {
            setAdminOpen(false);
            navigate('/admin');
          }}
        />
      )}
      <a href="/" onClick={onLogo} className="flex shrink-0 select-none items-center gap-2 rounded-md md:w-[56px] md:justify-center lg:w-auto" aria-label="UR Free Here home">
        <SiteMark className="size-6" />
        <span className="text-[14px] font-semibold md:hidden lg:inline">UR Chat</span>
      </a>
      <div className="relative mx-auto hidden w-full max-w-[560px] md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(ev) => onQuery(ev.target.value)}
          placeholder="Search chats"
          aria-label="Search chats"
          className="h-8 w-full rounded-md border border-line bg-panel pl-9 pr-8 text-[13px] placeholder:text-muted focus:border-accent focus:outline-none"
        />
        {query && (
          <button type="button" onClick={() => onQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink" aria-label="Clear search">
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1 md:ml-0">
        <ThemeToggle />
        <button type="button" onClick={onProfile} className="rounded-full p-0.5 hover:bg-subtle" aria-label={`Profile and settings (${status})`} title={`${me.name} · ${status}`}>
          <Avatar avatar={me.avatar} name={me.name} seed={e.me} size={30} online={e.net === 'online'} />
        </button>
      </div>
    </header>
  );
}

function RailItem({ href, icon: Icon, label, active, onClick }: { href?: string; icon: typeof House; label: string; active?: boolean; onClick?: () => void }) {
  const inner = (
    <>
      {active && <span className="absolute left-0 top-1/2 h-8 w-[3px] -translate-y-1/2 rounded-r bg-accent" aria-hidden="true" />}
      <Icon className={`size-5 ${active ? 'text-accent' : ''}`} strokeWidth={active ? 2.25 : 1.75} />
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </>
  );
  const cls = `relative flex h-14 w-full flex-col items-center justify-center gap-1 transition-colors ${
    active ? 'text-ink' : 'text-rail-fg hover:bg-subtle/60 hover:text-ink'
  }`;
  return href ? (
    <Link href={href} className={cls} aria-current={active ? 'page' : undefined}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

/** Teams-style left app rail linking the UR Free Here apps. */
export function AppRail({ onSettings }: { onSettings: () => void }) {
  return (
    <nav className="hidden w-[68px] shrink-0 flex-col bg-rail md:flex" aria-label="Apps">
      <RailItem href="/chat" icon={MessageSquare} label="Chat" active />
      <RailItem href="/mic" icon={Mic} label="Mic" />
      <RailItem href="/postman" icon={ArrowLeftRight} label="Postman" />
      <RailItem href="/" icon={House} label="Home" />
      <div className="mt-auto">
        <RailItem icon={Settings} label="Settings" onClick={onSettings} />
      </div>
    </nav>
  );
}

export function Pane({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`min-h-0 overflow-hidden ${className}`}>{children}</div>;
}
