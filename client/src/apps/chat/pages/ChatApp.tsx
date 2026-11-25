import { CircleAlert, CircleCheck, Info, LoaderCircle, LockKeyhole, MessagesSquare, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { navigate } from '../../../lib/router';
import { ChatView } from '../components/ChatView';
import { InviteDialog, JoinDialog, NewChatDialog, NewGroupDialog, ScanDialog } from '../components/Dialogs';
import { InfoPanel } from '../components/InfoPanel';
import { Onboarding } from '../components/Onboarding';
import { SettingsDialog } from '../components/SettingsDialog';
import { Sidebar, type Dialog } from '../components/Sidebar';
import { useEngine, useMediaQuery } from '../hooks';
import { engine } from '../lib/engine';
import type { ScanTarget } from '../lib/qr';

let started = false;

/** Parses chat routes: /chat, /chat/c/<conv>, /chat/u/<userId>, /join/<token>, /chat/join/<token>. */
function parseRoute(path: string) {
  const conv = path.match(/^\/chat\/c\/([^/]+)$/)?.[1];
  const user = path.match(/^\/chat\/u\/([A-Za-z0-9-]+)$/)?.[1];
  const join = path.match(/^\/(?:chat\/)?join\/([A-Za-z0-9_-]+)$/)?.[1];
  return { conv: conv ? decodeURIComponent(conv) : null, user, join };
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

  const open = useCallback((convId: string) => navigate(convPath(convId)), []);

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

  const activeConv = route.conv ? e.convs.get(route.conv) : undefined;
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
        <div className="max-w-sm rounded-xl border border-line bg-white p-6 text-center shadow-card">
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
  if (e.status === 'onboarding') return <Onboarding />;

  const showList = desktop || !activeConv;
  const showChat = !!activeConv;
  const infoInline = wide && infoOpen && activeConv;

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-white">
      {showList && (
        <aside className="flex w-full shrink-0 flex-col border-r border-line md:w-[340px] lg:w-[380px]">
          <Sidebar activeId={activeConv?.id ?? null} onOpen={open} onDialog={setDialog} />
        </aside>
      )}

      {desktop && !activeConv && (
        <main className="hidden flex-1 flex-col items-center justify-center bg-[#F4F6FA] p-8 text-center md:flex">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-white text-accent shadow-card">
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
          <div className="fixed inset-0 z-40 flex justify-end bg-ink/30" onMouseDown={(ev) => ev.target === ev.currentTarget && setInfoOpen(false)}>
            <aside className="h-full w-full max-w-[400px] shadow-pop">
              <InfoPanel conv={activeConv} onClose={() => setInfoOpen(false)} onInvite={() => activeConv.groupId && setInviteFor(activeConv.groupId)} onOpenChat={(id) => { const c = engine.startDirectChat(id); if (c) open(c); }} />
            </aside>
          </div>
        ))}

      {dialog === 'new-chat' && <NewChatDialog onClose={() => setDialog(null)} onOpen={open} onScan={() => setDialog('scan')} />}
      {dialog === 'new-group' && <NewGroupDialog onClose={() => setDialog(null)} onOpen={open} />}
      {dialog === 'join' && <JoinDialog onClose={() => setDialog(null)} onOpen={open} />}
      {dialog === 'scan' && <ScanDialog onClose={() => setDialog(null)} onResult={onScan} />}
      {dialog === 'settings' && <SettingsDialog onClose={() => setDialog(null)} />}
      {joinKey && <JoinDialog initialKey={joinKey} onClose={() => setJoinKey(null)} onOpen={open} />}
      {inviteFor && <InviteDialog groupId={inviteFor} onClose={() => setInviteFor(null)} />}

      <Toasts />
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
          <div key={t.id} className="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-lg bg-ink px-3.5 py-2.5 text-sm text-white shadow-pop">
            <Icon className={`size-4 shrink-0 ${t.tone === 'error' ? 'text-red-300' : t.tone === 'success' ? 'text-green-300' : 'text-slate-300'}`} />
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
