import { Suspense, lazy, useEffect } from 'react';
import { appById, type AppDefinition } from './apps/registry';
import { navigate, usePath } from './lib/router';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import { SITE } from './site/config';
import { SiteFooter } from './site/SiteFooter';
import { SiteHeader } from './site/SiteHeader';
import { CoffeeFab } from './site/coffee/CoffeeFab';
import { AnnouncementBanner } from './site/Announcement';

// Apps are code-split so the home page stays small.
const PostmanLanding = lazy(() => import('./apps/postman/pages/Landing'));
const PostmanSend = lazy(() => import('./apps/postman/pages/Send'));
const PostmanReceive = lazy(() => import('./apps/postman/pages/Receive'));
const ChatApp = lazy(() => import('./apps/chat/pages/ChatApp'));
const MicLanding = lazy(() => import('./apps/mic/pages/Landing'));
const MicRoom = lazy(() => import('./apps/mic/pages/RoomPage'));
const AdminPage = lazy(() => import('./admin/AdminPage'));

interface Route {
  app?: AppDefinition;
  title: string;
  element: JSX.Element;
  /** App-style screen without the site header and footer. */
  fullscreen?: boolean;
  /** Admin console: no coffee button or announcement. */
  admin?: boolean;
}

/** Old URLs from before the site had several apps. */
const REDIRECTS: Record<string, string> = { '/send': '/postman/send', '/receive': '/postman/receive' };

function resolve(path: string): Route {
  const clean = path.replace(/\/+$/, '') || '/';
  const postman = appById('postman');

  if (clean === '/') return { title: `${SITE.name} — ${SITE.tagline}`, element: <Home /> };
  if (clean === '/postman') return { app: postman, title: `${postman.name} — Transfer files directly`, element: <PostmanLanding /> };
  if (clean === '/postman/send') return { app: postman, title: `Send files · ${postman.name}`, element: <PostmanSend /> };
  if (clean === '/postman/receive') return { app: postman, title: `Receive files · ${postman.name}`, element: <PostmanReceive /> };

  // Mic: landing page in the site shell, rooms full-screen.
  if (clean === '/mic') return { app: appById('mic'), title: 'Mic — Your room. Your people. Just talk.', element: <MicLanding /> };
  const micRoom = clean.match(/^\/room\/([A-Za-z0-9-]+)$/)?.[1];
  if (micRoom) return { app: appById('mic'), title: 'Mic', element: <MicRoom code={micRoom} key={micRoom} />, fullscreen: true };

  // UR Chat: full-screen messaging app, contact links and group invite links (/join/<token>).
  if (clean === '/chat' || clean.startsWith('/chat/') || clean.startsWith('/join/')) {
    return { app: appById('chat'), title: 'UR Chat', element: <ChatApp path={clean} />, fullscreen: true };
  }

  if (clean === '/admin') return { title: `Admin console · ${SITE.name}`, element: <AdminPage />, fullscreen: true, admin: true };

  // Short share links for UR Postman: /r/K7MPQ2XD
  const code = clean.match(/^\/r\/([A-Za-z0-9-]+)$/)?.[1];
  if (code) return { app: postman, title: `Receive files · ${postman.name}`, element: <PostmanReceive linkCode={code} key={code} /> };

  return { title: `Page not found · ${SITE.name}`, element: <NotFound /> };
}

export default function App() {
  const path = usePath();
  const redirect = REDIRECTS[path];

  useEffect(() => {
    if (redirect) navigate(redirect, { replace: true });
  }, [redirect]);

  const route = resolve(redirect ?? path);

  useEffect(() => {
    document.title = route.title;
  }, [route.title]);

  if (route.fullscreen) {
    return (
      <>
        <Suspense fallback={<div className="h-[100dvh] bg-surface" />}>{route.element}</Suspense>
        {!route.admin && (
          <>
            {/* Lifted above the chat compose box / Mic controls so it never covers them. */}
            <CoffeeFab offset={route.app?.id === 'mic' ? 'room' : 'chat'} />
            <AnnouncementBanner />
          </>
        )}
      </>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <SiteHeader app={route.app} />
      <main className="flex-1">
        <Suspense fallback={<div className="h-64" />}>{route.element}</Suspense>
      </main>
      <SiteFooter />
      <CoffeeFab />
      <AnnouncementBanner />
    </div>
  );
}
