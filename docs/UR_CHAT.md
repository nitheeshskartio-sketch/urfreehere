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
- **Delete for everyone** is offered for 5 seconds after sending (a countdown button in the hover bar and in the message menu). It publishes a signed `delete` event `{target}`. Receivers honour it only if its author wrote the target message and it was created within 5 s (+2 s clock tolerance) of the target. The content and any file are removed, and both sides show "This message was deleted". After 5 seconds only **Delete for me** is available. A revoked message is never passed on in catch-up, and a `delete` that arrives before its target is remembered and applied when the target arrives.
- **Reactions:** ❤️ Love, 💔 Broken heart and 🖐️ Slap, from the hover bar (or the message menu on touch screens). Each reaction is a signed `react` event `{target, r}`. The latest one per person wins, so everyone has at most one reaction per message: choosing another replaces it, and choosing the same again (or clicking your chip) removes it (`r: null`). Chips under the message show the count for each reaction, with yours highlighted. Reactions and deletions don't count as unread, don't notify, and don't change the chat preview.
- **Delete chat** (chat list menu or chat header menu) deletes the chat's history on this device and hides it from the list. For a group you leave it first. A direct chat comes back, with only new messages, when that person messages you again or you start a chat with them. Your personal chat can only be emptied.
- **Removed accounts are purged.** When the account directory (MongoDB) is enabled, the app looks up your contacts when it connects and every 6 hours. If someone's profile is no longer found, the app notes when that started. If it is still missing 24 hours later (so a short database outage can't wipe anything), it deletes your direct chat with them, every message they sent in your groups, and their stored profile and contact entry, on every device that checks. Lookups that fail, or a server without MongoDB, never trigger a purge.

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

## Personal chat "(You)"

Every account has a chat with itself, pinned at the top as "Name (You)", like Teams. Notes, links, photos, documents, GIFs and locations sent there are **stored only on this device**: nothing is sent to peers or to the server, and the chat never notifies. Messages show as read (blue double tick) as soon as they're saved. It's a direct-chat ID with the same user on both sides (`dm:<me>:<me>`), which peers can never write to (direct-chat events require two different participants). Entering your own ID in **New chat** opens it.

## Secret and view-once messages

**Right-click the Send button** (long-press on touch screens) for:

