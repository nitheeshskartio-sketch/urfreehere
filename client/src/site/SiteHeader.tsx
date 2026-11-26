import type { AppDefinition } from '../apps/registry';
import { SITE } from './config';
import { Link } from './Link';
import { SiteMark } from './Logo';
import { ThemeToggle } from '../ui/ThemeToggle';

const SITE_NAV = [
  { label: 'Apps', href: '/#apps' },
  { label: 'About', href: '/#about' },
  { label: 'Privacy', href: '/#privacy' },
];

/**
 * Shared header for every page. Inside an app it shows a breadcrumb
 * (site › app) and the app's own navigation.
 */
export function SiteHeader({ app }: { app?: AppDefinition }) {
  const nav = app ? app.nav : SITE_NAV;
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-panel/95 backdrop-blur-sm supports-[backdrop-filter]:bg-panel/85">
      <div className="page flex h-header items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-md" aria-label={`${SITE.name} home`}>
            <SiteMark className="size-8" />
            <span className={`text-[15px] font-semibold tracking-tight ${app ? 'hidden sm:inline' : ''}`}>{SITE.name}</span>
          </Link>
          {app && (
            <>
              <span className="text-line-strong" aria-hidden="true">
                /
              </span>
              <Link href={app.path} className="flex min-w-0 items-center gap-2 rounded-md">
                <app.icon className="size-6 shrink-0" />
                <span className="truncate text-[15px] font-semibold tracking-tight">{app.name}</span>
              </Link>
            </>
          )}
        </div>
        <nav className="flex shrink-0 items-center gap-0.5 text-sm" aria-label={app ? `${app.name} navigation` : 'Site navigation'}>
          {nav.map((item, i) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-2 py-1.5 text-muted transition-colors hover:text-ink sm:px-2.5 ${
                // Keep the bar uncluttered on small phones.
                !app && i === 0 ? 'hidden min-[400px]:inline' : ''
              }`}
            >
              {item.label}
            </Link>
          ))}
          <ThemeToggle className="ml-1" />
        </nav>
      </div>
    </header>
  );
}
