# UR Chat: architecture

UR Chat is a peer-to-peer messenger at `/chat`, listed on the site home page via [client/src/apps/registry.tsx](../client/src/apps/registry.tsx).

**Secure vs. local-network pages:** browsers only provide Web Crypto, geolocation and camera access on HTTPS or `localhost`. On plain-HTTP network addresses (e.g. `http://192.168.1.20:5173` while developing), UR Chat signs and verifies with the audited pure-JS `@noble/curves` and `@noble/hashes` instead. These are loaded only in that case, and the signatures are identical, so both kinds of page talk to each other. **Use my current location** and camera QR scanning stay unavailable there, while entering coordinates or a maps link and scanning a QR code from a photo still work. On an insecure page the private key is stored as raw bytes, not as a non-extractable `CryptoKey`; production must use HTTPS.

```
 Browser A ══════ WebRTC DataChannels (DTLS) ══════ Browser B          messages, receipts, typing,
     ║  ╲                                            ╱  ║              files (own channel per file)
     ║   ╲══════════ Browser C (group member) ══════╱   ║
     │                                                  │
     └──────────── Socket.IO /chat (signaling) ─────────┘              auth, presence, SDP/ICE,
                          Node.js hub                                  invitations, join routing
```

The server is never a message transport. If a direct path is impossible, a TURN relay forwards the encrypted WebRTC packets ([STUN_TURN.md](STUN_TURN.md)). The UI labels such connections "via relay".

## Code map

| Path | Responsibility |
| --- | --- |
| `client/src/apps/chat/lib/identity.ts` | ECDSA P‑256 key pair, user ID derivation, sign/verify |
| `lib/db.ts` | IndexedDB stores: `kv`, `contacts`, `convs`, `events`, `files` |
| `lib/signaling.ts` | Socket.IO client for the `/chat` namespace, invite REST lookup |
| `lib/peer.ts` | One `RTCPeerConnection` per peer; signed DTLS fingerprints; control-message framing |
| `lib/engine.ts` | State, sync protocol, receipts, typing, files, groups, invites |
| `lib/groups.ts` | Group operation log → membership state, permission checks |
| `lib/files.ts` | Chunked file transfer with backpressure and SHA‑256 verification |
| `lib/media.ts` | Allowed file types, size limits, image checks, avatar resizing |
| `components/`, `pages/ChatApp.tsx` | UI |
| `server/src/chat/` | Hub (auth, presence, relay, invites), invite store |

## Identity

- On first use the browser generates a non-extractable ECDSA P‑256 key pair, stored in IndexedDB.
- **User ID** = base32(SHA‑256(`crv:x:y`)[0..10]), 16 characters, shown as `XXXX-XXXX-XXXX-XXXX`. The ID *is* a fingerprint of the public key.
- **Server login:** `auth:hello` (ID + public key, and the server checks that the ID matches the key), then `auth:prove` (signature over a random nonce, plus `mode`: `create`, `login` or `resume`). Only after that can a socket send signals or watch presence.
- **Peer authentication:** each side signs `urfree-chat-dtls|kind|from|to|<DTLS fingerprints>` in its offer or answer. The receiver checks that the key hashes to the expected user ID and that the signature is valid. A signaling server that swapped SDPs to sit in the middle would fail this check.
- There is one identity per browser profile. Clearing site data deletes it, and there is no account recovery.

## Accounts (MongoDB) and login codes

Only **accounts** are stored on the server, in MongoDB collection `chat_accounts`, database `MONGODB_DB`:

```js
{ _id: "<chat ID>", publicKey: { kty, crv, x, y }, name, status, avatar,
  createdAt, updatedAt, lastActiveAt }
```

**Never stored:** messages, chat history, files, contacts, group membership.

