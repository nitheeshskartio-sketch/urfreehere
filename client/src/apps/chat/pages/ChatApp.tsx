import { CircleAlert, CircleCheck, Info, LoaderCircle, LockKeyhole, MessagesSquare, UserX, X } from 'lucide-react';
import { Button } from '../../../ui/Button';
import { Avatar } from '../../../ui/avatar/Avatar';
import { LoginCodeDialog } from '../components/LoginCode';
import { useCallback, useEffect, useRef, useState } from 'react';
import { navigate } from '../../../lib/router';
import { AppRail, TopBar } from '../components/AppShell';
import { ChatView } from '../components/ChatView';
import { InviteDialog, JoinDialog, NewChatDialog, NewGroupDialog, ScanDialog } from '../components/Dialogs';
import { InfoPanel } from '../components/InfoPanel';
import { Onboarding } from '../components/Onboarding';
import { SettingsDialog } from '../components/SettingsDialog';
import { SignOutDialog } from '../components/SignOutDialog';
import { Sidebar, type Dialog } from '../components/Sidebar';
import { useEngine, useMediaQuery } from '../hooks';
import { engine } from '../lib/engine';
import { startNotifications } from '../lib/notify';
import type { ScanTarget } from '../../../lib/qr';

let started = false;

// Development builds only: expose the engine for debugging in the browser console.
if (import.meta.env.DEV) (window as unknown as { __urChat: typeof engine }).__urChat = engine;

/** Parses chat routes: /chat, /chat/c/<conv>, /chat/u/<userId>, /join/<token>, /chat/join/<token>. */
function parseRoute(path: string) {
  const conv = path.match(/^\/chat\/c\/([^/]+)$/)?.[1];
  const user = path.match(/^\/chat\/u\/([A-Za-z0-9-]+)$/)?.[1];
  const join = path.match(/^\/(?:chat\/)?join\/([A-Za-z0-9_-]+)$/)?.[1];
  return { conv: conv ? decodeURIComponent(conv) : null, user, join, login: path === '/chat/login' };
}

const convPath = (id: string) => `/chat/c/${encodeURIComponent(id)}`;

