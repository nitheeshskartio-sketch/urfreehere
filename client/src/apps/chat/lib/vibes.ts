/**
 * How each emoji "blasts" across the screen when it's picked, or when the other
 * person first sees it. Every emoji has its own motion, companions and tint.
 */
export type Motion = 'rise' | 'burst' | 'fall' | 'shake' | 'snow' | 'break' | 'drift';

export interface Vibe {
  motion: Motion;
  /** Particles flying around the main emoji. */
  particles: string[];
  /** Screen tint behind the effect (rgb). */
  tint: string;
  count: number;
}

const VIBES: Record<string, Vibe> = {
  '😍': { motion: 'rise', particles: ['😍', '💘', '✨', '💕'], tint: '236 72 153', count: 26 },
  '❤️': { motion: 'rise', particles: ['❤️', '💕', '💖', '💗'], tint: '244 63 94', count: 30 },
  '🥰': { motion: 'rise', particles: ['🥰', '💞', '💗', '🌸'], tint: '236 72 153', count: 26 },
  '😊': { motion: 'burst', particles: ['😊', '🌼', '✨', '🌸'], tint: '245 158 11', count: 22 },
  '🤩': { motion: 'burst', particles: ['⭐', '🌟', '✨', '🤩'], tint: '234 179 8', count: 30 },
  '🥺': { motion: 'fall', particles: ['🥺', '💧', '🫧'], tint: '96 165 250', count: 18 },
  '🤝': { motion: 'burst', particles: ['🤝', '🎉', '✨', '🎊'], tint: '34 197 94', count: 28 },
  '😂': { motion: 'burst', particles: ['😂', '🤣', '💦', '😆'], tint: '250 204 21', count: 28 },
  '😎': { motion: 'burst', particles: ['😎', '✨', '🕶️', '⚡'], tint: '59 130 246', count: 20 },
  '🤗': { motion: 'rise', particles: ['🤗', '💛', '💕', '🫶'], tint: '251 146 60', count: 24 },
  '😐': { motion: 'drift', particles: ['😐', '💭', '…'], tint: '148 163 184', count: 10 },
  '😴': { motion: 'drift', particles: ['💤', '😴', '🌙', '⭐'], tint: '99 102 241', count: 14 },
  '😔': { motion: 'fall', particles: ['😔', '🌧️', '💧'], tint: '100 116 139', count: 18 },
  '😢': { motion: 'fall', particles: ['💧', '😢', '💧', '💦'], tint: '59 130 246', count: 28 },
  '😡': { motion: 'shake', particles: ['😡', '💢', '🔥', '💥'], tint: '239 68 68', count: 26 },
  '💔': { motion: 'break', particles: ['💔', '🖤', '🥀'], tint: '127 29 29', count: 16 },
  '🥶': { motion: 'snow', particles: ['❄️', '🥶', '❄️', '🧊'], tint: '125 211 252', count: 32 },
  '🔥': { motion: 'rise', particles: ['🔥', '🔥', '✨', '💥'], tint: '249 115 22', count: 30 },
  '🙏': { motion: 'rise', particles: ['🙏', '✨', '🕊️', '🌟'], tint: '250 204 21', count: 18 },
  '🤔': { motion: 'drift', particles: ['🤔', '❓', '💭', '❔'], tint: '168 85 247', count: 14 },
};

export function vibeOf(emoji: string): Vibe {
  return VIBES[emoji] ?? { motion: 'burst', particles: [emoji, '✨'], tint: '99 102 241', count: 22 };
}
