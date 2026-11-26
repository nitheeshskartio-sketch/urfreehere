import { listedApps } from '../apps/registry';
import { SITE } from './config';
import { Link } from './Link';
import { SiteMark } from './Logo';
import { SupportCoffee } from './SupportCoffee';

export function SiteFooter() {
  return (
    <>
    <div className="bg-surface pb-2">
      <SupportCoffee />
    </div>
    <footer className="border-t border-line bg-surface">
      <div className="page grid gap-8 py-10 sm:grid-cols-[1.4fr_1fr_1fr] sm:gap-10">
        <div>
          <Link href="/" className="inline-flex items-center gap-2.5 rounded-md">
            <SiteMark className="size-7" />
            <span className="text-[15px] font-semibold tracking-tight">{SITE.name}</span>
          </Link>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">{SITE.tagline}</p>
        </div>
        <FooterColumn title="Apps" links={listedApps.map((a) => ({ label: a.name, href: a.path }))} />
        <FooterColumn
          title="Site"
          links={[
            { label: 'About', href: '/#about' },
            { label: 'Privacy', href: '/#privacy' },
          ]}
        />
      </div>
      <div className="border-t border-line">
        <p className="page py-5 text-[13px] text-muted">
          © {SITE.year} {SITE.name}. Free to use.
        </p>
      </div>
    </footer>
    </>
  );
}

function FooterColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-muted transition-colors hover:text-ink">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
