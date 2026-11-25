# UR Free Here

A site of free, private browser apps that share one design system. More apps can be added hidden and published later; see [docs/SITE_AND_APPS.md](docs/SITE_AND_APPS.md).

| App | Path | Status | Docs |
| --- | --- | --- | --- |
| **UR Postman**: peer-to-peer file transfer | `/postman` | Listed | below |
| **UR Chat**: peer-to-peer messaging, groups, invites | `/chat` | Listed | [docs/UR_CHAT.md](docs/UR_CHAT.md) |

## UR Postman

Peer-to-peer file transfer in the browser. Files go directly from one device to another over an encrypted WebRTC data channel. The Node.js server only introduces the two devices (signaling) and never receives file data.

- **No uploads, no accounts.** The server sees room codes and WebRTC handshake messages, nothing else.
- **Any size, multiple files.** Chunked transfer with backpressure. Received data streams to disk (Origin Private File System) where supported.
- **Works across networks.** STUN for NAT traversal, with optional TURN relay as a fallback.

```
 Sender browser ──── WebRTC DataChannel (DTLS-encrypted file data) ──── Receiver browser
        │                                                                     │
        └──────── Socket.IO: room create/join, offer/answer/ICE only ─────────┘
                                 Signaling server
```

## Project layout

```
client/                 React + TypeScript + Vite + Tailwind frontend
  src/theme/tokens.css      Universal design tokens for every app
  src/site/, src/ui/        Site shell (header, footer, logo) and shared UI kit
  src/apps/registry.tsx     App list (listed / hidden)
  src/apps/postman/         UR Postman
  src/apps/postman/lib/signaling.ts      Socket.IO signaling client (rooms, resume after reconnect)
  src/apps/postman/lib/peer.ts           WebRTC connection manager (RTCPeerConnection + DataChannel)
  src/apps/postman/lib/transfer/         File transfer: protocol, sender, receiver, storage sinks
  src/apps/postman/hooks/                useSender / useReceiver state machines
server/                 Express + Socket.IO signaling server
  src/rooms.ts              Room registry, expiry, reconnect grace
  src/validate.ts           Code format and signaling message validation
  src/rateLimit.ts          Per-IP and per-socket rate limiting
  src/ice.ts                STUN/TURN config, time-limited TURN credentials
docs/
  STUN_TURN.md              NAT traversal, TURN setup, bandwidth implications
  DEPLOYMENT.md             Production deployment
```

## Local development

Requirements: Node.js 18.18 or newer.

```bash
npm install
cp .env.example .env      # optional, defaults work locally
npm run dev
```

- Frontend: http://localhost:5173 (Vite proxies `/socket.io` to the signaling server). Site home is `/`, UR Postman is `/postman`, and share links look like `/r/K7MPQ2XD`.
- Signaling server: http://localhost:3001

To test on two devices on the same Wi‑Fi, open `http://<your-computer-LAN-IP>:5173` on the phone. Some features need a **secure context** (HTTPS or `localhost`): the clipboard API, QR scanning with the camera, and screen wake lock. Over plain LAN HTTP, the transfer still works and the copy button falls back to a legacy method. For full mobile testing use an HTTPS tunnel, or run Vite with a local certificate.

Useful scripts:

| Command             | What it does                                         |
| ------------------- | ---------------------------------------------------- |
| `npm run dev`       | Server (watch mode) and Vite dev server              |
| `npm run build`     | Builds `client/dist` and `server/dist`               |
| `npm start`         | Runs the built server, which also serves the client  |
| `npm run typecheck` | Type-checks both packages                            |

## How a transfer works