export default function ChatApp({ path }: { path: string }) {
  const e = useEngine();
  const route = parseRoute(path);
  const desktop = useMediaQuery('(min-width: 768px)');
  const wide = useMediaQuery('(min-width: 1280px)');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [joinKey, setJoinKey] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [inviteFor, setInviteFor] = useState<string | null>(null);

  useEffect(() => {
    if (!started) {
      started = true;
      void engine.init();
    }
  }, []);

  useEffect(() => {
    document.title = 'UR Chat';
  }, []);

  // Tab badge, desktop notifications and sound for new messages.
  useEffect(() => {
    if (e.status === 'ready') return startNotifications(engine);
  }, [e.status]);

  const open = useCallback((convId: string) => navigate(convPath(convId)), []);

  const cameFromOnboarding = useRef(false);
  if (e.status === 'onboarding') cameFromOnboarding.current = true;

  // Deep links: contact link and group invite link.
  useEffect(() => {
    if (e.status !== 'ready') return;
    if (route.user) {
      const id = route.user.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const conv = engine.startDirectChat(id);
      navigate(conv ? convPath(conv) : '/chat', { replace: true });
    } else if (route.join) {
      setJoinKey(route.join);
      navigate('/chat', { replace: true });
    }
  }, [e.status, route.user, route.join]);

  const routed = route.conv ? e.convs.get(route.conv) : undefined;
  const activeConv = routed && !routed.hidden ? routed : undefined;
  useEffect(() => setInfoOpen(false), [route.conv]);

  const onScan = (t: ScanTarget) => {
    setDialog(null);
    if (t.kind === 'user') {
      const conv = engine.startDirectChat(t.userId);
      if (conv) open(conv);
    } else setJoinKey(t.key);
  };

  if (e.status === 'loading') {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-surface">
        <LoaderCircle className="size-6 animate-spin text-muted" />
      </div>
    );
  }
  if (e.status === 'unsupported' || e.status === 'error') {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-surface p-6">
        <div className="max-w-sm rounded-xl border border-line bg-panel p-6 text-center shadow-card">
          <CircleAlert className="mx-auto size-8 text-danger" />
          <h1 className="mt-3 text-lg font-semibold">{e.status === 'unsupported' ? 'Browser not supported' : "UR Chat couldn't start"}</h1>
          <p className="mt-2 text-sm text-muted">
            {e.status === 'unsupported'
              ? `This browser is missing ${e.unsupportedReason.join(', ')}. Use a recent Chrome, Edge, Firefox or Safari.`
              : 'Local storage could not be opened. Some private browsing modes and full disks cause this.'}
          </p>
        </div>
      </div>
    );
  }
  if (e.status === 'onboarding') return <Onboarding initialStep={route.login ? 'login' : 'welcome'} />;
  // Just signed in or created an account on /chat/login: go to the chats.
  if (route.login && cameFromOnboarding.current) {
    queueMicrotask(() => navigate('/chat', { replace: true }));
    return null;
  }
  if (route.login) return <SignedInNotice onSignOut={() => setDialog('sign-out')} dialog={dialog} onCloseDialog={() => setDialog(null)} />;
  if (e.blocked) {
    const banned = e.blocked === 'banned';
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-surface p-6">
        <div className="max-w-sm rounded-xl border border-line bg-panel p-6 text-center shadow-card" role="alert">
          <span className={`mx-auto flex size-12 items-center justify-center rounded-full ${banned ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'}`}>
            <UserX className="size-6" />
          </span>
          <h1 className="mt-4 text-lg font-semibold">{banned ? 'This account has been suspended' : 'New sign-ups are paused'}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {banned
              ? "The site admin suspended this chat ID, so it can't connect. Your chats are still on this device."
              : "UR Chat isn't accepting new accounts right now. Your profile is saved on this device. Try again later."}
          </p>
          {!banned && (
            <Button className="mt-5 w-full" onClick={() => engine.retryConnection()}>
              Try again
            </Button>
          )}
        </div>
      </div>
    );
  }
  if (e.status === 'signed-out') {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-surface p-6">
        <div className="max-w-sm rounded-xl border border-line bg-panel p-6 text-center shadow-card" role="alert">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-warning-soft text-warning">
            <UserX className="size-6" />
          </span>
          <h1 className="mt-4 text-lg font-semibold">Signed in on another device</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Your login code was used to sign in somewhere else. UR Chat works on one device at a time, so this device was signed out and its chats were removed.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">If that wasn't you, sign in again with your login code right away.</p>
          <Button className="mt-5 w-full" onClick={() => window.location.assign('/chat/login')}>
            Sign in with login code
          </Button>
          <Button variant="ghost" className="mt-2 w-full" onClick={() => window.location.assign('/chat')}>
            Create a new account
          </Button>
        </div>
      </div>
    );
  }
  if (e.status === 'expired') {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-surface p-6">
        <div className="max-w-sm rounded-xl border border-line bg-panel p-6 text-center shadow-card">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-warning-soft text-warning">
            <UserX className="size-6" />
          </span>
          <h1 className="mt-4 text-lg font-semibold">Your account was removed</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {e.removedByAdmin
              ? 'Your account was removed by the site admin. Your chats are still on this device. Reactivate to keep the same chat ID and profile.'
              : 'UR Chat accounts are removed after 7 days without activity. Your chats are still on this device. Reactivate to keep the same chat ID and profile.'}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button onClick={() => engine.reactivate()}>Reactivate my account</Button>
            <Button
              variant="ghost"
              className="text-danger"
              onClick={() => window.confirm('Delete your chats and identity from this device and start over?') && void engine.deleteAllData()}
            >
              Delete everything and start over
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const showList = desktop || !activeConv;
  const showChat = !!activeConv;
  const infoInline = wide && infoOpen && activeConv;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-rail">
      {/* On phones the open conversation uses the whole screen, like the Teams app. */}
      <div className={showChat && !desktop ? 'hidden' : ''}>
        <TopBar query={query} onQuery={setQuery} onProfile={() => setDialog('settings')} />
      </div>
      <div className="flex min-h-0 flex-1">
      <AppRail onSettings={() => setDialog('settings')} />
      <div className="flex min-w-0 flex-1 overflow-hidden bg-canvas md:rounded-tl-lg md:border-l md:border-t md:border-line">
      {showList && (
        <aside className="flex w-full shrink-0 flex-col border-r border-line md:w-[320px] lg:w-[340px]">
          <Sidebar activeId={activeConv?.id ?? null} onOpen={open} onDialog={setDialog} query={query} onQuery={setQuery} />
        </aside>
      )}

      {desktop && !activeConv && (
        <main className="hidden flex-1 flex-col items-center justify-center bg-canvas p-8 text-center md:flex">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-panel text-accent shadow-card">
            <MessagesSquare className="size-8" />
          </span>
          <h1 className="mt-5 text-xl font-semibold tracking-tight">UR Chat</h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">Pick a conversation, or start a new one with someone's chat ID, link or QR code.</p>
          <p className="mt-8 flex items-center gap-2 text-[12.5px] text-muted">
            <LockKeyhole className="size-3.5" />
            Messages go directly between devices and are stored only on them.
          </p>
        </main>
      )}

      {showChat && (
        <main className="min-w-0 flex-1">
          <ChatView
            key={activeConv.id}
            conv={activeConv}
            showBack={!desktop}
            onBack={() => navigate('/chat')}
            onInfo={() => setInfoOpen((o) => !o)}
            onInvite={() => activeConv.groupId && setInviteFor(activeConv.groupId)}
          />
        </main>
      )}

      {infoOpen && activeConv &&
        (infoInline ? (
          <aside className="w-[360px] shrink-0 border-l border-line">
            <InfoPanel conv={activeConv} onClose={() => setInfoOpen(false)} onInvite={() => activeConv.groupId && setInviteFor(activeConv.groupId)} onOpenChat={(id) => { const c = engine.startDirectChat(id); if (c) open(c); }} />
          </aside>
        ) : (
          <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onMouseDown={(ev) => ev.target === ev.currentTarget && setInfoOpen(false)}>
            <aside className="h-full w-full max-w-[400px] shadow-pop">
              <InfoPanel conv={activeConv} onClose={() => setInfoOpen(false)} onInvite={() => activeConv.groupId && setInviteFor(activeConv.groupId)} onOpenChat={(id) => { const c = engine.startDirectChat(id); if (c) open(c); }} />
            </aside>
          </div>
        ))}
      </div>
      </div>

      {dialog === 'new-chat' && <NewChatDialog onClose={() => setDialog(null)} onOpen={open} onScan={() => setDialog('scan')} />}
      {dialog === 'new-group' && <NewGroupDialog onClose={() => setDialog(null)} onOpen={open} />}
      {dialog === 'join' && <JoinDialog onClose={() => setDialog(null)} onOpen={open} />}
      {dialog === 'scan' && <ScanDialog onClose={() => setDialog(null)} onResult={onScan} />}
      {dialog === 'settings' && <SettingsDialog onClose={() => setDialog(null)} onSignOut={() => setDialog('sign-out')} />}
      {dialog === 'sign-out' && <SignOutDialog onClose={() => setDialog(null)} />}
      {joinKey && <JoinDialog initialKey={joinKey} onClose={() => setJoinKey(null)} onOpen={open} />}
      {inviteFor && <InviteDialog groupId={inviteFor} onClose={() => setInviteFor(null)} />}

      {e.showLoginCode && e.identity?.loginCode && (
        <LoginCodeDialog code={e.identity.loginCode} name={e.profile?.name ?? ''} onClose={() => e.dismissLoginCode()} />
      )}
      <Toasts />
    </div>
  );
}

