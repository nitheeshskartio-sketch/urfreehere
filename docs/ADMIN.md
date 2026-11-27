# Admin console

Open it by **double-clicking the Humble logo** (top-left of Humble) or by going to `/admin`. A single click on the logo still goes to the chat page.

## Password and sessions

- The password is set in the server environment: `ADMIN_PASSWORD` (in `.env` locally, and in Render's Environment settings in production). If it's empty, the console is switched off.
- The password is never in the browser code. The server compares it (constant-time) and returns a random session token. The browser keeps the token in `sessionStorage`, so closing the tab signs out.
- A session ends after 2 hours without use, 12 hours at most, when you click **Lock**, or when the server restarts.
- Wrong passwords are limited to 8 tries per 15 minutes per IP. Every action is written to the activity log and the server log.

## Sections

| Section | What you can do |
| --- | --- |
| Overview | Live counts (refreshes every 10 s): chat users online, profiles (new today/this week, active today), voice calls and people in them, suspended IDs, GIF calls this hour, uptime, memory, load. |
| Profiles | Search by name, status or chat ID, sort, and page through Humble accounts. Per profile: **Edit profile** (name, status, remove picture), **Keep active** (resets the 7-day removal timer), **Clear likes & dislikes** (everything the person has received starts again from zero), **Copy chat ID**, **Suspend** / **Lift suspension**, **Delete profile**, **Delete and suspend**. **Delete inactive…** removes every profile not active for N days. |
| Suspended | Suspend any chat ID (with a reason) and lift suspensions. A suspended ID is signed out at once and sees "This account has been suspended". It can't connect or create the account again. |
| Voice calls | Every call going on in chats with its participants. **Close room** for everyone, or remove one person. |
| Controls | On/off switches, applied immediately: new Humble accounts, GIFs and stickers, starting voice calls. GIF budget with **Reset budget**. |
| Announcement | A message (Information, Warning or Good news) shown on every page until each visitor dismisses it. |
| Activity log | Everything done in the console since the server started, with time and IP. |

Deleting a profile signs that person out ("Your account was removed by the site admin"). Their contacts' apps then delete chats with them within about a day (see the Humble purge rules). Message content and files never reach the server, so the console can't read or delete them.

Switches, the announcement and suspensions are saved in MongoDB (`site_settings`, `chat_bans`) and restored when the server starts. Without MongoDB they last until the server restarts, and the Profiles section is unavailable.

## API

All under `/api/admin`, with `Authorization: Bearer <token>`, except `POST /login` and the public `GET /api/site` (announcement and switches).
