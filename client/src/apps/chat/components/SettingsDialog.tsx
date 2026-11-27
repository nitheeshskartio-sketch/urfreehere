import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../ui/Button';
import { CopyButton } from '../../../ui/CopyButton';
import { useEngine } from '../hooks';
import { setThemePreference, themePreference, useTheme } from '../../../lib/theme';
import { enableDesktopNotifications, notificationPermission } from '../lib/notify';
import { formatUserId } from '../lib/encoding';
import type { AvatarRef } from '../lib/types';
import { Avatar } from '../../../ui/avatar/Avatar';
import { AvatarPicker } from '../../../ui/avatar/AvatarPicker';
import { userLink } from './Dialogs';
import { Field, Modal, inputClass } from '../../../ui/Modal';
import { LoginCodeBox } from './LoginCode';
import { ShareCard } from '../../../ui/ShareCard';

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-[12.5px] leading-relaxed text-muted">{hint}</span>
      </span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative mt-0.5 h-6 w-10 shrink-0 rounded-full bg-line-strong transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-panel after:shadow after:transition-transform peer-checked:bg-accent peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40" />
    </label>
  );
}

/** Segmented choice, Teams-style. */
function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <div className="mt-2 inline-flex flex-wrap rounded-md border border-line bg-surface p-0.5" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={`rounded px-3 py-1.5 text-[13px] font-medium transition-colors ${value === v ? 'bg-accent text-white shadow-card' : 'text-ink-soft hover:bg-subtle'}`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function AppearanceSettings() {
  const e = useEngine();
  useTheme(); // re-render when the theme changes elsewhere
  const pref = themePreference();
  const s = e.settings;
  return (
    <div className="space-y-6 p-4 sm:p-5">
      <Choice
        label="Theme"
        value={pref}
        options={[
          ['light', 'Light'],
          ['dark', 'Dark'],
          ['system', 'Same as device'],
        ]}
        onChange={(v) => setThemePreference(v)}
      />
      <div>
        <Choice
          label="Text size"
          value={s.textSize}
          options={[
            ['xs', 'Extra small'],
            ['sm', 'Small'],
            ['md', 'Medium'],
            ['lg', 'Large'],
            ['xl', 'Extra large'],
          ]}
          onChange={(v) => void e.updateSettings({ textSize: v })}
        />
        {/* Live preview */}
        <div className="mt-3 space-y-1.5 rounded-lg bg-canvas p-3">
          <p className="chat-meta text-muted">
            <span className="font-semibold text-ink-soft">Priya</span> {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: s.clock === 'auto' ? undefined : s.clock === '12h' })}
          </p>
          <div className="chat-bubble chat-text inline-block rounded-md bg-panel px-3 py-2 shadow-card">This is how your messages will look.</div>
          <div className="flex justify-end">
            <div className="chat-bubble chat-text inline-block rounded-md bg-bubble-own px-3 py-2">Looks good 👍</div>
          </div>
        </div>
      </div>
      <Choice
        label="Message spacing"
        value={s.density}
        options={[
          ['comfortable', 'Comfortable'],
          ['compact', 'Compact'],
        ]}
        onChange={(v) => void e.updateSettings({ density: v })}
      />
      <Choice
        label="Time format"
        value={s.clock}
        options={[
          ['auto', 'Automatic'],
          ['12h', '12-hour'],
          ['24h', '24-hour'],
        ]}
        onChange={(v) => void e.updateSettings({ clock: v })}
      />
      <div className="border-t border-line pt-3">
        <Toggle checked={s.enterToSend} onChange={(v) => void e.updateSettings({ enterToSend: v })} label="Press Enter to send" hint="Use Shift + Enter for a new line." />
      </div>
    </div>
  );
}

