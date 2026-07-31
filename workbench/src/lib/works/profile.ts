/**
 * Organization profile for document-spine (imported/free) works: the per-work,
 * user-named set of heading TIERS. A marked row stores a numeric LEVEL (1-based
 * rank); the profile turns that rank into a display name and a navigation role.
 *
 * navRole maps a tier onto the app's existing structure:
 *   - 'book'     → a top navigable division (Aristotle Book / Aquinas Part)
 *   - 'chapter'  → the second navigable division (Aristotle Chapter / Aquinas Question)
 *   - 'heading'  → an in-page heading (jump-to in the rail outline, no split)
 *   - 'subtitle' → the TITLE OF A SECTION (e.g. Aquinas's "Utrum…" line): shown
 *                  under its parent heading as a subtitle, NOT nested as a child;
 *                  never a split boundary.
 *
 * A work with no saved profile uses DEFAULT_PROFILE, which reproduces the
 * original two-level behaviour (Heading / Section title, both in-page).
 */

export type NavRole = 'book' | 'chapter' | 'heading' | 'subtitle';

export interface WorkLevel {
  name: string;
  navRole: NavRole;
  /**
   * 0-based OUTLINE INDENT of this tier (0 = top). Two tiers at the SAME depth
   * are equal-level SIBLINGS in the rail tree; a deeper tier nests under the
   * shallower one above it. Invariant (enforced by sanitize/reclamp): the first
   * tier is depth 0 and no tier is more than ONE deeper than the tier above it
   * (an outliner — no gaps). Distinct from the tier's rank (its index+1), which
   * only names it; depth is what decides nesting.
   */
  depth: number;
}

export interface WorkProfile {
  /** Tiers in rank order; the level number a row carries is index + 1. */
  levels: WorkLevel[];
}

/** Preserves the pre-profile two-level UX for any doc without a custom profile. */
export const DEFAULT_PROFILE: WorkProfile = {
  levels: [
    { name: 'Heading', navRole: 'heading', depth: 0 },
    { name: 'Section title', navRole: 'heading', depth: 1 },
  ],
};

const NAV_ROLES: readonly NavRole[] = ['book', 'chapter', 'heading', 'subtitle'];
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

/** Outline indent depth of a 1-based level; a synthetic fallback past the end. */
export function levelDepth(profile: WorkProfile, level: number): number {
  return profile.levels[level - 1]?.depth ?? Math.max(0, level - 1);
}

/**
 * Re-clamp every level's depth to the no-gap outliner invariant IN PLACE of the
 * given order: the first tier is 0, and each tier is at most one deeper than the
 * one above it (outdenting to any shallower value is fine). Used after every
 * add / remove / reorder / indent so the stored depths stay legal. A missing or
 * invalid depth defaults to prevDepth + 1 (each tier one deeper — the legacy
 * "everything nests" behaviour), so older profiles migrate with no visual change.
 */
export function reclampDepths<T extends { depth?: number }>(levels: T[]): (T & { depth: number })[] {
  let prevDepth = -1;
  return levels.map((l) => {
    const max = prevDepth + 1;
    const raw = l.depth;
    const depth = typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? Math.min(raw, max) : max;
    prevDepth = depth;
    return { ...l, depth };
  });
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
  const partial: { name: string; navRole: NavRole; depth?: number }[] = [];
  for (const entry of list) {
    if (partial.length >= MAX_LEVELS) break;
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as { name?: unknown; navRole?: unknown; depth?: unknown };
    const name = typeof e.name === 'string' ? e.name.trim() : '';
    if (name.length === 0) continue;
    const navRole = NAV_ROLES.includes(e.navRole as NavRole) ? (e.navRole as NavRole) : 'heading';
    const depth = typeof e.depth === 'number' ? e.depth : undefined;
    partial.push({ name, navRole, depth });
  }
  if (partial.length === 0) return undefined;
  // reclampDepths enforces the no-gap invariant and fills missing depths via the
  // legacy "one deeper than the tier above" migration (older records, DEFAULT).
  return reclampDepths(partial);
}
