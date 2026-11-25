# Mic: peer-to-peer voice rooms

*Your room. Your people. Just talk.*

Mic lives at `/mic` (landing page) and `/room/<code>` (invitation links, the room itself). It's registered with `listed: false` in [client/src/apps/registry.tsx](../client/src/apps/registry.tsx); set `listed: true` to show it on the site.

```
 Browser A ◀════ WebRTC audio (DTLS-SRTP) ════▶ Browser B         mesh: every participant
     ▲   ╲                                     ╱   ▲              connects to every other
     ║    ╲═════════════ Browser C ═══════════╱    ║
     │                                             │
     └──────── Socket.IO /mic (signaling) ─────────┘              rooms, presence, offers/answers/ICE,
                    Node.js (room state in memory)                host controls. Never audio.
```

## Configuration

These environment variables are enforced by the server on every request. The browser reads them from `GET /api/mic/config`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `MIC_GLOBAL_MAX_ROOM_PARTICIPANTS` | 20 | Hard limit for any room (2 to 50). |
| `MIC_DEFAULT_ROOM_PARTICIPANTS` | 6 | Pre-selected limit when creating a room. |
| `MIC_ALLOW_PUBLIC_ROOMS` | false | Let hosts list rooms publicly on `/mic`. |
| `MIC_ALLOW_ROOM_PASSWORD` | true | Allow room passwords (stored hashed with scrypt). |
| `MIC_DEFAULT_ROOM_EXPIRY_MINUTES` | 120 | Pre-selected expiry. Choices: 30 min to 24 h, or none. |
| `MIC_ALLOW_NO_EXPIRY` | true | Allow rooms that stay while the server runs. |
| `MIC_ALLOW_HOST_ROOM_LOCK` | true | Hosts can lock and unlock rooms. |
| `MIC_EMPTY_ROOM_GRACE_SECONDS` | 600 | Close a room this long after the last person leaves. |
| `MIC_PERSISTENT_ROOM_IDLE_DAYS` | 7 | Remove an empty no-expiry room after this long. |
| `MIC_RECONNECT_GRACE_SECONDS` | 30 | Seat kept for a dropped participant (refresh, network blip). |
| `MIC_REMOVAL_BAN_MINUTES` | 10 | Temporary ban after the host removes someone. |
| `MIC_MAX_ROOMS` | 5000 | Rooms the server holds at once. |

The participant-limit selector only offers values up to the global maximum. A client that sends more gets `INVALID_LIMIT`. Joins are checked against the room limit atomically: in testing, 21 simultaneous joins into a 20-person room admitted exactly 20.

## Room lifecycle

**States:** `ACTIVE` → (`FULL` while at capacity) → `LOCKED` when the host locks it → `CLOSED` when the host closes it, or after the empty-room grace → `EXPIRED` at its time limit.

- Room data lives **only in memory**, so a server restart ends all rooms. Codes of ended rooms are remembered for 24 h, so visitors see "expired", "closed" or "no longer valid" rather than "not found".
- **Codes** look like `MIC-8K92PX`: 6 random characters from a 31-symbol alphabet, about 887 million combinations. Joins are rate-limited per IP.
- **Host:** the creator (via a secret host token kept in their browser) is the host. If the host leaves, the longest-present participant becomes host. The creator gets host back when they return.

## Joining

1. **Code** (landing page), **link** (`/room/<code>`) or **QR** (camera scan, or scan from a photo; works over HTTPS).
2. The invitation page shows the room name, description and "3 / 6 people". Locked, full, expired and closed rooms show their own screens.
3. Name and optional picture (upload, illustration, random, or initials) are remembered in this browser.
4. The microphone is requested **only when the user presses Join** with "Join with my microphone on" ticked. If it's denied, the user still joins as a muted listener and sees how to allow it.
5. **Refresh / network loss:** the participant reclaims the same seat with a per-tab rejoin token, with no duplicate card, and the other participants rebuild their audio connections to them.

## Audio

