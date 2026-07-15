/**
 * Organization profile for document-spine (imported/free) works: the per-work,
 * user-named set of heading TIERS. A marked row stores a numeric LEVEL (1-based
 * rank); the profile turns that rank into a display name and a navigation role.
 *
 * navRole maps a tier onto the app's existing structure:
 *   - 'book'    → a top navigable division (Aristotle Book / Aquinas Part)
 *   - 'chapter' → the second navigable division (Aristotle Chapter / Aquinas Question)
 *   - 'heading' → an in-page heading (jump-to in the rail outline, no split)
 *
 * A work with no saved profile uses DEFAULT_PROFILE, which reproduces the
 * original two-level behaviour (Heading / Section title, both in-page).
 */

export type NavRole = 'book' | 'chapter' | 'heading';

export interface WorkLevel {
  name: string;
  navRole: NavRole;
}

export interface WorkProfile {
  /** Tiers in rank order; the level number a row carries is index + 1. */
  levels: WorkLevel[];
}

/** Preserves the pre-profile two-level UX for any doc without a custom profile. */
export const DEFAULT_PROFILE: WorkProfile = {
  levels: [
    { name: 'Heading', navRole: 'heading' },
    { name: 'Section title', navRole: 'heading' },
  ],
};

const NAV_ROLES: readonly NavRole[] = ['book', 'chapter', 'heading'];
/** A sane upper bound so a corrupt registry can't build a runaway menu. */
export const MAX_LEVELS = 12;

/** Display name of a 1-based level; a synthetic fallback past the profile end. */
export function levelName(profile: WorkProfile, level: number): string {
  return profile.levels[level - 1]?.name ?? `Level ${level}`;
}

/** Navigation role of a 1-based level; 'heading' past the profile end. */
export function navRoleOf(profile: WorkProfile, level: number): NavRole {
  return profile.levels[level - 1]?.navRole ?? 'heading';
}

/**
 * LENIENT sanitize of a stored/parsed profile (registry data must never take
 * down the rail): drop entries that aren't {name, navRole} with a non-empty
 * name, coerce an unknown navRole to 'heading', cap the tier count, and fall
 * back to DEFAULT_PROFILE when nothing usable survives.
 */
export function sanitizeProfile(raw: unknown): WorkProfile {
  const levels = sanitizeLevels(raw);
  return levels && levels.length > 0 ? { levels } : DEFAULT_PROFILE;
}

/**
 * The `levels` array alone, sanitized — or undefined when the input carries no
 * usable levels (so a registry record can omit the key rather than store a
 * default). Shared by sanitizeProfile and the free-work registry.
 */
export function sanitizeLevels(raw: unknown): WorkLevel[] | undefined {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { levels?: unknown } | null)?.levels)
      ? (raw as { levels: unknown[] }).levels
      : null;
  if (!list) return undefined;
  const levels: WorkLevel[] = [];
  for (const entry of list) {
    if (levels.length >= MAX_LEVELS) break;
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as { name?: unknown; navRole?: unknown };
    const name = typeof e.name === 'string' ? e.name.trim() : '';
    if (name.length === 0) continue;
    const navRole = NAV_ROLES.includes(e.navRole as NavRole) ? (e.navRole as NavRole) : 'heading';
    levels.push({ name, navRole });
  }
  return levels.length > 0 ? levels : undefined;
}