function NotificationToggles() {
  const e = useEngine();
  const perm = notificationPermission();
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Toggle
        checked={e.settings.desktopNotifications && perm === 'granted'}
        onChange={async (v) => {
          if (!v) return void e.updateSettings({ desktopNotifications: false });
          setBusy(true);
          const r = await enableDesktopNotifications(e);
          setBusy(false);
          if (r === 'denied') e.toast("Notifications are blocked. Allow them in your browser's site settings.", 'error');
        }}
        label="Desktop notifications"
        hint={
          perm === 'unsupported'
            ? 'Not available here: notifications need a secure (HTTPS) page and a supported browser.'
            : perm === 'denied'
              ? "Blocked in this browser. Allow notifications for this site in your browser's settings."
              : busy
                ? 'Waiting for your browser…'
                : 'Show a notification for new messages while Humble is in the background.'
        }
      />
      <Toggle
        checked={e.settings.notificationPreview}
        onChange={(v) => void e.updateSettings({ notificationPreview: v })}
        label="Show message preview"
        hint="Include the message text in notifications."
      />
      <Toggle
        checked={e.settings.notificationSound}
        onChange={(v) => void e.updateSettings({ notificationSound: v })}
        label="Notification sound"
        hint="Play a short sound when a new message arrives."
      />
    </>
  );
}