- **Capture:** `getUserMedia` with `echoCancellation`, `noiseSuppression`, `autoGainControl`, mono.
- **Mesh:** one `RTCPeerConnection` per pair, with a single audio transceiver. The participant with the lower ID makes the offer (no glare). The microphone track is swapped with `replaceTrack`, so muting, enabling the mic later or switching devices never renegotiates.
- **Mute:** the outgoing track is disabled, so only silence is sent. Other participants see the muted icon, and muted people are never highlighted.
- **Host "mute":** browsers don't allow controlling someone else's microphone. The host's request makes the participant's own app mute itself and tell them, and their card shows "Muted by host". They can unmute when they need to speak. To enforce silence, remove the participant.
- **Recovery:** on `disconnected` the offerer restarts ICE after 5 s, on `failed` immediately, up to 3 times. After that the link is rebuilt from scratch. Cards show `CONNECTING`, `RECONNECTING` or `DISCONNECTED` until audio really flows.
- **Quality:** every 2 s, from `getStats` (round-trip time and packet loss): good, fair or poor bars per participant. A small server icon marks relayed connections.
- **Output:** a per-participant `<audio>` element with a speaker-device choice (`setSinkId`, Chromium) and a volume slider.

### Speaking detection

Every client analyses the actual audio it handles, using the Web Audio API (`AnalyserNode` RMS level, every 50 ms) on its own microphone and on each received stream. Nobody "reports" that they're speaking. Tuning is in [client/src/apps/mic/lib/audio.ts](../client/src/apps/mic/lib/audio.ts) (`VAD`):

| Setting | Value | Purpose |
| --- | --- | --- |
| `thresholdDb` | −50 dBFS | Louder counts as voice. |
| `attackMs` | 90 ms | Must persist this long before highlighting (ignores clicks). |
| `releaseMs` | 500 ms | Highlight held through short pauses (no flicker). |

All active speakers are highlighted at the same time, with a green ring around the avatar, a green card border and a "Speaking" label.

## Scaling beyond small rooms

Each participant in a mesh uploads their voice once **per other participant** (Opus ≈ 30–40 kbit/s each). At 20 people that's 19 uploads and 19 decodes per device. That's fine on desktops on decent connections, heavy on phones and slow uplinks. Keep `MIC_GLOBAL_MAX_ROOM_PARTICIPANTS` modest (8–10) if many users are on mobile.

For larger rooms, move media to an **SFU** (LiveKit or mediasoup): each participant sends one stream, and the SFU forwards it. The code is organised for that swap:

- Signaling and room rules (`server/src/mic/hub.ts`) stay, plus an endpoint that issues SFU access tokens.
- `client/src/apps/mic/lib/mesh.ts` (`PeerLink`) is the only module that creates peer connections. Replace it with an SFU client that exposes the same `remoteStream` per participant.
- Speaking detection, UI, host controls and capacity checks don't change.

For several server instances, move the in-memory room map to Redis with an atomic capacity check (e.g. a Lua script), and use the Socket.IO Redis adapter.

## Privacy and security

- Audio is never sent to or recorded by the server. WebRTC encrypts it in transit (DTLS-SRTP). TURN relays forward encrypted packets they can't decode. Mic makes no application-level end-to-end claims.
- The server holds room metadata in memory only: name, description, limit, expiry, password hash, and each participant's display name, picture and random device ID (used only for temporary bans).
- Rate limits apply to connections, room creation, joins and preview lookups (per IP), and to signals (per socket). Signals are only relayed between members of the same room, and the server stamps the sender.
- TURN credentials are short-lived (`TURN_SECRET`, see [STUN_TURN.md](STUN_TURN.md)).

## Testing done

The automated tests ran in headless Chrome with fake microphones playing recorded speech-like bursts:

- create → share (code, link, QR) → join by link (mobile) and by code (desktop)
- speaking detected in all 6 directions between 3 people, i.e. audio really received
- mute: shown as muted, never highlighted; unmute resumes
- host mute request; refresh keeps the seat without duplicates
- remove + temporary ban; lock; full room ("This room is currently full. Please try again later.")
- invitation reset invalidates the old link and updates everyone's address; host leaves → host passes on; close room
- microphone denied → clear message and joins as listener (still hears others)
- 8 participants (28 connections) all connected within 4 s, speech detected from everyone, 5 simultaneous speakers highlighted
- server: limits above the global maximum refused; concurrent-join races respect capacity; every host action refused for non-hosts; passwords; no cross-room signals

**Not yet tested:** real microphones and speakers, Firefox and Safari, phones, separate networks, TURN fallback, a full 20-person room on real devices, and room expiry in real time (the logic is the same housekeeping that closes empty rooms).