- **Removal after 7 days of inactivity.** A TTL index `inactive_ttl` on `lastActiveAt` (`expireAfterSeconds = ACCOUNT_INACTIVE_DAYS × 86400`, default 604,800 s) makes MongoDB delete the document by itself. Its TTL monitor runs about once a minute. `lastActiveAt` is refreshed on login, every 30 minutes while connected, and on disconnect. The index is created, or its expiry updated, when the server starts.
- **Login code.** At sign-up the app creates a secret 25-character code (`XXXXX-XXXXX-XXXXX-XXXXX-XXXXX`: 120 random bits plus a check character). The signing key is derived from it (`SHA-256("urfree-chat-key-v1:" ‖ seed ‖ counter)` → P‑256 private key), so the same code gives the same key pair and chat ID on any device. The code is shown once after sign-up and stays available in **Settings → Login code**. The server never sees it: login still uses the signed-challenge flow below.
- **Login on another device:** choose **I have a login code** and enter it. The server returns the stored profile. Chats are not transferred, and signing in elsewhere ends the session on the previous device.
- **Removed account:** a returning device sees "Your account was removed" and can **Reactivate** it (same ID, profile from the device; local chats stay) or delete everything. Logging in with the code of a removed account leads to "Set up your profile again", keeping the same chat ID.
- **Directory:** signed-in clients can look up chat IDs (`profile:lookup`) to get a name, picture and public key. The key is accepted only if it hashes to the requested ID, so the server can't substitute one. This lets **New chat** reject IDs with no account, and lets admins add contacts to groups without having connected to them first.
- **Without `MONGODB_URI`**, everything works as before, without accounts or login codes. If MongoDB is configured but unreachable, logins are refused with a retry until it's back.
- Accounts created before login codes existed have no code and can't be used on other devices.

## Messages and sync

Every message is a signed **event**:

```ts
{ v: 1, id, conv, author, seq, ts, kind, body, replyTo, sig }
// conv: "dm:<idA>:<idB>" (sorted) or "g:<groupId>"
// kind: text | image | file | location | op (group operation)
// seq: per author, per conversation, 1, 2, 3, …
// sig: ECDSA over canonical JSON of all other fields
```

- **Live delivery:** a new event is pushed to every participant with an open connection.
- **Catch-up:** when two participants connect, each sends `{t:'sync', conv, vector}`, where `vector` is the highest gap-free `seq` per author. The other side sends back everything newer. Catch-up runs in both directions: answering a sync request triggers a sync request back. In groups any member can pass on another member's messages, and signatures stop anyone tampering with them.
- **Offline recipients:** the message stays stored on the sender, marked with a clock icon ("waiting"), and is delivered automatically the next time both are online. Nothing is lost silently, and nothing waits on a server.
- **Receipts:** `delivered` when stored, `read` when the chat is open and visible. Receipts are queued and sent when the author is connected. In groups the ticks turn blue only when all current members have read the message.
- **Typing:** ephemeral `{t:'typing'}`, throttled, expires after about 4.5 s.
- **Delete for me** removes the message content but keeps its sequence number, so catch-up doesn't download it again.

## Groups (small-group mesh)

- **Limit:** 16 participants (`MAX_GROUP_MEMBERS`). Every member connects directly to every other online member. This keeps the design P2P without an SFU, at the cost of O(n²) connections, which is fine at this size.
- **Membership** is an append-only log of signed `op` events (`create`, `add`, `join`, `remove`, `leave`, `update`, `role`, `revoke`, `delete`). `deriveGroup()` replays them in order and applies each one only if it was allowed at that point. Examples: only admins can add, remove, rename or delete; the creator can't be removed; the oldest member is promoted if the last admin leaves.
- **Former members:** their old messages stay valid, but nothing they send afterwards is accepted. Members stop syncing with them.
- **Events from not-yet-known authors** (an op arriving out of order) are held and retried after the next op.

### Invitations

1. An admin signs an invite `{groupId, token, by, expiresAt, maxUses}`. The hub stores it with a short code and a preview (name, picture, description, participant count).
2. The link `https://<host>/join/<token>` opens a preview page, served by the public REST endpoint `GET /api/chat/invites/:tokenOrCode`. The 8-character code and the QR code lead to the same flow.
3. The joiner signs a `join` op that contains the admin-signed invite and sends it with `invite:join`.
4. The hub routes the request to **every online member** of the group. Clients announce their group IDs to the hub; these are random IDs, not names. **Any member, not only admins, can accept.** The accepting member checks the invite signature, that the signer is still an admin, revocation, expiry and group size, then adds the joiner's op to the log and sends them the group.
5. **If no member is online**, the request waits on the hub (up to 7 days) and is delivered to the first member who connects. If the joiner is offline when accepted, their device re-sends the request on reconnect, and an online member adds them again. Usage limits count each person once.
6. **Admins can reset** an invite (revoke it and create a new one) or **revoke** it. Revocation is enforced both by the hub and by members, through a signed `revoke` op.

