# Humble: structure, theme and the installable app

Humble is the whole site: the chat app at `/chat` (every other address opens it) and the admin console at `/admin`. The earlier multi-app site (UR Postman, the standalone Mic pages and the home page) has been removed; Mic's voice rooms now power voice calls inside chats.

```
client/src/
  theme/tokens.css      Design tokens (colours, radii, shadows, fonts, layout)
  ui/                   Shared UI kit: Button, Modal, QRCode, Avatar, InstallButton…
  site/                 Name and tagline (config.ts), the bee logo (Logo.tsx), coffee popup, announcement
  apps/chat/            The Humble app
  apps/mic/             Voice-room engine and call screen
  App.tsx               Routes: /chat (+ /join/…), /admin; everything else redirects to /chat
```

## Universal theme

Every colour, radius, shadow and font comes from `src/theme/tokens.css`. Tailwind maps them to class names (`bg-accent`, `text-muted`, `border-line`, `rounded-xl`, `shadow-card`, `max-w-content`, `h-header`), so:

- **Change the look of the whole site** by editing the token values. Colours are RGB channels (`37 99 235`) so opacity classes like `bg-accent/10` keep working.
- **Use only theme classes** in new code (`text-ink`, `bg-surface`, …), never raw hex colours, so new apps match automatically.
- Use the `page` class for the standard page container (centred, max width, side padding).
- Build screens from the shared `ui/` components first. Put app-specific components inside the app's own folder.

The site name lives in `src/site/config.ts`.

## Adding a new app

1. Create `client/src/apps/<id>/` with its pages, for example `pages/Landing.tsx`.
2. Add an entry to `APPS` in `src/apps/registry.tsx`:
   ```ts
   {
     id: 'notes',
     name: 'UR Notes',
     category: 'Notes',
     tagline: '…',
     description: '…',
     path: '/notes',
     icon: NotesIcon,
     highlights: ['…'],
     steps: ['…'],
     nav: [{ label: 'How it works', href: '/notes#how-it-works' }],
     listed: false, // hidden from the site until ready
   }
   ```
3. Add its routes in `src/App.tsx` (lazy-load the pages so the home page stays small):
   ```ts
   const NotesLanding = lazy(() => import('./apps/notes/pages/Landing'));
   // in resolve():
   if (clean === '/notes') return { app: appById('notes'), title: 'UR Notes', element: <NotesLanding /> };
   ```
4. While `listed: false`, the app is reachable only by typing its URL. It doesn't appear on the home page, in the footer or anywhere else on the site. Set `listed: true` to publish it. The home page switches from the single featured card to a grid automatically.

The server doesn't need changes for new pages. Any URL without a file extension is served the app shell, and the client router decides what to show, including the 404 page.

## Installable app (PWA)

UR Free Here can be installed as an app on phones and computers.

- **Install:** an **Install app** button appears in the site header and in the UR Chat top bar where the browser supports installing (Chrome, Edge, Samsung Internet on Android and desktop). On iPhone and iPad the button explains Safari's **Share → Add to Home Screen**. The button hides once the app is installed or opened as an app.
- **Manifest:** [client/public/manifest.webmanifest](../client/public/manifest.webmanifest). The app opens to UR Chat, with shortcuts to UR Postman and Mic. Icons are in `client/public/icons/`, including a maskable one for Android.
- **Service worker:** [client/public/sw.js](../client/public/sw.js) caches the app itself, not data (chats are already stored on the device). Built files under `/assets/` are cache-first because their names contain hashes. Pages are network-first, but if the network doesn't answer within 3.5 s (offline, or the free server still waking up) the cached app opens. `/api` and `/socket.io` are never touched.
- **Updates:** the build stamps `sw.js` with a build ID (`stampServiceWorker` in `vite.config.ts`), and the server sends `sw.js` and the manifest with `Cache-Control: no-cache`, so every deploy gets a fresh cache and old files are removed.
- The service worker registers only in production builds and needs HTTPS (or `localhost`).
