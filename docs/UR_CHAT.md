# Humble: architecture

Humble is a peer-to-peer messenger at `/chat`, listed on the site home page via [client/src/apps/registry.tsx](../client/src/apps/registry.tsx).

**Secure vs. local-network pages:** browsers only provide Web Crypto, geolocation and camera access on HTTPS or `localhost`. On plain-HTTP network addresses (e.g. `http://192.168.1.20:5173` while developing), Humble signs and verifies with the audited pure-JS `@noble/curves` and `@noble/hashes` instead. These are loaded only in that case, and the signatures are identical, so both kinds of page talk to each other. **Use my current location** and camera QR scanning stay unavailable there, while entering coordinates or a maps link and scanning a QR code from a photo still work. On an insecure page the private key is stored as raw bytes, not as a non-extractable `CryptoKey`; production must use HTTPS.

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
- **Reactions:** 👍 Like, 👎 Dislike, ❤️ Love, 💔 Broken heart and 🖐️ Slap, from the hover bar (or the message menu on touch screens). Each reaction is a signed `react` event `{target, r}`. The latest one per person wins, so everyone has at most one reaction per message: choosing another replaces it, and choosing the same again (or clicking your chip) removes it (`r: null`). Chips under the message show each reaction with who gave it: small profile pictures and first names ("You & Priya", or "Alex, Priya +2"), the full list on hover, and yours highlighted.
- **Editing:** **Edit** in the menu of your own text message (not view-once) changes it in place; Enter saves, Escape cancels. It's a signed `edit` event `{target, text}`; only the original author's edits count and the latest wins. Everyone sees the new text (also in replies and the chat list) with a small "edited" label.
- **Reactions feed the like meter:** reacting 👍 or 👎 to someone's message also adds one like or dislike to their profile meter (in your direct chat with them, like tapping the buttons in their profile). Removing the reaction doesn't take it back; the meter only grows until the admin clears it.
- **Long messages** are cut to 8 lines with **Show more** / **Show less** (shown only when text is actually cut off; re-checked when the width changes).
- **Emoji picker:** a search box (English keywords, every word must match) and a **Recent** row with the last 24 emoji used on this device.
- Reactions, edits and deletions don't count as unread, don't notify, and don't change the chat preview.
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

## Voice calls

The 📞 button in a direct chat (with a contact) or a group starts a voice call: a private voice room sized for the chat (see [MIC.md](MIC.md)) and a "Voice call" message (`kind: 'voice'`, body `{ code }`). Everyone in the chat sees an "… is calling" prompt and can join from it or from the message, which shows "Ended" once the room is gone. One call runs at a time for the whole app, so moving between chats doesn't hang up; **Back to chat** minimises it to a bar with a leave button. The admin console's **Starting voice calls** switch turns new calls off.

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

- **Tab badge:** a red circle with the unread count is drawn onto the tab icon, and the title becomes `(3) Humble`. While the tab is in the background and a new message arrives, the badge **blinks** and the title alternates with "Priya sent a message" (or "Priya in Product team"). Both stop when you return.
- **Desktop notifications:** sender, group and message preview, one per conversation (newer ones replace older ones). Clicking one opens the conversation. They're only shown while Humble is in the background, and they need permission, asked through the "Get notified" prompt or Settings. They need HTTPS.
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

## Emoji on profile pictures

In a direct chat, each person can pick one emoji for the other: from the smiley button in the chat header or in the contact info. The other person sees it on your profile picture, in the chat header and the chat list, and you see theirs on theirs. Picking it again or **Remove my emoji** clears it.

It's a signed chat event (`kind: 'mood'`, body `{ e: emoji | null }`), sent and synced peer to peer like reactions, so it reaches the other person even if they were offline. The latest one from each person wins. No server or AI is involved.

Picking an emoji plays a full-screen "blast" for you. The other person sees it once, the first time they open the chat after you picked or changed it (`moodSeen` in IndexedDB). Each emoji has its own vibe ([lib/vibes.ts](../client/src/apps/chat/lib/vibes.ts)): hearts rise for ❤️, tears fall for 😢, the screen shakes for 😡, snow drifts for 🥶, 💔 breaks apart, and so on. With "reduce motion" switched on, the emoji only fades in and out.

