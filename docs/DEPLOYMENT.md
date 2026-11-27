# Production deployment

The simplest setup is a **single Node.js process** that serves the built frontend and the Socket.IO signaling endpoint from one origin, behind a TLS-terminating reverse proxy.

```
Browser ──HTTPS/WSS──▶ Reverse proxy (Caddy / nginx) ──HTTP──▶ node server/dist/index.js :3001
                                                               ├── /            static client (client/dist)
                                                               ├── /socket.io   signaling
                                                               └── /healthz     health check
(optional) Browser ◀──TURN/TURNS──▶ coturn  (see STUN_TURN.md)
```

HTTPS is required in production. Browsers restrict camera access, the clipboard and wake lock on insecure origins, and a secure page cannot use an insecure WebSocket.

## 1. Build and run

```bash
npm ci
npm run build
NODE_ENV=production TRUST_PROXY=true FORCE_HTTPS=true PORT=3001 npm start
```

Use a process manager (systemd, pm2, or a container runtime) so it restarts on failure. Example systemd unit:

```ini
# /etc/systemd/system/urpostman.service
[Unit]
Description=UrPostman signaling server
After=network.target

[Service]
WorkingDirectory=/opt/urpostman
EnvironmentFile=/opt/urpostman/.env
ExecStart=/usr/bin/node server/dist/index.js
Restart=always
User=urpostman
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

## 2. Docker

A [Dockerfile](../Dockerfile) is included:

```bash
docker build -t urpostman .
docker run -d --name urpostman -p 3001:3001 \
  -e TRUST_PROXY=true -e FORCE_HTTPS=true \
  -e TURN_URLS=... -e TURN_SECRET=... \
  urpostman
```

`VITE_SIGNALING_URL` is read at **build** time. Pass it with `--build-arg VITE_SIGNALING_URL=...` only if the signaling server is on a different origin.

## 3. Reverse proxy

WebSocket upgrades must be forwarded.

**Caddy** (automatic HTTPS):

```caddy
files.example.com {
  encode gzip zstd
  reverse_proxy 127.0.0.1:3001
}
```

**nginx**:

```nginx
server {
  listen 443 ssl http2;
  server_name files.example.com;
  ssl_certificate     /etc/letsencrypt/live/files.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/files.example.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
  }
}
server {
  listen 80;
  server_name files.example.com;
  return 301 https://$host$request_uri;
}
```

Set `TRUST_PROXY=true` only when the proxy is the sole way to reach Node. Otherwise clients can spoof `X-Forwarded-For` to dodge rate limits. Bind Node to `127.0.0.1` with `HOST=127.0.0.1` when the proxy runs on the same machine.

## 4. Hosting the frontend separately (optional)

To serve `client/dist` from a CDN or static host:

1. Build the client with `VITE_SIGNALING_URL=https://signal.example.com npm run build -w client`.
2. Configure the static host to rewrite every path without a file extension to `index.html` (SPA fallback).
3. Run the server with `SERVE_CLIENT=false` and `CORS_ORIGINS=https://files.example.com`.
4. The static host should send the security headers the Node server normally adds (CSP, `X-Frame-Options`, `Referrer-Policy`). Add the signaling origin to the CSP `connect-src`.

## 5. Scaling

Signaling is lightweight. Each room exchanges a few kilobytes, after which the browsers talk directly. One small instance can handle thousands of concurrent rooms.

Rooms and rate-limit counters live **in memory**, so:

- Run **one instance**, or
- For several instances, use sticky sessions and the [Socket.IO Redis adapter](https://socket.io/docs/v4/redis-adapter/) for cross-instance `emit`. You would also need to move `RoomRegistry` and the rate limiters to Redis.

Restarting the server drops rooms still waiting for a receiver (users see an error and can create a new code). Transfers already running continue, because they don't depend on the server.

## 6. Humble data

**Accounts (MongoDB):** set `MONGODB_URI` (and optionally `MONGODB_DB`, `ACCOUNT_INACTIVE_DAYS`) as environment variables or in `.env`. Never commit the connection string. In MongoDB Atlas:

- allow the server's IP address under Network Access
- give the database user `readWrite` on that database

The server creates the `inactive_ttl` index at startup.

**Invites:**

Humble stores **only invitation metadata** on the server: token, short code, group preview, expiry, usage count, and pending join requests. It goes in `CHAT_DATA_FILE`, default `data/chat-invites.json`, so invite links survive restarts. In Docker, mount a volume at `/app/data`. Messages and files are never stored on the server.

## 7. Production checklist

- [ ] Served over HTTPS; `FORCE_HTTPS=true`; HTTP redirects to HTTPS
- [ ] `TRUST_PROXY=true` behind the proxy, and Node not publicly reachable directly
- [ ] TURN configured with `TURN_SECRET` (time-limited credentials), quotas set, egress budget understood ([STUN_TURN.md](STUN_TURN.md))
- [ ] Rate limits reviewed for your audience (users behind one corporate NAT share an IP)
- [ ] `GET /healthz` wired to your uptime monitor
- [ ] Access logs at the proxy don't retain more than you need. Share links contain room codes, which expire after 30 minutes.
- [ ] `MONGODB_URI` set from a secret store (not committed); Atlas network access limited to the server's IP
- [ ] `data/` (Humble invites) on persistent storage and included in backups if invite links must survive server loss
- [ ] Test a transfer between two different networks (e.g. phone on mobile data and laptop on Wi‑Fi), and with `ICE_TRANSPORT_POLICY=relay` once
