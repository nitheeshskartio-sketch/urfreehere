import { ArrowRight, KeyRound, LoaderCircle, LogIn, MessagesSquare, ShieldCheck, Smartphone } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from '../../../site/Link';
import { SiteMark } from '../../../site/Logo';
import { Button } from '../../../ui/Button';
import { ThemeToggle } from '../../../ui/ThemeToggle';
import { navigate } from '../../../lib/router';
import { engine } from '../lib/engine';
import { normalizeLoginCode } from '../lib/identity';
import type { AvatarRef } from '../lib/types';
import { AvatarPicker } from '../../../ui/avatar/AvatarPicker';
import { Field, inputClass } from '../../../ui/Modal';

type Step = 'welcome' | 'login' | 'profile';

export function Onboarding({ initialStep = 'welcome' }: { initialStep?: 'welcome' | 'login' }) {
  const [step, setStepState] = useState<Step>(initialStep);
  // Keep the address in sync so /chat/login can be bookmarked and shared.
  const setStep = (next: Step) => {
    setStepState(next);
    navigate(next === 'login' ? '/chat/login' : '/chat', { replace: true });
  };
  const [code, setCode] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [restoring, setRestoring] = useState(false);

  const login = async (ev: FormEvent) => {
    ev.preventDefault();
    setLoginError('');
    const normalized = await normalizeLoginCode(code);
    if (!normalized) return setLoginError("That code isn't valid. Check for typos: it has 25 letters and numbers.");
    setLoginBusy(true);
    try {
      const result = await engine.loginWithCode(normalized);
      if (result === 'not-found') {
        setRestoring(true);
        setStep('profile');
      } else if (result === 'offline') {
        setLoginError("Couldn't reach Humble. Check your connection and try again.");
      }
      // 'found': the engine switches to the app.
    } catch {
      setLoginError("Couldn't sign in with this code.");
    }
    setLoginBusy(false);
  };
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
      <header className="flex h-14 items-center justify-between border-b border-line bg-panel px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 rounded-md">
          <SiteMark className="size-7" />
          <span className="text-[15px] font-semibold tracking-tight">Humble</span>
        </Link>
        <div className="flex items-center gap-1">
        <ThemeToggle />
        {step === 'login' ? (
          <Button variant="ghost" size="sm" onClick={() => setStep('welcome')}>
            Create account
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setStep('login')}>
            <LogIn />
            Sign in
          </Button>
        )}
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center sm:py-12">
        {step === 'welcome' ? (
          <div className="w-full max-w-[460px] rounded-xl border border-line bg-panel p-6 shadow-card sm:p-8">
            <span className="flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <MessagesSquare className="size-6" />
            </span>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight">Chat directly, device to device</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              Messages, photos, documents and voice calls go straight between devices over encrypted peer-to-peer connections. No phone
              number or email needed.
            </p>
            <ul className="mt-6 space-y-3.5 text-sm">
              <li className="flex gap-3">
                <KeyRound className="mt-0.5 size-4 shrink-0 text-ink-soft" />
                <span className="text-ink-soft">You get a secret login code to sign in on any device.</span>
              </li>
              <li className="flex gap-3">
                <Smartphone className="mt-0.5 size-4 shrink-0 text-ink-soft" />
                <span className="text-ink-soft">Only your profile is kept on our server. Chats stay on your devices.</span>
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
            <Button variant="secondary" size="lg" className="mt-2 w-full" onClick={() => setStep('login')}>
              <LogIn />I have a login code
            </Button>
          </div>
        ) : step === 'login' ? (
          <form onSubmit={login} className="w-full max-w-[460px] rounded-xl border border-line bg-panel shadow-card" noValidate>
            <div className="border-b border-line px-6 py-5">
              <h1 className="text-xl font-semibold tracking-tight">Sign in to Humble</h1>
              <p className="mt-1 text-sm text-muted">Enter your login code to use your account on this device. Your profile, contacts and groups come back; earlier messages don't. Humble works on one device at a time, so your other device is signed out and its chats are removed.</p>
            </div>
            <div className="space-y-3 px-6 py-5">
              <Field label="Login code">
                <input
                  className={`${inputClass} font-mono uppercase tracking-wider placeholder:font-sans placeholder:normal-case placeholder:tracking-normal`}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setLoginError('');
                  }}
                  placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  autoFocus
                />
              </Field>
              {loginError && <p className="text-sm text-danger">{loginError}</p>}
              <p className="text-[13px] text-muted">
                Your login code was shown when you created your account, and is in Settings → Login code on a device where you're signed in.
              </p>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-line bg-surface px-6 py-4 sm:flex-row sm:justify-between">
              <Button variant="ghost" onClick={() => setStep('welcome')}>
                New here? Create an account
              </Button>
              <Button type="submit" size="lg" disabled={loginBusy || !code.trim()}>
                {loginBusy ? <LoaderCircle className="animate-spin" /> : null}
                {loginBusy ? 'Signing in…' : 'Sign in'}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={submit} className="w-full max-w-[520px] rounded-xl border border-line bg-panel shadow-card" noValidate>
            <div className="border-b border-line px-6 py-5">
              <h1 className="text-xl font-semibold tracking-tight">{restoring ? 'Set up your profile again' : 'Create your profile'}</h1>
              <p className="mt-1 text-sm text-muted">
                {restoring
                  ? 'No account was found for this code. It may have been removed after 7 days without activity. Your chat ID stays the same.'
                  : 'This is what people see when you chat with them. You can change it later.'}
              </p>
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
                <input className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)} maxLength={140} placeholder="Hey there! I'm using Humble" />
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
              <Button
                variant="ghost"
                onClick={() => {
                  if (restoring) window.location.reload();
                  else setStep('welcome');
                }}
              >
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
