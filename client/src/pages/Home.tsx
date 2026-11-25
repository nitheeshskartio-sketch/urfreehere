import { ArrowRight, Check, Gift, Globe, ShieldCheck, UserX } from 'lucide-react';
import { listedApps, type AppDefinition } from '../apps/registry';
import { SITE } from '../site/config';
import { Link } from '../site/Link';
import { buttonClasses } from '../ui/Button';

export default function Home() {
  const [first] = listedApps;
  return (
    <>
      {/* Hero */}
      <section className="page pb-14 pt-12 sm:pb-20 sm:pt-20">
        <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[13px] font-medium text-ink-soft">
          <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
          Free · No accounts · No tracking
        </p>
        <h1 className="mt-5 max-w-[720px] text-[34px] font-semibold leading-[1.1] tracking-tight sm:text-[48px]">
          Everyday tools that respect your privacy.
        </h1>
        <p className="mt-4 max-w-[600px] text-base leading-relaxed text-muted sm:text-lg">{SITE.description}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {first && (
            <Link href={first.path} className={buttonClasses('primary', 'lg', 'sm:w-auto')}>
              Open {first.name}
              <ArrowRight />
            </Link>
          )}
          <Link href="/#apps" className={buttonClasses('secondary', 'lg', 'sm:w-auto')}>
            Browse apps
          </Link>
        </div>
      </section>

      {/* Apps */}
      <section className="border-t border-line bg-surface">
        <div className="page py-14 sm:py-16">
          <div id="apps" className="flex scroll-mt-24 flex-wrap items-end justify-between gap-3">
            <SectionHeading eyebrow="Apps" title="Pick a tool and get started" />
            <p className="text-sm text-muted">
              {listedApps.length} {listedApps.length === 1 ? 'app' : 'apps'} · all free
            </p>
          </div>
          <div className={`mt-8 grid gap-5 ${listedApps.length > 1 ? 'lg:grid-cols-2' : ''}`}>
            {listedApps.map((app) => (
              <AppCard key={app.id} app={app} featured={listedApps.length === 1} />
            ))}
          </div>
        </div>
      </section>

      {/* About */}
      <section className="border-t border-line">
        <div className="page grid gap-10 py-14 sm:py-16 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
          <div id="about" className="scroll-mt-24">
            <SectionHeading eyebrow="About" title="Simple by design" />
            <p className="mt-4 text-[15px] leading-relaxed text-muted">
              {SITE.name} builds small, focused apps for everyday tasks. Each one does a single job well, opens instantly in
              your browser and works the same on phones, tablets and computers.
            </p>
          </div>
          <ul className="grid gap-x-8 gap-y-7 sm:grid-cols-2">
            <Principle icon={Gift} title="Free to use" text="Every app is free, with no trials, limits on features or upsells." />
            <Principle icon={UserX} title="No accounts" text="Open an app and use it. No sign-up, email or password." />
            <Principle icon={ShieldCheck} title="Private by design" text="Your data is processed on your devices whenever possible." />
            <Principle icon={Globe} title="Nothing to install" text="Runs in any modern browser on Android, iOS, Windows, macOS and Linux." />
          </ul>
        </div>
      </section>

      {/* Privacy */}
      <section className="border-t border-line bg-surface">
        <div className="page py-14 sm:py-16">
          <div id="privacy" className="scroll-mt-24">
            <SectionHeading eyebrow="Privacy" title="Your data stays yours" />
          </div>
          <div className="mt-6 grid gap-4 text-[15px] leading-relaxed text-muted md:grid-cols-3 md:gap-8">
            <p>
              <span className="font-medium text-ink">No tracking.</span> We don't use analytics, advertising or tracking
              cookies, and we don't sell or share data.
            </p>
            <p>
              <span className="font-medium text-ink">Minimal servers.</span> When an app needs a server, for example to
              connect two devices, the server handles only what is required and stores nothing.
            </p>
            <p>
              <span className="font-medium text-ink">Per-app details.</span> Each app explains exactly what happens to your
              data on its own page, such as{' '}
              <Link href="/postman#privacy" className="font-medium text-accent hover:underline">
                UR Postman's privacy notes
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-[13px] font-medium text-accent">{eyebrow}</p>
      <h2 className="mt-1 text-[22px] font-semibold tracking-tight sm:text-[26px]">{title}</h2>
    </div>
  );
}

function Principle({ icon: Icon, title, text }: { icon: typeof Gift; title: string; text: string }) {
  return (
    <li className="flex gap-3.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-ink-soft">
        <Icon className="size-[18px]" strokeWidth={1.75} />
      </span>
      <div>
        <h3 className="text-[15px] font-semibold">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">{text}</p>
      </div>
    </li>
  );
}

function AppCard({ app, featured }: { app: AppDefinition; featured: boolean }) {
  return (
    <article
      className={`overflow-hidden rounded-xl border border-line bg-white shadow-card ${
        featured ? 'grid lg:grid-cols-[1.15fr_1fr]' : 'flex flex-col'
      }`}
    >
      <div className="flex flex-col p-6 sm:p-8">
        <div className="flex items-center gap-3.5">
          <app.icon className="size-11" />
          <div>
            <p className="text-[13px] font-medium text-muted">{app.category}</p>
            <h3 className="text-xl font-semibold tracking-tight">{app.name}</h3>
          </div>
        </div>
        <p className="mt-4 text-[15px] leading-relaxed text-muted">{app.description}</p>
        <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-soft">
          {app.highlights.map((h) => (
            <li key={h} className="flex items-center gap-1.5">
              <Check className="size-4 text-success" strokeWidth={2.5} />
              {h}
            </li>
          ))}
        </ul>
        <div className="mt-7 flex flex-1 items-end">
          <Link href={app.path} className={buttonClasses('primary', 'lg', 'w-full sm:w-auto')}>
            Open {app.name}
            <ArrowRight />
          </Link>
        </div>
      </div>

      {featured && (
        <div className="border-t border-line bg-surface p-6 sm:p-8 lg:border-l lg:border-t-0">
          <p className="text-[13px] font-semibold text-ink">How it works</p>
          <ol className="mt-4 space-y-4">
            {app.steps.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-line bg-white text-[13px] font-semibold tabular text-ink-soft">
                  {i + 1}
                </span>
                <p className="pt-0.5 text-sm leading-relaxed text-ink-soft">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </article>
  );
}
