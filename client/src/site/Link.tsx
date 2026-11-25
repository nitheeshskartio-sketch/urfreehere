import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { navigate } from '../lib/router';

/** Client-side navigation link. Hash links to sections on the home page work from any page. */
export function Link({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    const [path, hash] = href.split('#');
    navigate(href);
    if (hash) {
      // Wait for the home page to render before scrolling to the section.
      window.setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: path === window.location.pathname ? 'smooth' : 'auto' }), 30);
    }
  };
  return <a href={href} onClick={handle} {...props} />;
}