- **Send secretly** (also Ctrl/⌘ + Shift + Enter): the message is masked for everyone, sender included. Text is blurred, and photos, GIFs, files and locations are heavily blurred behind "Secret message · click to view". Clicking reveals it, and **Hide** masks it again. It's masked again every time the chat is reopened.
- **Send as view once:** the receiver sees "View once photo · Click to open". Opening shows it in a full-screen viewer, and **the stored content is deleted at that moment** (a reload can't bring it back). Closing the viewer discards the last copy and leaves an "Opened" card. The sender sees "Not opened yet", then "Opened". Once everyone has opened it, the content is removed from the sender's device too. A view-once message only counts as read when it's opened.
- **Keep using for photos, GIFs & files:** Normal / Secret mode / View once mode applies to everything sent until switched off, and a banner shows the active mode.

Previews, replies, search, notifications, the photo gallery and Shared media only ever show "Secret message" or "View once …". These features protect against casual viewing; they can't stop screenshots, cameras or a modified app.

## Settings

The Settings tabs are Profile, **Appearance**, **Notifications**, Your chat ID, Login code and Privacy & data.

**Appearance:**
- theme (Light, Dark, Same as device)
- text size (Small to Extra large), with a live preview
- message spacing (Comfortable, Compact)
- time format (Automatic, 12-hour, 24-hour)
- Press Enter to send

## Notifications

These work like Teams, for **new messages** only. Muted conversations never notify. Messages older than 2 minutes, for example ones caught up after reconnecting, update the counts but don't pop up or play a sound.

- **Tab badge:** a red circle with the unread count is drawn onto the tab icon, and the title becomes `(3) UR Chat`. While the tab is in the background and a new message arrives, the badge **blinks** and the title alternates with "Priya sent a message" (or "Priya in Product team"). Both stop when you return.
- **Desktop notifications:** sender, group and message preview, one per conversation (newer ones replace older ones). Clicking one opens the conversation. They're only shown while UR Chat is in the background, and they need permission, asked through the "Get notified" prompt or Settings. They need HTTPS.
- **Sound:** a short generated two-tone chime.
- **Settings:** Desktop notifications, Show message preview, and Notification sound.
- Messages aren't marked read, and no read receipts are sent, while the tab is in the background. That happens when you come back.

## GIFs and stickers (GIPHY)

The smiley button in the compose box opens a Teams-style picker with **Emoji**, **GIFs** and **Stickers** tabs.

- **Server proxy:** `GET /api/gif/gifs?q=…` and `/api/gif/stickers?q=…` (empty `q` = trending). The `GIPHY_API_KEY` stays on the server and is never sent to browsers.
- **Budget:** all users share `GIPHY_HOURLY_LIMIT` upstream calls per rolling hour (100 for a beta key). Trending is cached for 15 minutes and searches for an hour, so repeated requests cost nothing. Searches wait for a 500 ms typing pause and need at least 2 characters. There's also a per-IP limit (40 requests per 10 minutes) so one visitor can't use up the budget for everyone.
- **When the limit is reached** (ours or GIPHY's own), the picker shows "GIFs are taking a short break … Try again in about N minutes", and cached results are still served.
- **When GIPHY rejects the key** (401/403), the picker shows that the GIF feature isn't available because the key isn't authorized. The server then stops calling GIPHY for 10 minutes.
- **Messages:** a GIF is sent as a signed `gif` event that holds only GIPHY's image URL and size. Receivers accept only `https://media*.giphy.com/` or `i.giphy.com` URLs, and the browser loads the image from GIPHY. The CSP allows `img-src https://*.giphy.com`. GIPHY therefore sees the viewers' IP addresses, much like any embedded image.
- **Content rating:** `GIPHY_RATING` (default `g`).
- The "Powered by GIPHY" credit and terms link are shown, as GIPHY's terms require.

## Location

Location uses only the browser's Geolocation API, and only after the user presses **Use my current location**. It can also take coordinates or a link pasted from any maps app. Messages show the coordinates and accuracy, with **Open in Maps**, which opens Apple Maps on iOS or Google Maps elsewhere via a normal link. No map tiles, API keys or third-party requests are involved.

## Connection (AI emotional connection)

Direct chats with accepted contacts show **Connection**: an emoji on the person's profile picture (chat header and chat list) for the emotional tone of the conversation, read by an AI model from the words and emoji the two people use. Behind it is one shared score from 0 to 100 with a status, shown in the contact info. Both people see the same result, and it updates as they chat. There is no switch or invite: it is automatic, and the site admin can turn it off for everyone. Code: [server/src/chat/connection.ts](../server/src/chat/connection.ts), [lib/connection.ts](../client/src/apps/chat/lib/connection.ts), [components/Connection.tsx](../client/src/apps/chat/components/Connection.tsx).

| Score | Emoji | Status |
| --- | --- | --- |
| 0–20 | 🥶 | Cold |
| 21–40 | 😐 | Distant |
| 41–60 | 😊 | Friendly |
| 61–80 | 🥰 | Close |
| 81–100 | ❤️ | Deep Connection |

The model also names the current tone (happiness 😍, affection ❤️, caring 🥰, friendship 😊, excitement 🤩, missing 🥺, trust 🤝, neutral 😐, sadness 😔, anger 😡, disconnection 💔). That emoji is the one on the profile picture; hovering it shows the score and status. The contact info explains what is sent.
- **What is sent:** at analysis time, a device sends up to the last 40 text messages of the chat (600 characters each) over the signaling socket. The server labels the two people A and B (no names or chat IDs), sends the text to Claude (`claude-opus-5-5`, low effort, structured output), and drops it. Secret, view-once, deleted and locally cleared messages are never sent. Images, files, GIFs and locations are not sent.
- **Not analysed:** message requests, blocked people, groups and your personal chat.
- **What is kept:** one record per pair in MongoDB `chat_connections` (or in memory): the current score and tone, and when. There is no history, and abandoned pairs expire after 30 days. Deleting an account removes its records.
- **When it runs:** 8 seconds after the conversation goes quiet, once there are at least 6 text messages from both people, then again after at least 3 new ones. Each pair is analysed at most once a minute, with one request in flight, so two devices never cause a double call. The current score is given to the model as the starting point, so it moves gradually. The number of messages doesn't raise the score by itself. With too little context the model says so, and the chat shows "Not enough to go on yet" instead of a score.
- **Limits and switches:** `ANTHROPIC_API_KEY` must be set on the server; without it the feature is hidden. `CONNECTION_AI_HOURLY_LIMIT` (default 200) caps analyses across the server, and each user can trigger 40 per hour. The admin console's **Controls** page can switch it off for everyone and shows usage.
- **Caveat:** the score is an AI estimate of tone, not a measure of anyone's feelings, and the UI says so. A modified client could send made-up text for its own chats. That would only change the score shown to that pair.

## Privacy and security summary

| Topic | Behaviour |
| --- | --- |
| Transport | WebRTC DTLS on every connection. TURN relays can't decrypt. |
| Authentication | Server login by signature. Peers verify signed DTLS fingerprints against the user ID. |
| Integrity | Every message and group op is signed by its author and checked on receipt and on catch-up. |
| Server knowledge | Account profiles in MongoDB (deleted after 7 days inactive), online IDs, who signals whom, group IDs a client belongs to, invite metadata. No message content and no files, except recent text passed through (not stored) for **Connection** in direct chats where both people switched it on. |
| Storage | Unencrypted IndexedDB on each participant's device. "Delete everything" in Settings wipes it. |
| Unknown senders | Shown under **Message requests**: no read receipts, no auto-downloads, Accept or Block. Blocked IDs can't connect. |
| Rate limits | Connections, invite lookups, joins and invite creation per IP or user; signals per socket. |
| Rendering | Text is rendered as text; only `http(s)` URLs become links (`rel="noopener noreferrer nofollow"`). |

**Not claimed:** UR Chat does not advertise end-to-end encryption. Content is encrypted in transit on every hop and authenticated per author, but it is stored unencrypted on participants' devices, and there are no safety-number verification screens or forward-secret message keys at the application layer. Those would be the next step before such a claim.

**Known limits:** presence is visible to anyone who knows your ID. One active tab per identity (another tab can take over with "Use here"). Delivery needs both sides online at the same time.

## One device at a time

An account is used on one device (browser profile) at a time. Each browser keeps a random device ID in IndexedDB (tabs share it) and sends it when it signs in.

- **Signing in with the login code** on another device makes that device the account's only device (`deviceId` on the account in MongoDB). If the old device is online it gets `session:replaced` with reason `new-device`. If it was offline, its next sign-in is refused with `DEVICE_REPLACED`. Either way the old device erases its chats, files and identity and shows **Signed in on another device**.
- **Another tab** of the same browser only takes over the connection, as before ("UR Chat is open in another tab", **Use here**).
- **The new device starts fresh.** The server keeps each account's chat list: contact IDs (and who is blocked), and group IDs with their member IDs, sent by the device as `account:links` whenever it changes. It never holds messages. After a code sign-in the new device rebuilds the direct chats and fetches each group's signed member log from its members. Messages from before the sign-in stay hidden (`historyStart`), even though peers sync them for the gap-free sequence check, so the new device shows no old messages, unread counts or notifications.
- Accounts created before device tracking adopt the first device that resumes.

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
