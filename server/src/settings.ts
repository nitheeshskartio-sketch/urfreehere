/**
 * Site-wide switches and the announcement banner, changed from the admin console.
 * Kept in memory and, when MongoDB is configured, saved in `site_settings`.
 */
export interface Announcement {
  text: string;
  tone: 'info' | 'warning' | 'success';
  updatedAt: number;
}

export interface SiteSettings {
  /** New Humble accounts can be created. Existing accounts keep working. */
  signupsOpen: boolean;
  /** GIF and sticker search in Humble. */
  gifsEnabled: boolean;
  /** New voice calls can be started in chats. */
  micCreateEnabled: boolean;
  /** Festive decorations: 'auto' follows the calendar, 'off' hides them, or force one festival. */
  season: Season;
  announcement: Announcement | null;
}

export const SEASONS = ['auto', 'off', 'christmas', 'newyear', 'onam', 'diwali'] as const;
export type Season = (typeof SEASONS)[number];

export const settings: SiteSettings = {
  signupsOpen: true,
  gifsEnabled: true,
  micCreateEnabled: true,
  season: 'auto',
  announcement: null,
};

/** Suspended Humble IDs (loaded from MongoDB at start). */
export const bannedIds = new Set<string>();

/** What every visitor may see: the banner and which features are switched on. */
export function publicSettings() {
  const { announcement, gifsEnabled, micCreateEnabled, signupsOpen, season } = settings;
  return { announcement, gifsEnabled, micCreateEnabled, signupsOpen, season };
}

export function applySettings(patch: Partial<SiteSettings>) {
  for (const k of ['signupsOpen', 'gifsEnabled', 'micCreateEnabled'] as const) {
    if (typeof patch[k] === 'boolean') settings[k] = patch[k]!;
  }
  if (typeof patch.season === 'string' && (SEASONS as readonly string[]).includes(patch.season)) settings.season = patch.season;
  if (patch.announcement === null) settings.announcement = null;
  else if (patch.announcement && typeof patch.announcement.text === 'string') {
    const text = patch.announcement.text.trim().slice(0, 300);
    const tone = ['info', 'warning', 'success'].includes(patch.announcement.tone) ? patch.announcement.tone : 'info';
    settings.announcement = text ? { text, tone, updatedAt: Number(patch.announcement.updatedAt) || Date.now() } : null;
  }
}
