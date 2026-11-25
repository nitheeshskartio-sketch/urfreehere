import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, EyeOff, Lock, ShieldCheck, Timer, Upload } from 'lucide-react';
import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import { Button } from '../../../ui/Button';
import { appById } from '../../registry';

const APP_NAME = appById('postman').name;
import { Panel } from '../../../ui/Panel';
import { parseCode } from '../../../lib/format';
import { setPendingFiles } from '../lib/pendingFiles';
import { navigate } from '../../../lib/router';

export default function Home() {
  return (
    <>
      <section className="mx-auto max-w-content px-4 pb-14 pt-10 sm:px-8 sm:pb-20 sm:pt-16">
        <h1 className="text-[30px] font-semibold leading-[1.15] tracking-tight sm:text-[40px]">Transfer files. Directly.</h1>
        <p className="mt-3 max-w-[560px] text-base leading-relaxed text-muted sm:text-lg">
          Send files between your devices securely. No uploads, no accounts, just a direct connection.
        </p>

        <div className="mt-8 grid gap-4 md:mt-10 md:grid-cols-2 md:gap-5">
          <SendCard />
          <ReceiveCard />
        </div>

        <p className="mt-5 flex items-start gap-2 text-sm text-muted">
          <ShieldCheck className="mt-px size-4 shrink-0 text-success" />
          Your files are transferred directly between devices. We don't store your files.
        </p>
      </section>

      <HowItWorks />
      <Privacy />
      <About />
    </>
  );
}

function CardHeading({ icon: Icon, title, text }: { icon: typeof Upload; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3.5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
        <Icon className="size-5" strokeWidth={2} />
      </span>
      <div>
        <h2 className="text-[17px] font-semibold">{title}</h2>
        <p className="mt-0.5 text-sm leading-relaxed text-muted">{text}</p>
      </div>
    </div>
  );
}

function SendCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const go = (files: File[]) => {
    if (!files.length) return;
    setPendingFiles(files);
    navigate('/postman/send');
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    go(Array.from(e.dataTransfer.files));
  };

  return (
    <Panel
      className={`flex flex-col p-5 transition-colors sm:p-6 ${over ? 'border-accent bg-accent-soft/40' : ''}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(false)}
      onDrop={onDrop}
    >
      <CardHeading icon={ArrowUpFromLine} title="Send files" text="Choose files, then share a code or QR code with the other device." />
      <div className="mt-6 flex flex-1 flex-col justify-end gap-3">
        <Button size="lg" className="w-full" onClick={() => inputRef.current?.click()}>
          <Upload />
          Select files
        </Button>
        <p className="hidden text-center text-[13px] text-muted md:block">{over ? 'Drop to continue' : 'or drop files onto this card'}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => go(Array.from(e.target.files ?? []))}
      />
    </Panel>
  );
}

function ReceiveCard() {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const code = parseCode(value);
    if (!code) return setError('Enter the 8-character code shown on the sending device.');
    navigate(`/r/${code}`);
  };

  return (
    <Panel className="flex flex-col p-5 sm:p-6">
      <CardHeading icon={ArrowDownToLine} title="Receive files" text="Enter the code from the sending device, or open the link it shared." />
      <form onSubmit={submit} className="mt-6 flex flex-1 flex-col justify-end gap-3" noValidate>
        <label htmlFor="home-code" className="sr-only">
          Sharing code
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="home-code"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError('');
            }}
            placeholder="Sharing code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            aria-invalid={!!error}
            aria-describedby={error ? 'home-code-error' : undefined}
            className={`h-11 min-w-0 flex-1 rounded-lg border bg-white px-3.5 font-mono text-[15px] uppercase tracking-[0.12em] placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-muted/80 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 ${
              error ? 'border-danger' : 'border-line-strong'
            }`}
          />
          <Button type="submit" size="lg" variant="secondary" className="sm:w-auto">
            Connect
            <ArrowRight />
          </Button>
        </div>
        {error ? (
          <p id="home-code-error" className="text-[13px] text-danger">
            {error}
          </p>
        ) : (
          <p className="text-[13px] text-muted">
            Have a QR code? Scan it with your camera, or{' '}
            <a
              href="/postman/receive"
              onClick={(e) => {
                e.preventDefault();
                navigate('/postman/receive');
              }}
              className="font-medium text-accent hover:underline"
            >
              open the receiver
            </a>
            .
          </p>
        )}
      </form>
    </Panel>
  );
}

function SectionTitle({ id, eyebrow, title }: { id: string; eyebrow: string; title: string }) {
  return (
    <div id={id} className="scroll-mt-20">
      <p className="text-[13px] font-medium text-accent">{eyebrow}</p>
      <h2 className="mt-1 text-[22px] font-semibold tracking-tight sm:text-2xl">{title}</h2>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    { title: 'Choose files', text: 'Select one or more files on the sending device. Nothing is uploaded.' },
    { title: 'Share the code', text: 'On the other device, open the link, scan the QR code or type the 8-character code.' },
    { title: 'Transfer directly', text: 'Once you accept, files move over an encrypted peer-to-peer connection.' },
  ];
  return (
    <section className="border-t border-line bg-surface">
      <div className="mx-auto max-w-content px-4 py-12 sm:px-8 sm:py-16">
        <SectionTitle id="how-it-works" eyebrow="How it works" title="Three steps, no sign-up" />
        <ol className="mt-8 grid gap-4 sm:grid-cols-3 sm:gap-5">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-xl border border-line bg-white p-5">
              <span className="flex size-7 items-center justify-center rounded-md border border-line text-[13px] font-semibold tabular text-ink-soft">
                {i + 1}
              </span>
              <h3 className="mt-4 text-[15px] font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Privacy() {
  const points = [
    {
      icon: ShieldCheck,
      title: 'No file storage',
      text: 'Files go from browser to browser. Our server only helps the two devices find each other and never sees file contents.',
    },
    {
      icon: Lock,
      title: 'Encrypted in transit',
      text: 'WebRTC encrypts every connection with DTLS. If a direct path is blocked, an encrypted relay may forward data it cannot read.',
    },
    {
      icon: Timer,
      title: 'Short-lived codes',
      text: 'Each code works for one receiving device and expires after 30 minutes. You accept files before anything is transferred.',
    },
    {
      icon: EyeOff,
      title: 'No accounts or tracking',
      text: 'No sign-up and no analytics. File names and sizes are shared only with the receiving device.',
    },
  ];
  return (
    <section className="border-t border-line">
      <div className="mx-auto max-w-content px-4 py-12 sm:px-8 sm:py-16">
        <SectionTitle id="privacy" eyebrow="Privacy" title="Your files stay between your devices" />
        <ul className="mt-8 grid gap-x-10 gap-y-7 sm:grid-cols-2">
          {points.map((p) => (
            <li key={p.title} className="flex gap-3.5">
              <p.icon className="mt-0.5 size-5 shrink-0 text-ink-soft" strokeWidth={1.75} />
              <div>
                <h3 className="text-[15px] font-semibold">{p.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{p.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function About() {
  return (
    <section className="border-t border-line bg-surface">
      <div className="mx-auto max-w-content px-4 py-12 sm:px-8 sm:py-14">
        <SectionTitle id="about" eyebrow="About" title={`About ${APP_NAME}`} />
        <p className="mt-4 max-w-[680px] text-sm leading-relaxed text-muted sm:text-[15px]">
          {APP_NAME} is a small tool for moving files between your own devices, such as a phone and a laptop, without
          cloud storage, email attachments or cables. It runs in any modern browser and works best when both devices are
          online at the same time. Transfer speed depends on the slower of the two connections.
        </p>
      </div>
    </section>
  );
}
