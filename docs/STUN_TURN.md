# STUN / TURN configuration

WebRTC tries to connect two browsers directly. ICE gathers candidate addresses for each peer and tests pairs of them until one works:

| Candidate type | Where it comes from | Typical case |
| --- | --- | --- |
| `host` | The device's own network interfaces | Both devices on the same Wi‑Fi |
| `srflx` (server-reflexive) | Public address discovered through a **STUN** server | Different networks behind ordinary home or office NATs |
| `relay` | Address allocated on a **TURN** server | Symmetric NAT, carrier-grade NAT, strict corporate firewalls, some mobile networks |

The app shows which path was used: **Direct · same network** (host↔host), **Direct connection** (involves srflx), or **Encrypted relay** (TURN).

## STUN

STUN is cheap. It answers one small request per peer and carries no file data. The default is Google's public STUN servers:

```
STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302
```

Each browser then contacts Google's STUN server, which sees the browser's public IP address. If that's unacceptable, run your own STUN service (coturn provides STUN as well) and point `STUN_URLS` at it.

STUN alone connects most home-to-home and home-to-office cases. Public measurements generally put the share of WebRTC sessions that need a relay between roughly 5% and 20%, and it is higher on mobile carriers and enterprise networks.

## TURN

Without TURN, users on restrictive networks see **"Couldn't connect the devices"**. With TURN configured, those transfers are relayed instead.

### Bandwidth implications (read before enabling)

A relayed transfer passes **every byte of every file through your TURN server, twice**: once inbound from the sender and once outbound to the receiver.

- A 2 GB relayed transfer costs about **2 GB ingress + 2 GB egress** on the TURN host.
- Cloud egress is usually billed: at about $0.05–0.09/GB, 1 TB of relayed files costs about $50–90 in egress alone.
- TURN throughput is limited by the server's NIC and CPU. One small VM can saturate at a few hundred Mbit/s shared across all relayed transfers.
- The data stays end-to-end encrypted (DTLS). The relay forwards encrypted packets and **cannot read file contents**.
- ICE uses TURN only when no direct pair works. Direct transfers never touch it.

Mitigations:

- Use **time-limited credentials** (`TURN_SECRET`, below) so leaked credentials can't be used indefinitely as an open relay.
- Set coturn quotas (`user-quota`, `total-quota`, `max-bps`) and monitor bandwidth.
- Put TURN on a host with generous or unmetered egress.

### Easiest: Cloudflare Realtime TURN (managed)

Without TURN, two people on strict networks (mobile data, some office or college Wi-Fi) can't connect at all. UR Chat then shows "online · can't connect" with **Try again** instead of an endless "connecting…". Cloudflare runs a managed TURN service with a free tier:

1. In the Cloudflare dashboard go to **Realtime → TURN Server → Create**.
2. Copy the **Turn Token ID** and the **API Token** into the server environment:
   ```
   CLOUDFLARE_TURN_KEY_ID=...
   CLOUDFLARE_TURN_API_TOKEN=...
   ```
3. Restart. The log shows `[ice] Cloudflare TURN enabled`.

The server asks Cloudflare for 24-hour credentials (`POST https://rtc.live.cloudflare.com/v1/turn/keys/<id>/credentials/generate-ice-servers`) and refreshes them every 12 hours. The API token never reaches browsers. If a refresh fails, the server keeps using credentials that are still valid and otherwise falls back to the `TURN_*` settings below. When set, it takes priority over them.

### Running coturn

Install (`apt install coturn`, or the `coturn/coturn` Docker image) and use a config like this:

```ini
# /etc/turnserver.conf
listening-port=3478
tls-listening-port=5349
# Public IP of the server (and private IP if behind 1:1 NAT, e.g. AWS):
external-ip=203.0.113.10
# external-ip=203.0.113.10/10.0.0.5

realm=turn.example.com
# REST API style time-limited credentials:
use-auth-secret
static-auth-secret=CHANGE_ME_LONG_RANDOM_SECRET

# TLS (turns:) — lets TURN work through firewalls that only allow 443/5349
cert=/etc/letsencrypt/live/turn.example.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.example.com/privkey.pem

# Relay port range — open these UDP ports in the firewall
min-port=49152
max-port=65535

fingerprint
no-cli
no-multicast-peers
# Never relay to private/internal networks (prevents SSRF-style abuse)
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
# Bandwidth caps (bytes/s per session) — tune to your budget
max-bps=12500000
total-quota=100
user-quota=4
```

Firewall: open TCP+UDP 3478, TCP 5349, and UDP 49152–65535.

### Pointing the app at TURN

```bash
TURN_URLS=turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp,turns:turn.example.com:5349?transport=tcp
TURN_SECRET=CHANGE_ME_LONG_RANDOM_SECRET      # same as coturn static-auth-secret
TURN_CREDENTIAL_TTL_SECONDS=21600             # 6 h
```

Each time a peer creates or joins a room, the server issues credentials following the TURN REST API convention:

```
username   = "<unix-expiry>:<random>"
credential = base64(HMAC-SHA1(TURN_SECRET, username))
```

If your TURN provider uses static credentials instead (some managed services do), set `TURN_USERNAME` and `TURN_CREDENTIAL`. Those credentials are visible to every visitor, so use them only with a provider that enforces its own limits.

### Testing TURN

1. Set `ICE_TRANSPORT_POLICY=relay` and restart the server. This forces every connection through TURN.
2. Run a transfer. The badge should read **Encrypted relay**.
3. If it fails with **"Relay connection failed"**, the browsers could not get an allocation on your TURN server. Check credentials, the realm, firewall ports and the TLS certificate. <https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/> is useful here: paste your TURN URL and a generated username/credential, and you should see `relay` candidates.
4. Set `ICE_TRANSPORT_POLICY=all` again for production.

### How failures are reported

| Situation | Message shown |
| --- | --- |
| ICE failed, no TURN configured | "Couldn't connect the devices" |
| ICE failed, TURN configured but no relay candidate was obtained | "Relay connection failed" |
| ICE failed even with relay candidates | "Couldn't connect the devices" |
| No connection within 30 seconds | Same as above |