export function SettingsDialog({ onClose, onSignOut }: { onClose: () => void; onSignOut: () => void }) {
  const e = useEngine();
  const p = e.profile!;
  const [name, setName] = useState(p.name);
  const [status, setStatus] = useState(p.status);
  const [avatar, setAvatar] = useState<AvatarRef>(p.avatar);
  const [tab, setTab] = useState<'profile' | 'appearance' | 'notifications' | 'id' | 'login' | 'privacy'>('profile');
  const dirty = name !== p.name || status !== p.status || avatar !== p.avatar;
  const blocked = [...e.contacts.values()].filter((c) => c.state === 'blocked');

  const save = async () => {
    if (!name.trim()) return;
    await e.updateProfile({ name, status, avatar });
    e.toast('Profile updated', 'success');
  };

  const wipe = () => {
    const typed = window.prompt('This permanently deletes your identity, contacts, chats and files from this device. Type DELETE to confirm.');
    if (typed === 'DELETE') void e.deleteAllData();
  };

  return (
    <Modal title="Settings" onClose={onClose} wide>
      <div className="flex gap-1 overflow-x-auto border-b border-line px-3 pt-2">
        {(
          [
            ['profile', 'Profile'],
            ['appearance', 'Appearance'],
            ['notifications', 'Notifications'],
            ['id', 'Your chat ID'],
            ['login', 'Login code'],
            ['privacy', 'Privacy & data'],
          ] as const
        ).map(([t, l]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${tab === t ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <div className="space-y-5 p-4 sm:p-5">
          <AvatarPicker value={avatar} onChange={setAvatar} name={name} />
          <Field label="Display name">
            <input className={inputClass} value={name} onChange={(ev) => setName(ev.target.value)} maxLength={60} />
          </Field>
          <Field label="Status">
            <input className={inputClass} value={status} onChange={(ev) => setStatus(ev.target.value)} maxLength={140} placeholder="Optional" />
          </Field>
          <div className="flex justify-end">
            <Button onClick={save} disabled={!dirty || !name.trim()}>
              Save profile
            </Button>
          </div>
        </div>
      )}

      {tab === 'appearance' && <AppearanceSettings />}

      {tab === 'notifications' && (
        <div className="p-4 sm:p-5">
          <NotificationToggles />
        </div>
      )}

      {tab === 'id' && (
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <Avatar avatar={p.avatar} name={p.name} seed={e.me} size={48} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{p.name}</p>
              <p className="font-mono text-sm tracking-wider text-ink-soft">{formatUserId(e.me)}</p>
            </div>
            <CopyButton text={e.me} size="sm" />
          </div>
          <p className="text-[13px] leading-relaxed text-muted">
            Share your ID, link or QR code with people you want to chat with. Your ID comes from a key created on this device, so nobody else can use it.
          </p>
          <ShareCard link={userLink(e.me)} qrName="my-ur-chat-qr" shareTitle={`Chat with ${p.name} on Humble`} />
        </div>
      )}

      {tab === 'login' && (
        <div className="space-y-4 p-4 sm:p-5">
          {e.identity?.loginCode ? (
            <>
              <p className="text-sm leading-relaxed text-ink-soft">
                Sign in on another device, or after clearing this browser, with <span className="font-medium">I have a login code</span>. Your profile is restored; chats
                stay on the device where they happened.
              </p>
              <LoginCodeBox code={e.identity.loginCode} name={p.name} />
              <p className="text-[13px] text-muted">Keep it private: anyone with this code can sign in as you. Signing in elsewhere ends the session here.</p>
            </>
          ) : (
            <p className="text-sm leading-relaxed text-muted">
              This account was created before login codes existed, so it doesn't have one and can only be used on this device. To use login codes, delete all data under
              Privacy &amp; data and create a new account.
            </p>
          )}
        </div>
      )}

      {tab === 'login' && (
        <div className="border-t border-line px-4 py-4 sm:px-5">
          <p className="text-[13px] font-medium text-ink-soft">Sign out of this device</p>
          <p className="mt-1 text-[13px] text-muted">Removes your chats from this device. Sign back in any time with your login code.</p>
          <Button variant="danger" size="sm" className="mt-3" onClick={onSignOut}>
            Sign out
          </Button>
        </div>
      )}

      {tab === 'privacy' && (
        <div className="space-y-5 p-4 text-sm sm:p-5">
          <Toggle
            checked={e.settings.idleLock}
            onChange={(v) => void e.updateSettings({ idleLock: v })}
            label="Lock after 20 seconds of inactivity"
            hint="Blurs Humble behind a lock when you're away. Move or tap to continue."
          />
          {e.accountsEnabled && (
            <Toggle
              checked={e.discoverable}
              onChange={(v) => void e.setDiscoverable(v).catch((err: Error) => e.toast(err.message || "Couldn't change this. Try again.", 'error'))}
              label="Show me in “People on Humble”"
              hint="Other members can find your name and picture in New chat and send you a chat request."
            />
          )}
          <div className="space-y-2 leading-relaxed text-ink-soft">
            <p>
              <span className="font-semibold text-ink">How messages travel.</span> Messages, photos, documents and locations go directly between devices over WebRTC
              connections, which are always encrypted (DTLS). Each connection is checked against the other person's chat ID. When a direct path is blocked, the UR Free
              Here server passes them on without storing them; every message is still signed by its sender and checked on arrival.
            </p>
            <p>
              <span className="font-semibold text-ink">Messages disappear after 3 days.</span> Messages, photos and files are removed from every device 3 days after
              they're sent. Emoji, like meters and group members stay.
            </p>
            <p>
              <span className="font-semibold text-ink">What the server stores.</span> Your account: chat ID, public key, name, status, picture and when you were last
              active, and the IDs of your contacts and groups (so a new device can rebuild your chat list). Accounts are deleted automatically after 7 days without activity.
              The server also sees which chat IDs are online, connection handshakes and group invitation details. It never stores messages or files.
            </p>
            <p>
              <span className="font-semibold text-ink">Where chats are stored.</span> Only on this device, in this browser. Clearing site data or deleting it below removes
              them permanently. There is no backup. Your login code restores your account and profile, not your chats.
            </p>
            <p className="text-[12.5px] text-muted">
              Messages are signed by their author and encrypted in transit, but stored unencrypted on each participant's device. Humble does not yet offer separately
              verified end-to-end encryption with key-safety numbers.
            </p>
          </div>

          <div>
            <p className="text-[13px] font-medium text-ink-soft">Blocked contacts</p>
            {blocked.length ? (
              <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
                {blocked.map((c) => (
                  <li key={c.userId} className="flex items-center gap-3 px-3 py-2">
                    <Avatar avatar={e.profileOf(c.userId)?.avatar} name={e.nameOf(c.userId)} seed={c.userId} size={32} ring={e.ringFor(c.userId)} />
                    <span className="min-w-0 flex-1 truncate">{e.nameOf(c.userId)}</span>
                    <Button variant="secondary" size="sm" onClick={() => e.unblockUser(c.userId)}>
                      Unblock
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-muted">Nobody is blocked.</p>
            )}
          </div>

          <div className="rounded-lg border border-danger/20 bg-danger-soft p-4">
            <p className="font-semibold text-danger">Delete all data on this device</p>
            <p className="mt-1 text-[13px] text-ink-soft">Removes your identity, contacts, chats and received files from this browser. This can't be undone.</p>
            <Button variant="danger" className="mt-3" onClick={wipe}>
              <Trash2 />
              Delete everything
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
