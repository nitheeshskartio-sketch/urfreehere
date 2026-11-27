import { Suspense, lazy, useEffect } from 'react';
import { navigate, usePath } from './lib/router';
import { SITE } from './site/config';
import { CoffeeFab } from './site/coffee/CoffeeFab';
import { AnnouncementBanner } from './site/Announcement';

const ChatApp = lazy(() => import('./apps/chat/pages/ChatApp'));
const AdminPage = lazy(() => import('./admin/AdminPage'));

/** Humble is the whole site: the chat app, plus the admin console. */
function isChatPath(p: string) {
  return p === '/chat' || p.startsWith('/chat/') || p.startsWith('/join/');
}

export default function App() {
  const path = usePath();
  const clean = path.replace(/\/+$/, '') || '/';
  const admin = clean === '/admin';
  const chat = isChatPath(clean);

  // Everything else (the old home page, Postman and Mic links) opens the chat.
  useEffect(() => {
    if (!admin && !chat) navigate('/chat', { replace: true });
  }, [admin, chat]);

  useEffect(() => {
    document.title = admin ? `Admin console · ${SITE.name}` : SITE.name;
  }, [admin]);

  if (admin) {
    return (
      <Suspense fallback={<div className="h-[100dvh] bg-surface" />}>
        <AdminPage />
      </Suspense>
    );
  }
  if (!chat) return <div className="h-[100dvh] bg-surface" />;
  return (
    <>
      <Suspense fallback={<div className="h-[100dvh] bg-surface" />}>
        <ChatApp path={clean} />
      </Suspense>
      {/* Lifted above the compose box so it never covers it. */}
      <CoffeeFab offset="chat" />
      <AnnouncementBanner />
    </>
  );
}