1. **Sender** selects files. The client asks the server to create a room and gets an 8-character code (31-symbol alphabet with ambiguous characters removed; about 8.5 × 10¹¹ combinations) plus a secret seat token.
2. **Receiver** opens `/r/<code>`, scans the QR code or types the code. The server lets exactly one receiver into the room and notifies the sender.
3. The sender creates the `RTCPeerConnection` and an ordered, reliable `RTCDataChannel`. The offer, answer and ICE candidates are relayed by the server after validation.
4. Once the channel opens, the sender sends a **manifest** (names, sizes, types). Nothing else is sent until the receiver presses **Accept**.
5. Files are read in 1 MiB blocks and sent as 64 KiB messages (or smaller if the peer's SCTP limit is lower). Two kinds of backpressure apply:
   - `bufferedAmount` stays under 4 MiB, and sending resumes on `bufferedamountlow` (threshold 1 MiB).
   - At most 16 MiB can be sent but not yet confirmed as written by the receiver. The receiver sends cumulative `ack`s as it stores data.
6. The receiver writes chunks strictly in order to an OPFS file (desktop Chrome/Edge/Firefox), falling back to Blob assembly elsewhere. It checks each file's byte count against the manifest.
7. When every file is stored, the receiver sends `complete`. **Only then** does the sender show success. The room is deleted and both peers close the connection.

Interrupted connections, cancellations from either side, rejections, timeouts (30 s to connect) and storage errors each have their own error state. Temporary OPFS files are deleted when the receiver leaves the page. Files left by crashed tabs are cleaned up on the next visit, coordinated with Web Locks.

## Browser support

The app needs `RTCPeerConnection` and `RTCDataChannel`, which current Chrome, Edge, Firefox and Safari (desktop and iOS) all provide.

| Feature                          | Where                                                          |
| -------------------------------- | -------------------------------------------------------------- |
| Stream-to-disk reception (OPFS)  | Chromium, Firefox ≥ 111; Safari falls back to in-memory Blobs   |
| "Save all to folder"             | Desktop Chromium (File System Access API); others download one by one |
| In-app QR scanning               | Chromium on Android / ChromeOS (`BarcodeDetector`); elsewhere use the camera app, which opens the link |
| Keep screen awake during transfer| Browsers with the Screen Wake Lock API                         |

On iOS, Safari suspends background tabs, so **both pages must stay in the foreground** during a transfer. Very large files received on iOS are held in memory, so device RAM limits them.

## Configuration

All server settings are environment variables. See [.env.example](.env.example) for the full list with comments. The most important ones:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | HTTP + WebSocket port |
| `TRUST_PROXY` | `false` | Use `X-Forwarded-For` / `-Proto` behind a reverse proxy |
| `FORCE_HTTPS` | `false` | Redirect to HTTPS and send HSTS |
| `ROOM_TTL_SECONDS` | `1800` | How long a code waits for a receiver |
| `STUN_URLS` | Google STUN | Comma-separated STUN servers |
| `TURN_URLS`, `TURN_SECRET` | — | Optional TURN relay, see [docs/STUN_TURN.md](docs/STUN_TURN.md) |
| `VITE_SIGNALING_URL` | same origin | Build-time: signaling URL if hosted separately |

## File size limits

| Variable | Default | Applies to |
| --- | --- | --- |
| `VITE_MAX_FILE_SIZE_MB` | 4096 (4 GB) | Any single file |
| `VITE_MAX_TOTAL_SIZE_MB` | 10240 (10 GB) | All files in one transfer |
| `VITE_MAX_FILES` | 500 | Number of files in one transfer |
| `VITE_MAX_IN_MEMORY_MB` | 1024 (1 GB) | Receivers that can't stream to disk (Safari / iOS) |

Set them in the root `.env`. They're read at **build** time, so run `npm run build` again (or restart `npm run dev`) after changing them.

Limits are enforced in two places:

1. **Sender:** files over the limit aren't added, and a notice lists which files were skipped and why.
2. **Receiver:** the receiver checks the offered list against *its own* limits and its free storage before showing **Accept**. A modified sender can't bypass this. If the offer is too large, Accept is hidden and the sender is told "Too large for the receiver" or "Not enough space on the receiver".

The receiver also checks that each file's bytes match the announced size and aborts if a sender sends more than it declared.

## Suspicious file handling

The server never sees file contents, and a browser can't scan files for malware, so **files are not virus-scanned**. Instead, the receiving browser runs checks ([client/src/lib/safety.ts](client/src/apps/postman/lib/safety.ts)) that catch the usual tricks for making a harmful file look harmless.

**Before accepting (from the file list):**

| Check | Example | Level |
| --- | --- | --- |
| Program or installer extensions | `setup.exe`, `run.bat`, `app.apk`, `x.lnk`, `tool.jar` | High |
| Disguised double extensions | `invoice.pdf.exe`, `photo.jpg.js` | High |
| Hidden / direction-override characters | `cv‮fdp.exe` (displays as `cvexe.pdf`) | High |
| Padding to push the real extension out of view | `photo.jpg           .scr` | High |
| Scripts | `build.sh`, `app.js` | Caution |
| Documents with macros or scripts | `.docm`, `.xlsm`, `.html`, `.svg` | Caution |
| Disk images | `.iso`, `.img`, `.dmg` | Caution |

**After receiving (from the first bytes of each file):**

| Check | Example | Level |
| --- | --- | --- |
| Program contents under a harmless name | Windows `MZ`, Linux ELF, macOS Mach-O or `#!` script saved as `.jpg` / `.pdf` / `.txt` | High |
| Web page contents under another name | HTML saved as `.md` | Caution |
| Contents don't match a known type | `.pdf` that is really a PNG | Caution |

**What the user sees:**
- Flagged files are marked in the list with the reason.
- With any high-risk file, **Accept** becomes **Accept anyway**.
- Downloading a high-risk file, or using Download all with one in the set, asks for explicit confirmation.

**Always applied:**
- File names are sanitized: no path separators, control or invisible characters, leading dots, trailing dots or spaces, or Windows reserved names like `CON`.
- MIME types from the sender must be well-formed.
- Downloads are always served as `application/octet-stream`, so the browser saves files and never renders them, which matters for HTML or SVG that could run scripts.
- Browsers add their usual "downloaded from the internet" marking (Mark-of-the-Web on Windows, quarantine on macOS), so the operating system's own protections and antivirus still apply when a file is opened.

These checks reduce risk but **can't prove a file is safe**: a malicious PDF or Office document with a correct extension passes them. The UI tells users to accept files only from devices they trust.

## Security notes

- File contents travel only over the DTLS-encrypted data channel. TURN relays forward encrypted packets they cannot decrypt.
- Room codes come from `crypto.randomInt`. Each room accepts a single receiver, and the server checks a 192-bit seat token when a socket reconnects.
- Join attempts, room creation and socket connections are rate-limited per IP, and signaling messages are rate-limited per socket.
- Every signaling message is validated for structure and size before relaying. Anything unexpected is dropped.
- The server logs no file information (it never sees any) and no room codes.
- Received file names are sanitized (no path separators or control characters) before they are used for downloads.
- The receiver must explicitly accept the offered files before any data is transferred.

## Further reading

- [docs/STUN_TURN.md](docs/STUN_TURN.md): NAT traversal, running coturn, bandwidth and cost implications of relaying
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): production deployment (Docker, reverse proxy, HTTPS, scaling)
