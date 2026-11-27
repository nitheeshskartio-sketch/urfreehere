# Humble

A private messenger that runs in the browser and installs as an app. Chats, photos, documents and voice calls go directly between devices; the server only introduces people, keeps profiles, and forwards data when a direct connection is impossible. Live at `/chat` (every other address opens it), with the admin console at `/admin`.

- **Chats and groups:** signed messages, photos, files, GIFs, locations, reactions, secret and view-once messages, delete for everyone, message requests.
- **Voice calls** in direct and group chats (WebRTC audio rooms, see [docs/MIC.md](docs/MIC.md)).
- **Just for fun:** emoji on profile pictures with a full-screen blast, virtual hugs and slaps, promises, and a like/dislike meter.
- **Privacy:** messages disappear after 3 days, an inactivity lock, one device at a time, no phone number or email.
- **Installable app (PWA)** with notifications while closed (Web Push) and an unread badge on the icon.

Details: [docs/UR_CHAT.md](docs/UR_CHAT.md) (the chat app), [docs/ADMIN.md](docs/ADMIN.md) (admin console), [docs/SITE_AND_APPS.md](docs/SITE_AND_APPS.md) (theme, PWA), [docs/STUN_TURN.md](docs/STUN_TURN.md) (NAT traversal), [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Project layout

```
client/                 React + TypeScript + Vite + Tailwind frontend
  src/theme/tokens.css      Design tokens (colours, radii, fonts)
  src/site/, src/ui/        Logo, name (site/config.ts), coffee popup, announcement, shared UI kit
  src/apps/chat/            Humble: engine, peer connections, server relay, UI
  src/apps/mic/             Voice-room engine and call screen used by chat calls
  src/admin/                Admin console
  public/                   Icons, manifest and service worker (PWA)
server/                 Express + Socket.IO server
  src/chat/                 Accounts (MongoDB), signaling hub, invites, Web Push
  src/mic/                  Voice-room signaling
  src/admin.ts              Admin API
  src/ice.ts                STUN/TURN configuration
```

## Local development

Requirements: Node.js 18.18 or newer.

```bash
npm install
cp .env.example .env      # MongoDB is optional; without it accounts aren't kept
npm run dev
```

- Frontend: http://localhost:5173 (Vite proxies `/socket.io` and `/api` to the server).
- Server: http://localhost:3001

Camera, microphone, notifications and the PWA need a secure context (HTTPS or `localhost`). To test on a phone, use an HTTPS tunnel.

| Command             | What it does                                         |
| ------------------- | ---------------------------------------------------- |
| `npm run dev`       | Server (watch mode) and Vite dev server              |
| `npm run build`     | Builds `client/dist` and `server/dist`               |
| `npm start`         | Runs the built server, which also serves the client  |
| `npm run typecheck` | Type-checks both packages                            |

## Configuration

All server settings are environment variables; see [.env.example](.env.example) for the full list with comments. The main ones: `MONGODB_URI` (accounts), `ADMIN_PASSWORD` (admin console), `GIPHY_API_KEY` (GIFs), `TURN_*` or `CLOUDFLARE_TURN_*` (optional relay for strict networks), `RELAY_MB_PER_HOUR` (built-in server relay budget), `VAPID_*` (optional, push keys are created automatically otherwise).
