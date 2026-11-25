import { ArrowRight, KeyRound, MessagesSquare, ShieldCheck, Smartphone } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from '../../../site/Link';
import { SiteMark } from '../../../site/Logo';
import { Button } from '../../../ui/Button';
import { engine } from '../lib/engine';
import type { AvatarRef } from '../lib/types';
import { AvatarPicker } from './AvatarPicker';
import { Field, inputClass } from './Modal';

export function Onboarding() {
  const [step, setStep] = useState<'welcome' | 'profile'>('welcome');
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  const [avatar, setAvatar] = useState<AvatarRef>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Enter a display name.');
    setBusy(true);
    try {
      await engine.createProfile({ name, status, avatar });
    } catch {
      setError("Couldn't create your profile. Check that this browser allows site storage.");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-surface">
      <header className="flex h-14 items-center justify-between border-b border-line bg-white px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 rounded-md">
          <SiteMark className="size-7" />
          <span className="text-[15px] font-semibold tracking-tight">UR Chat</span>
        </Link>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center sm:py-12">
        {step === 'welcome' ? (
          <div className="w-full max-w-[460px] rounded-xl border border-line bg-white p-6 shadow-card sm:p-8">
            <span className="flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <MessagesSquare className="size-6" />
            </span>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight">Chat directly, device to device</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              Messages, photos and documents go straight between devices over encrypted peer-to-peer connections. No phone
              number, no email, no account.
            </p>
            <ul className="mt-6 space-y-3.5 text-sm">
              <li className="flex gap-3">
                <KeyRound className="mt-0.5 size-4 shrink-0 text-ink-soft" />
                <span className="text-ink-soft">A private key created on this device becomes your chat ID.</span>
              </li>
              <li className="flex gap-3">
                <Smartphone className="mt-0.5 size-4 shrink-0 text-ink-soft" />
                <span className="text-ink-soft">Your chats are stored only on this device, in this browser.</span>
              </li>
              <li className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ink-soft" />
                <span className="text-ink-soft">Messages reach people when you are both online. Nothing waits on a server.</span>
              </li>
            </ul>
            <Button size="lg" className="mt-7 w-full" onClick={() => setStep('profile')}>
              Get started
              <ArrowRight />
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="w-full max-w-[520px] rounded-xl border border-line bg-white shadow-card" noValidate>
            <div className="border-b border-line px-6 py-5">
              <h1 className="text-xl font-semibold tracking-tight">Create your profile</h1>
              <p className="mt-1 text-sm text-muted">This is what people see when you chat with them. You can change it later.</p>
            </div>
            <div className="space-y-5 px-6 py-5">
              <Field label="Display name">
                <input
                  className={inputClass}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError('');
                  }}
                  maxLength={60}
                  placeholder="Your name"
                  autoComplete="nickname"
                  autoFocus
                  required
                />
              </Field>
              <Field label="Status (optional)">
                <input className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)} maxLength={140} placeholder="Hey there! I'm using UR Chat" />
              </Field>
              <div>
                <span className="text-[13px] font-medium text-ink-soft">Profile picture (optional)</span>
                <div className="mt-2">
                  <AvatarPicker value={avatar} onChange={setAvatar} name={name} />
                </div>
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-line bg-surface px-6 py-4 sm:flex-row sm:justify-between">
              <Button variant="ghost" onClick={() => setStep('welcome')}>
                Back
              </Button>
              <Button type="submit" size="lg" disabled={busy}>
                {busy ? 'Creating…' : 'Create profile'}
              </Button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
