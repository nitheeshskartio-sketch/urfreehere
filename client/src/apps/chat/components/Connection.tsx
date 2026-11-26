import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEngine } from '../hooks';
import { EMOTION_INFO, levelOf, type ConnectionState } from '../lib/connection';
import type { UserId } from '../lib/types';

/** The emoji for the current tone, or the score's emoji if the tone is unknown. */
function badgeOf(state: ConnectionState | null | undefined) {
  if (!state || state.score == null) return null;
  const level = levelOf(state.score);
  const mood = state.emotion ? EMOTION_INFO[state.emotion] : null;
  return {
    emoji: mood?.emoji ?? level.emoji,
    title: `${mood ? `${mood.label} · ` : ''}${state.score}/100 ${level.label} (AI estimate from your messages)`,
  };
}

/**
 * Wraps a profile picture and shows the Connection emoji on it.
 * `load` fetches the result when it isn't known yet (chat header); lists pass
 * false and show only what's already loaded, to avoid a request per row.
 */
export function ConnectionBadge({ peer, load = true, size = 'md', children }: { peer: UserId | undefined; load?: boolean; size?: 'sm' | 'md'; children: ReactNode }) {
  const e = useEngine();
  const v = peer ? (load ? e.connectionOf(peer) : e.connections.get(peer)) : undefined;
  const badge = v?.available ? badgeOf(v.state) : null;
  return (
    <span className="relative inline-flex shrink-0">
      {children}
      {badge && (
        <span
          className={`absolute -right-1 -top-1 grid place-items-center rounded-full bg-panel leading-none shadow-sm ring-1 ring-line ${size === 'sm' ? 'size-[18px] text-[11px]' : 'size-[22px] text-[13px]'}`}
          title={badge.title}
          aria-label={badge.title}
          role="img"
        >
          {badge.emoji}
        </span>
      )}
    </span>
  );
}

function Meter({ score, bar }: { score: number; bar: string }) {
  return (
    <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden>
      <span className={`block h-full rounded-full transition-[width] duration-700 ${bar}`} style={{ width: `${Math.max(3, score)}%` }} />
    </span>
  );
}

/** Info panel section: the shared score and what it means. */
export function ConnectionSection({ peer }: { peer: UserId }) {
  const e = useEngine();
  const v = e.connectionOf(peer);
  if (!v?.available) return null;
  const first = e.nameOf(peer).split(' ')[0];
  const score = v.state?.score;
  const level = score != null ? levelOf(score) : null;
  const mood = v.state?.emotion ? EMOTION_INFO[v.state.emotion] : null;

  return (
    <section className="border-t border-line px-4 py-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-soft">
          <Sparkles className="size-3.5" />
          Connection
        </h3>
        <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-muted">AI</span>
      </div>
      <div className="rounded-lg border border-line p-3">
        {level && score != null ? (
          <>
            <div className="flex items-center gap-3">
              <span className="text-3xl leading-none" aria-hidden>
                {mood?.emoji ?? level.emoji}
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold">
                  <span className="tabular-nums">{score}</span>
                  <span className="text-muted"> / 100</span>
                </p>
                <p className="text-[13px] text-ink-soft">
                  {level.emoji} {level.label}
                </p>
              </div>
            </div>
            <Meter score={score} bar={level.bar} />
            {mood && <p className="mt-2 text-[12.5px] text-muted">Tone right now: {mood.label}</p>}
          </>
        ) : (
          <p className="text-[13px] text-muted">Appears once you and {first} have chatted a little.</p>
        )}
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-muted">
        An AI reads the words and emoji in your recent messages with {first} and shows you both the same result. It’s an estimate, not a measure of anyone’s feelings. Recent text messages are sent to the UR Free Here server and Anthropic’s Claude for this, without names, and aren’t stored. Secret and view-once messages are never sent.
      </p>
    </section>
  );
}
