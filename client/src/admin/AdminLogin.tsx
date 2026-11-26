import { Eye, EyeOff, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { adminErrorText, adminLogin } from './api';

/** Password form. The password is sent to the server and checked there, never in the browser. */
export function AdminLoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await adminLogin(password);
      setPassword('');
      onSuccess();
    } catch (err) {
      setError(adminErrorText(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(ev) => void submit(ev)} className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
          <ShieldCheck className="size-6" />
        </span>
        <div>
          <p className="text-[15px] font-semibold">Admin console</p>
          <p className="text-[13px] text-muted">Enter the admin password to continue.</p>
        </div>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium">Password</span>
        <span className="relative block">
          <input
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-invalid={!!error}
            className="h-10 w-full rounded-md border border-line bg-panel px-3 pr-10 text-sm focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted hover:text-ink"
            aria-label={show ? 'Hide password' : 'Show password'}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </span>
      </label>
      {error && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={!password || busy}>
        {busy && <LoaderCircle className="animate-spin" />}
        Unlock
      </Button>
    </form>
  );
}

export function AdminLoginDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  return (
    <Modal title="Admin console" onClose={onClose}>
      <div className="p-5">
        <AdminLoginForm onSuccess={onSuccess} />
      </div>
    </Modal>
  );
}