## Virtual hugs

**Send a virtual hug** (chat menu, or 📎 → Virtual hug) sends a `hug` event. The sender sees a short full-screen hug. The receiver gets an interactive one the first time they open the chat: press and hold the 🤗 to squeeze it, then let go or tap **Hug back** to send one back. The hug stays in the chat as a card; tap it to play it again.

## Virtual slaps

**Send a virtual slap** (chat menu, or 📎 → Virtual slap) sends a `slap` event. The hand swings in with a screen shake, a "SLAP!" burst and a dizzy face. The receiver sees it full-screen the first time they open the chat, can tap the face to feel it again (a hit counter goes up), and can **Slap back**. It stays in the chat as a card that replays it.

## Like meter

Right under a contact's name in their profile there's a like meter: a 👍 and a 👎 button with your counts and a bar between them. Tap either as many times as you want; the other person sees your totals on your profile, and the line below shows what they gave you. The chat header shows, after their name, the likes and dislikes they gave you, and every picture of that contact gets a ring that works as the same meter: green for the share of likes they gave you, red for dislikes (no ring until they've tapped at least once). Quick taps are bundled: the device publishes one signed `meter` event with the new running totals (`{ likes, dislikes }`) about 0.7 s after the last tap, not one per tap. Totals only grow, so the highest values from each person count.

The admin can **Clear likes & dislikes** for a person. The server stores a reset time on their account (`meterResetAt`, part of the public profile) and tells online devices right away (`meter:reset` to the person and everyone watching them); others learn it from the profile on their next directory refresh. Devices then count only what was given after that time: each running total minus the total as of the reset. Nothing is deleted from anyone's device, and what the person gave others is not affected.

## Promises

Type something and choose 📎 → **Ask for a promise** (or right-click Send → Ask as a promise). This sends a `promise` event, and the chat pauses for both people:

- The asked person sees only **No** and **Yes, I promise 🤞** instead of the message box.
- The asker sees "Waiting for … to answer" and can **Take it back**.

The answer is a `promise-reply` event (`yes`, `no`, or `cancel` from the asker); the first valid answer counts. After it, both can chat normally. Yes shows "🤞 … promised" with a 🤝 blast. No and take-back cross the promise out. Direct chats with accepted contacts only.

## Messages disappear after 3 days

Messages, photos, files, hugs, slaps, promises and reactions are removed from every device 3 days after they were sent (`MESSAGE_LIFETIME_MS`). Each chat says so at the top. Emoji, like-meter totals and group membership never expire.

Each device sweeps at start and every 5 minutes, and expires anything older that arrives from a peer straight away. An expired event becomes a content-free tombstone (`local.expired`, body `{}`, its photo or file deleted) that keeps its author and sequence number. Gap-free sync asks the other side for every missing number, so the last sync reply also carries `expired` ranges per author (`{ author: [[from, to], …] }`). The receiver counts those numbers as received and saves them (`expiredSeqs` in IndexedDB), so it never keeps asking for messages that no longer exist anywhere.

## People on Humble (suggestions)

**New chat** lists **People on Humble**: discoverable members you have no chat with yet, most recently active first, searchable by name. **Message** opens a chat, and your first message reaches them as a chat request, as with a chat ID. The server answers `directory:suggest` with public profiles (name, status, picture, public key) from MongoDB, leaving out you, your contacts and suspended accounts. It's rate-limited per user, and each key is checked against its chat ID before it's used.

Everyone is listed by default. **Settings → Privacy & data → Show me in "People on Humble"** turns it off (`discoverable: false` on the account).

## Notifications and the app badge

In the installed app, the unread count shows on the app icon (Badging API: Chrome and Edge on Windows, macOS and ChromeOS, Android, iOS 16.4+ when notifications are allowed; Chrome doesn't support icon badges on Linux) and clears when everything is read. Notifications are shown whenever Humble isn't the focused window: minimised, in another tab, or behind another window. Message notifications go through the service worker when one is running (Android only allows that), with the favicon tab badge and sound as before. Tapping a notification focuses the app and opens that chat (`notificationclick` in `sw.js` posts `{ type: 'open', url }`).

**While the app is closed: Web Push.** With desktop notifications on, the device subscribes to Web Push (`push:subscribe`). The server's VAPID keys come from `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`, or are created once and kept in MongoDB (`site_settings` "vapid"). Subscriptions live in `push_subs` ([server/src/chat/push.ts](../server/src/chat/push.ts)).

- After each burst of messages, the sender's device sends `push:notify` (recipient + chat). The server pushes only if the recipient has no live connection (the app is closed), and only for a chat the sender belongs to: their direct chat, or a group they announced. It's limited to one push per sender, recipient and chat every 20 s, and 60 per sender per hour.
- The push says "Alex: Sent you a message" (or "… in Group"). It carries no message text, because the server never has messages; the message itself arrives when both devices are online.
- The service worker shows the notification unless Humble is open and in front, counts unread pushes on the app icon (`urfree-meta` cache), and resets the count when the app opens. Tapping opens that chat.
- Signing in with the login code on another device, or deleting the account, removes the old subscriptions.
- iPhone and iPad get push only for the installed app (iOS 16.4+). Chrome on Linux shows notifications but no icon badge.

## Inactivity lock

After 20 seconds without activity, Humble blurs behind a lock button. It also locks when you come back to a tab that was hidden for 20 seconds or more. Any mouse movement, tap, key or scroll brings it straight back, exactly where you were. It's a privacy screen, not a password lock. It's on by default, and **Settings → Privacy & data → Lock after 20 seconds of inactivity** turns it off.

## Unsent messages

Messages written while the other person isn't reachable wait on your device ("waiting"). The moment a connection opens, they go out straight away, oldest first, before anything new (`flushOutbox`). If one is still unsent although a later message of yours was already delivered, it would now arrive late and out of order. It's purged instead: removed from your chat and replaced by an empty signed `skip` event with the same sequence number, so the other side's history stays gap-free. A toast says how many were removed.


## Server relay (when a direct connection isn't possible)

Some networks (mobile data, some office or college Wi-Fi) block every direct WebRTC path, and without a TURN server two such people could never connect. If a direct attempt fails (15 s timeout, or ICE "failed"), both devices switch to the **server relay**: the same control messages, sync and file transfers travel as frames over the signaling socket ([lib/relay.ts](../client/src/apps/chat/lib/relay.ts)). The chat header shows "via server".

- The server forwards each frame to the other person's socket, stamped with the authenticated sender, and stores or logs nothing.
- Every chat event is still signed by its author and verified on arrival. With no DTLS handshake, the relay `hello` carries the sender's public key, accepted only if it hashes to their chat ID.
- Frames are at most 48 KB (control messages split at 32 KB, file chunks 16 KB), and a file transfer keeps at most 512 KB in flight. Each user may relay `RELAY_MB_PER_HOUR` (default 200) MB per hour; `0` turns the relay off. The admin overview shows how much was relayed in the last hour.
- A device tries a direct connection again after 30 minutes, or when someone presses **Try again**.

## Privacy and security summary

| Topic | Behaviour |
| --- | --- |
| Transport | WebRTC DTLS on every connection. TURN relays can't decrypt. |
| Authentication | Server login by signature. Peers verify signed DTLS fingerprints against the user ID. |
| Integrity | Every message and group op is signed by its author and checked on receipt and on catch-up. |
| Server knowledge | Account profiles in MongoDB (deleted after 7 days inactive), online IDs, who signals whom, group IDs a client belongs to, invite metadata. No message content and no files are stored. When two people can't connect directly, their frames pass through the server relay without being stored. |
| Storage | Unencrypted IndexedDB on each participant's device. "Delete everything" in Settings wipes it. |
| Unknown senders | Shown under **Message requests**: no read receipts, no auto-downloads, Accept or Block. Blocked IDs can't connect. |
| Rate limits | Connections, invite lookups, joins and invite creation per IP or user; signals per socket. |
| Rendering | Text is rendered as text; only `http(s)` URLs become links (`rel="noopener noreferrer nofollow"`). |

**Not claimed:** Humble does not advertise end-to-end encryption. Content is encrypted in transit on every hop and authenticated per author, but it is stored unencrypted on participants' devices, and there are no safety-number verification screens or forward-secret message keys at the application layer. Those would be the next step before such a claim.

**Known limits:** presence is visible to anyone who knows your ID. One active tab per identity (another tab can take over with "Use here"). Delivery needs both sides online at the same time.

## One device at a time

An account is used on one device (browser profile) at a time. Each browser keeps a random device ID in IndexedDB (tabs share it) and sends it when it signs in.

- **Signing in with the login code** on another device makes that device the account's only device (`deviceId` on the account in MongoDB). If the old device is online it gets `session:replaced` with reason `new-device`. If it was offline, its next sign-in is refused with `DEVICE_REPLACED`. Either way the old device erases its chats, files and identity and shows **Signed in on another device**.
- **Another tab** of the same browser only takes over the connection, as before ("Humble is open in another tab", **Use here**).
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

## Festive decorations

During Christmas (1–26 Dec), New Year (27 Dec – 6 Jan), Onam (Atham to the day after Thiruvonam) and Diwali (Dhanteras to Bhai Dooj), profile pictures get a festive ring and a small ornament, and the top bar gets a thin festive line and a greeting. Nothing else changes. The like/dislike ring takes priority over the festive ring.

- The admin console (Controls → Festive decorations) can pick a festival, follow the calendar (Automatic, the default) or switch them off for everyone.
- Each person can turn them off in Settings → Appearance → Festive decorations.
- Onam and Diwali move each year: their dates are in `client/src/site/season.ts` (2025–2030). Check them each year, or set the festival from the admin console.

## Chat tools

- **In this chat**: while someone has your chat open (app in front), a small green "In this chat" shows next to their status (in groups: "Priya, Raj here"). Sent as a short ping every 15 seconds between contacts; it fades 40 seconds after the last one.
- **Spotlight**: from a message's menu, show it at the top of the chat for 1 hour, 8 hours, 1 day or 3 days. Everyone in the chat sees it; anyone can remove it.
- **Knock knock**: from the chat menu or the + menu in direct chats. The other person's screen gets three knocks (with a soft sound if message sounds are on) and can knock back.
- **Chat background**: per chat, this device only (Chat options → Chat background). Each background is a soft tint or pattern over the theme colour, so bubbles stay readable in light and dark.
- **Chat lock**: lock a chat from its menu with a 4–8 digit PIN (and fingerprint / face where the device supports passkeys). Locked chats show "Locked chat" in the list, are left out of message search, and their notifications say only "New message". They lock again when you leave them, when the idle lock shows, or after 30 seconds in the background. Forgot the PIN: enter your login code to set a new one. Manage it in Settings → Privacy & data. The PIN is stored only as a salted PBKDF2 hash; this hides chats from someone holding your unlocked device, it doesn't encrypt them.
- **Archive**: hide a chat without deleting it; the **Archived** filter chip shows them. A new message brings an archived chat back unless it's muted.
- **Not sent · Retry**: a message of mine that hasn't reached anyone after 20 seconds shows "Not sent" with Retry, which reconnects straight away.
- **Select messages**: from the chat menu or a message's menu: tap messages, then Copy (with names and times when more than one), Forward to other chats, or Delete for me. Secret, view-once, call and gesture messages can't be forwarded; photos and files only if they're on this device.
- **Upload progress**: photos and files I'm sending show "Sending 40%" with a cancel button while someone downloads them. Downloads already showed progress and cancel.
- **Mute until**: mute for 1 hour, 8 hours, 1 day, 1 week, until I unmute, or until a chosen date and time; it unmutes by itself.

## Colour themes

Settings → Appearance → Colour theme: Normal (default), Lavender, Mint, Coffee or Midnight. Each one recolours surfaces, text, lines and the accent, in both light and dark mode. Saved on the device and applied before the page paints.