## Files

- **Images:** JPG, PNG, WebP, up to 25 MB. A blurred 24 px preview travels inside the message.
- **Documents:** PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT, CSV, MD, RTF, ODT/ODS/ODP, ZIP, up to 100 MB.
- **Checks:** both sides check the type by extension, and file names are sanitized. MIME types are derived locally and never taken from the sender. Image bytes must really be JPEG, PNG or WebP, otherwise the file is rejected. Documents are downloaded as `application/octet-stream`, never opened inline.
- **Transfer:** the receiver requests the file (`file-req`). The sender opens a dedicated data channel and streams it as 64 KB chunks with `bufferedAmount` backpressure. The receiver checks the size and the SHA‑256 from the signed message before saving to IndexedDB. If the author is offline, any other participant who has the file can serve it.
- **Auto-download** applies to files up to 25 MB from contacts and group members. Requests from unknown people never auto-download.
- **Cancel and retry** are available while a transfer is running. A stalled transfer (30 s idle) fails over to another peer.

## Location

Location uses only the browser's Geolocation API, and only after the user presses **Use my current location**. It can also take coordinates or a link pasted from any maps app. Messages show the coordinates and accuracy, with **Open in Maps**, which opens Apple Maps on iOS or Google Maps elsewhere via a normal link. No map tiles, API keys or third-party requests are involved.

## Privacy and security summary

| Topic | Behaviour |
| --- | --- |
| Transport | WebRTC DTLS on every connection. TURN relays can't decrypt. |
| Authentication | Server login by signature. Peers verify signed DTLS fingerprints against the user ID. |
| Integrity | Every message and group op is signed by its author and checked on receipt and on catch-up. |
| Server knowledge | Account profiles in MongoDB (deleted after 7 days inactive), online IDs, who signals whom, group IDs a client belongs to, invite metadata. No message content and no files. |
| Storage | Unencrypted IndexedDB on each participant's device. "Delete everything" in Settings wipes it. |
| Unknown senders | Shown under **Message requests**: no read receipts, no auto-downloads, Accept or Block. Blocked IDs can't connect. |
| Rate limits | Connections, invite lookups, joins and invite creation per IP or user; signals per socket. |
| Rendering | Text is rendered as text; only `http(s)` URLs become links (`rel="noopener noreferrer nofollow"`). |

**Not claimed:** UR Chat does not advertise end-to-end encryption. Content is encrypted in transit on every hop and authenticated per author, but it is stored unencrypted on participants' devices, and there are no safety-number verification screens or forward-secret message keys at the application layer. Those would be the next step before such a claim.

**Known limits:** presence is visible to anyone who knows your ID. One active tab per identity (another tab can take over with "Use here"). History lives only on the device that created the identity, with no multi-device sync. Delivery needs both sides online at the same time.

## Testing

The automated end-to-end run used headless Chrome with separate browser profiles, covering:

- profile onboarding with illustrated avatars
- adding a contact by ID, and the message-request flow
- links, replies, typing indicator and read receipts
- a photo, and a PDF whose download matched the original SHA‑256
- location sharing
- offline delivery: the recipient closes the tab, the sender's message waits, and it arrives on return
- a group with a directly added member
- invite link and QR, and joining by link
- **joining by code while the admin is offline and only a regular member is online**
- group messages after joining

`deriveGroup()` was tested with crafted ops: non-admin remove/rename, forged or tampered invites, wrong keys, revocation, and admin changes.

**Not yet tested:** Firefox and Safari, real mobile devices, separate networks, and TURN fallback. Before release, test with `ICE_TRANSPORT_POLICY=relay` (see [STUN_TURN.md](STUN_TURN.md)) and between a phone on mobile data and a laptop on Wi‑Fi.