/** /chat/login while already signed in: continue, or sign out to use another account. */
function SignedInNotice({ onSignOut, dialog, onCloseDialog }: { onSignOut: () => void; dialog: Dialog; onCloseDialog: () => void }) {
  const e = useEngine();
  const p = e.profile!;
  return (
    <div className="flex h-[100dvh] items-center justify-center bg-surface p-6">
      <div className="w-full max-w-sm rounded-xl border border-line bg-panel p-6 text-center shadow-card">
        <Avatar avatar={p.avatar} name={p.name} seed={e.me} size={64} className="mx-auto" />
        <h1 className="mt-4 text-lg font-semibold">You're signed in as {p.name}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">To use a different account on this device, sign out first.</p>
        <div className="mt-6 flex flex-col gap-2">
          <Button onClick={() => navigate('/chat', { replace: true })}>Continue to chats</Button>
          <Button variant="ghost" className="text-danger" onClick={onSignOut}>
            Sign out
          </Button>
        </div>
      </div>
      {dialog === 'sign-out' && <SignOutDialog onClose={onCloseDialog} />}
    </div>
  );
}

function Toasts() {
  const e = useEngine();
  if (!e.toasts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {e.toasts.map((t) => {
        const Icon = t.tone === 'error' ? CircleAlert : t.tone === 'success' ? CircleCheck : Info;
        return (
          <div key={t.id} className="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-lg bg-inverse px-3.5 py-2.5 text-sm text-on-inverse shadow-pop">
            <Icon className={`size-4 shrink-0 ${'text-on-inverse/70'}`} />
            <span>{t.text}</span>
            <button type="button" onClick={() => e.dismissToast(t.id)} className="ml-1 rounded p-0.5 text-white/60 hover:text-white" aria-label="Dismiss">
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
