/**
 * Connection: an AI reading of the emotional tone between two people in a
 * direct chat. The server works out one shared result; both people see the same
 * score, emoji and status. Only the current result exists — no history.
 */

export type Emotion =
  | 'happiness'
  | 'love'
  | 'caring'
  | 'friendship'
  | 'excitement'
  | 'missing'
  | 'trust'
  | 'neutral'
  | 'sadness'
  | 'anger'
  | 'disconnection';

export interface ConnectionState {
  /** 0–100, or null when there wasn't enough to go on. */
  score: number | null;
  emotion: Emotion | null;
  updatedAt: number;
}

export interface ConnectionView {
  /** The server offers the feature (has an AI key and the admin left it on). */
  available: boolean;
  state: ConnectionState | null;
}

export const EMOTION_INFO: Record<Emotion, { emoji: string; label: string }> = {
  happiness: { emoji: '😍', label: 'Happiness' },
  love: { emoji: '❤️', label: 'Affection' },
  caring: { emoji: '🥰', label: 'Caring' },
  friendship: { emoji: '😊', label: 'Friendship' },
  excitement: { emoji: '🤩', label: 'Excitement' },
  missing: { emoji: '🥺', label: 'Missing each other' },
  trust: { emoji: '🤝', label: 'Trust' },
  neutral: { emoji: '😐', label: 'Neutral' },
  sadness: { emoji: '😔', label: 'Sadness' },
  anger: { emoji: '😡', label: 'Anger' },
  disconnection: { emoji: '💔', label: 'Disconnection' },
};

export interface ConnectionLevel {
  emoji: string;
  label: string;
  /** Tailwind class for the meter fill. */
  bar: string;
}

export function levelOf(score: number): ConnectionLevel {
  if (score <= 20) return { emoji: '🥶', label: 'Cold', bar: 'bg-sky-500' };
  if (score <= 40) return { emoji: '😐', label: 'Distant', bar: 'bg-line-strong' };
  if (score <= 60) return { emoji: '😊', label: 'Friendly', bar: 'bg-amber-500' };
  if (score <= 80) return { emoji: '🥰', label: 'Close', bar: 'bg-pink-500' };
  return { emoji: '❤️', label: 'Deep Connection', bar: 'bg-rose-500' };
}
