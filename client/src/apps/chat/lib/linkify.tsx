import type { ReactNode } from 'react';

const URL_RE = /\b(https?:\/\/[^\s<>"']+[^\s<>"'.,:;!?)\]])/gi;

/**
 * Turns http(s) URLs into links. Everything else stays plain text (React
 * escapes it), so message content can never inject HTML.
 */
export function linkify(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0];
    const start = m.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    let safe = false;
    try {
      const u = new URL(url);
      safe = u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      /* not a URL */
    }
    out.push(
      safe ? (
        <a key={start} href={url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-accent underline-offset-2 hover:underline">
          {url}
        </a>
      ) : (
        url
      ),
    );
    last = start + url.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** True when a message is only emoji (shown larger, without a bubble background). */
export function isEmojiOnly(text: string) {
  const t = text.trim();
  return t.length <= 12 && /^(\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u.test(t) && !/\d/.test(t);
}
