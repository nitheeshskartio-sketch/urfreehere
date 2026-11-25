import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../ui/Button';
import { useEngine } from '../hooks';
import { LoginCodeBox } from './LoginCode';
import { Modal } from './Modal';

/** Confirms signing out, and makes sure the user has their login code first. */
export function SignOutDialog({ onClose }: { onClose: () => void }) {
  const e = useEngine();
  const code = e.identity?.loginCode;
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Sign out of UR Chat"
      onClose={onClose}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void e.signOut();
            }}
          >
            <LogOut />
            Sign out
          </Button>
        </div>
      }
    >
      <div className="space-y-4 p-4 sm:p-5 text-sm leading-relaxed text-ink-soft">
        <p>
          Signing out removes your chats, photos and documents from this device. They can't be recovered, because they're only stored on your devices. Your account and
          profile stay, so you can sign back in.
        </p>
        {code ? (
          <>
            <p className="font-medium text-ink">Make sure you have your login code. You'll need it to sign back in:</p>
            <LoginCodeBox code={code} name={e.profile?.name ?? ''} />
          </>
        ) : (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-danger">
            This account was created before login codes existed, so it can't be signed back into. Signing out ends it on this device for good.
          </p>
        )}
      </div>
    </Modal>
  );
}
