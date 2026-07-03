// Pure parse/serialize/upsert helpers for a reference edition's manifest.json
// (design doc D5 §1b). String in / value out; no filesystem access here —
// reference/storage.ts owns reading and writing the bytes.

import type { ReferenceChapter, ReferenceManifest } from './types';

export function referenceChapterFileName(book: number, chapter: number): string {
  const b = String(book).padStart(2, '0');
  const c = String(chapter).padStart(2, '0');
  return `chapter-${b}-${c}.md`;
}

/**
 * Defensive parse: any structural problem (bad JSON, wrong shape, missing
 * fields) returns null rather than throwing. Callers map null to the plain
 * "this reference edition couldn't be read" sentence (D5 §8) rather than
 * crashing the panel.
 */
export function parseManifest(raw: string): ReferenceManifest | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== 1) return null;
  if (typeof v.workId !== 'string' || v.workId === '') return null;
  if (typeof v.slug !== 'string' || v.slug === '') return null;
  if (typeof v.displayName !== 'string' || v.displayName === '') return null;
  if (typeof v.importedAt !== 'string') return null;
  if (!Array.isArray(v.chapters)) return null;

  const chapters: ReferenceChapter[] = [];
  for (const entry of v.chapters) {
    if (typeof entry !== 'object' || entry === null) return null;
    const e = entry as Record<string, unknown>;
    if (typeof e.book !== 'number' || typeof e.chapter !== 'number') return null;
    if (typeof e.file !== 'string' || e.file === '') return null;
    chapters.push({ book: e.book, chapter: e.chapter, file: e.file });
  }

  return {
    schemaVersion: 1,
    workId: v.workId,
    slug: v.slug,
    displayName: v.displayName,
    importedAt: v.importedAt,
    chapters,
  };
}

export function serializeManifest(manifest: ReferenceManifest): string {
  return JSON.stringify(manifest, null, 2);
}

/** kebab-case a display name into a candidate slug (no collision check). */
export function slugify(displayName: string): string {
  const base = displayName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'edition';
}

/**
 * Derive a slug for `displayName`, guaranteed not to collide with any of
 * `existingSlugs`. Ties are broken with `-2`, `-3`, … suffixes.
 */
export function deriveSlug(displayName: string, existingSlugs: readonly string[]): string {
  const base = slugify(displayName);
  const taken = new Set(existingSlugs);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/**
 * Insert or replace a chapter entry (matched by book+chapter), then return a
 * NEW manifest with `chapters` sorted by (book, chapter) and `importedAt`
 * bumped to `now`. Does not mutate the input.
 */
export function upsertChapter(
  manifest: ReferenceManifest,
  entry: ReferenceChapter,
  now: string,
): ReferenceManifest {
  const rest = manifest.chapters.filter(
    (c) => !(c.book === entry.book && c.chapter === entry.chapter),
  );
  const chapters = [...rest, entry].sort((a, b) => a.book - b.book || a.chapter - b.chapter);
  return { ...manifest, chapters, importedAt: now };
}

/** Remove a chapter entry (matched by book+chapter); no-op if absent. */
export function removeChapter(
  manifest: ReferenceManifest,
  book: number,
  chapter: number,
  now: string,
): ReferenceManifest {
  const chapters = manifest.chapters.filter((c) => !(c.book === book && c.chapter === chapter));
  return { ...manifest, chapters, importedAt: now };
}

export function createManifest(
  workId: string,
  slug: string,
  displayName: string,
  now: string,
): ReferenceManifest {
  return { schemaVersion: 1, workId, slug, displayName, importedAt: now, chapters: [] };
}
