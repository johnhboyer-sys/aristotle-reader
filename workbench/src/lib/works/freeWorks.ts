/**
 * Free-work registry — corpus-free documents created by "New document…"
 * (workbench-design/d8-view-modes.md §6). Built-in works stay in the static
 * YAML manifests (manifest.ts); free works are DYNAMIC — created at runtime —
 * so they live in a small `works.json` in the library ROOT, read/written
 * through the pinned LibraryStorage interface (the registry travels with the
 * user's library folder, exactly like the chapter files it indexes, so a
 * Drive-synced library carries its own free works).
 *
 * Storage addressing: LibraryStorage keys everything by (workId, file) under
 * `<libraryRoot>/<workId>/<file>` — the reserved pseudo-id "." lands
 * `works.json` in the library root itself on every backend (Tauri resolves
 * `library/./works.json`; the browser harness's localStorage key is just a
 * string). No real work may claim this id (slugForTitle can't produce it).
 *
 * Registry shape (JSON): { "version": 1, "works": [ { "id", "title",
 * "author"?, "language"?, "citation_scheme" } ] }. A stored `books` key is
 * from the retired container-SLOT model (Books that were hand-made lists of
 * chapter slots, before Books became boundaries over the outline); nothing has
 * read it since, so it is neither parsed nor written now, and the next write
 * of the registry drops it from every record. Unreadable files and invalid entries
 * are SKIPPED with a console warning, never a hard failure — a registry
 * defect must not take down the whole library rail.
 */

import type { SchemeId } from '../citation/types';
import { getScheme, isKnownScheme } from '../citation/registry';
import { libraryStorage } from '../library/storage';
import type { LibraryStorage } from '../library/storage';
import type { WorkManifest, OriginalLanguage } from './manifest';
import type { WorkLevel } from './profile';
import { DEFAULT_PROFILE, sanitizeLevels } from './profile';
import { sanitizeContainers } from './bookContainers';
import type { BookContainer } from './bookContainers';

/** The reserved storage id whose "work dir" is the library root itself. */
export const FREE_WORKS_STORAGE_ID = '.';
const REGISTRY_FILE = 'works.json';
const REGISTRY_VERSION = 1;

export interface FreeWorkRecord {
  id: string;
  title: string;
  /** Work author, omitted when the work is anonymous. */
  author?: string;
  /** Free-text original language, e.g. "Greek", "German" (optional). */
  language?: string;
  /** A document-spine scheme ('paragraph' | 'plain-line'). */
  scheme: SchemeId;
  /** The work's organization profile levels (D8 heading tools). Absent =
   * the work uses DEFAULT_PROFILE; sanitized on read. */
  levels?: WorkLevel[];
  /** Book boundaries over the document's root outline nodes. They organize the
   * rail without adding Book rows to the translated document. */
  bookContainers?: BookContainer[];
}

interface RawRegistryEntry {
  id?: unknown;
  title?: unknown;
  author?: unknown;
  language?: unknown;
  citation_scheme?: unknown;
  levels?: unknown;
  bookContainers?: unknown;
}

/** Validate one parsed registry entry; null (skip) when it isn't usable. */
function recordFromRaw(raw: unknown): FreeWorkRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const v = raw as RawRegistryEntry;
  if (typeof v.id !== 'string' || v.id.length === 0 || v.id === FREE_WORKS_STORAGE_ID) return null;
  if (typeof v.title !== 'string' || v.title.length === 0) return null;
  if (typeof v.citation_scheme !== 'string' || !isKnownScheme(v.citation_scheme)) return null;
  // Only document-spine schemes belong here (capability gate, not scheme id).
  if (getScheme(v.citation_scheme).spineSource !== 'document') return null;
  const record: FreeWorkRecord = { id: v.id, title: v.title, scheme: v.citation_scheme };
  if (typeof v.author === 'string' && v.author.trim().length > 0) {
    record.author = v.author.trim();
  }
  if (typeof v.language === 'string' && v.language.trim().length > 0) {
    record.language = v.language.trim();
  }
  const levels = sanitizeLevels(v.levels);
  if (levels) record.levels = levels;
  const bookContainers = sanitizeContainers(v.bookContainers);
  if (bookContainers) record.bookContainers = bookContainers;
  return record;
}

/** All valid registry records (empty when no registry exists yet). */
export async function listFreeWorkRecords(
  storage: LibraryStorage = libraryStorage(),
): Promise<FreeWorkRecord[]> {
  const raw = await storage.read(FREE_WORKS_STORAGE_ID, REGISTRY_FILE);
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn('freeWorks: works.json is not valid JSON — treating as empty', err);
    return [];
  }
  const works = (parsed as { works?: unknown })?.works;
  if (!Array.isArray(works)) {
    console.warn('freeWorks: works.json has no "works" list — treating as empty');
    return [];
  }
  const out: FreeWorkRecord[] = [];
  const seen = new Set<string>();
  for (const entry of works) {
    const record = recordFromRaw(entry);
    if (!record) {
      console.warn('freeWorks: skipping invalid works.json entry', entry);
      continue;
    }
    if (seen.has(record.id)) continue; // first entry wins
    seen.add(record.id);
    out.push(record);
  }
  return out;
}

/**
 * The WorkManifest the app programs against for a free work. Bookless:
 * a single unlabeled book (busse-paragraph precedent — bookLabel returns
 * ''). `originalLanguage` stays the narrow 'greek' | 'latin' type; the
 * free-text language maps onto it only when it IS one of those (the record
 * keeps the user's exact wording either way).
 */
export function freeWorkManifest(record: FreeWorkRecord): WorkManifest {
  const manifest: WorkManifest = {
    id: record.id,
    title: record.title,
    author: record.author ?? '',
    scheme: record.scheme,
    books: [{ n: 1, label: '' }],
    profile: record.levels ? { levels: record.levels } : DEFAULT_PROFILE,
  };
  if (record.bookContainers && record.bookContainers.length > 0) {
    manifest.documentBookContainers = record.bookContainers;
  }
  const lang = record.language?.toLowerCase();
  if (lang === 'greek' || lang === 'latin') {
    manifest.originalLanguage = lang as OriginalLanguage;
  }
  // The user's exact wording rides along for prompt wording (D8 §7 Phase E2):
  // assist names the actual language ("German") or none, never a false
  // 'greek' fallback.
  if (record.language !== undefined) {
    manifest.language = record.language;
  }
  return manifest;
}

/** All free works as manifests, ready to append to listWorks()'s output. */
export async function listFreeWorks(
  storage: LibraryStorage = libraryStorage(),
): Promise<WorkManifest[]> {
  return (await listFreeWorkRecords(storage)).map(freeWorkManifest);
}

/**
 * Add (or, by id, replace) one record in the registry. Read-modify-write; the
 * caller serializes calls (the dialog creates one work at a time).
 */
export async function registerFreeWork(
  record: FreeWorkRecord,
  storage: LibraryStorage = libraryStorage(),
): Promise<void> {
  const existing = await listFreeWorkRecords(storage);
  const works = existing.filter((w) => w.id !== record.id);
  works.push(record);
  await writeRegistry(works, storage);
}

/** The registry file's on-disk shape — one writer, so every caller agrees. */
async function writeRegistry(works: FreeWorkRecord[], storage: LibraryStorage): Promise<void> {
  const payload = {
    version: REGISTRY_VERSION,
    works: works.map((w) => ({
      id: w.id,
      title: w.title,
      ...(w.author ? { author: w.author } : {}),
      ...(w.language ? { language: w.language } : {}),
      citation_scheme: w.scheme,
      ...(w.levels && w.levels.length > 0 ? { levels: w.levels } : {}),
      ...(w.bookContainers?.length ? { bookContainers: w.bookContainers } : {}),
    })),
  };
  await storage.write(FREE_WORKS_STORAGE_ID, REGISTRY_FILE, JSON.stringify(payload, null, 2) + '\n');
}

/**
 * Remove a free work: its registry entry first, then every file it owns.
 *
 * That order is deliberate. Dropping the registry entry is what makes the work
 * gone as far as the app is concerned, and if the file delete then fails the
 * user is left with orphaned files rather than a work in the rail whose text
 * has been deleted out from under it.
 *
 * A work id that isn't in the registry still has its files removed — the point
 * is to leave nothing behind.
 */
export async function removeFreeWork(
  workId: string,
  storage: LibraryStorage = libraryStorage(),
): Promise<void> {
  await unregisterFreeWork(workId, storage);
  await storage.remove(workId);
}

/** Drop one record from the registry. Unknown ids are a no-op. */
export async function unregisterFreeWork(
  workId: string,
  storage: LibraryStorage = libraryStorage(),
): Promise<void> {
  const existing = await listFreeWorkRecords(storage);
  const works = existing.filter((w) => w.id !== workId);
  if (works.length === existing.length) return;
  await writeRegistry(works, storage);
}

/**
 * Update just the organization-profile levels of an existing free work
 * (D8 heading tools "Manage levels…"). Read-modify-write on top of
 * registerFreeWork; a no-op when the work id isn't a known free work. Passing
 * levels that sanitize to nothing clears them (the work reverts to
 * DEFAULT_PROFILE).
 */
export async function updateFreeWorkLevels(
  workId: string,
  levels: WorkLevel[],
  storage: LibraryStorage = libraryStorage(),
): Promise<void> {
  const record = (await listFreeWorkRecords(storage)).find((w) => w.id === workId);
  if (!record) return;
  const sanitized = sanitizeLevels(levels);
  await registerFreeWork({ ...record, levels: sanitized }, storage);
}

/**
 * Update the author of an existing free work. Empty text clears the author;
 * an unknown work id is a no-op.
 */
export async function updateFreeWorkAuthor(
  workId: string,
  author: string,
  storage: LibraryStorage = libraryStorage(),
): Promise<void> {
  const record = (await listFreeWorkRecords(storage)).find((w) => w.id === workId);
  if (!record) return;
  const next: FreeWorkRecord = { ...record };
  const trimmed = author.trim();
  if (trimmed) next.author = trimmed;
  else delete next.author;
  await registerFreeWork(next, storage);
}

/**
 * Rename an existing free work.
 *
 * The work's ID is not touched, and must not be: it is the name of the folder
 * the chapter files live in, so re-slugging a renamed title would strand every
 * one of them. A title is a label; the id is an address.
 *
 * An empty title is ignored rather than stored — a work in the rail with no
 * name is a row the user cannot identify or click.
 */
export async function updateFreeWorkTitle(
  workId: string,
  title: string,
  storage: LibraryStorage = libraryStorage(),
): Promise<void> {
  const trimmed = title.trim();
  if (trimmed.length === 0) return;
  const record = (await listFreeWorkRecords(storage)).find((w) => w.id === workId);
  if (!record) return;
  await registerFreeWork({ ...record, title: trimmed }, storage);
}

/**
 * Update the original language of an existing free work. Empty text clears it;
 * an unknown work id is a no-op.
 *
 * The language is not decoration: freeWorkManifest turns "Greek"/"Latin" into
 * the manifest's originalLanguage, which is what decides the dictionary and
 * parser a work gets, and the wording rides into the AI prompts and the
 * bilingual export filename. Until now it could only be set when the document
 * was created, so a work imported under the wrong language stayed there.
 */
export async function updateFreeWorkLanguage(
  workId: string,
  language: string,
  storage: LibraryStorage = libraryStorage(),
): Promise<void> {
  const record = (await listFreeWorkRecords(storage)).find((w) => w.id === workId);
  if (!record) return;
  const next: FreeWorkRecord = { ...record };
  const trimmed = language.trim();
  if (trimmed) next.language = trimmed;
  else delete next.language;
  await registerFreeWork(next, storage);
}

/**
 * Persist the Book boundaries for an existing document work. The registry read
 * sanitizes first, and an empty or unusable result removes the key so old or
 * corrupt data cannot leave the rail in a half-structured state.
 */
export async function updateFreeWorkBookContainers(
  workId: string,
  containers: BookContainer[],
  storage: LibraryStorage = libraryStorage(),
): Promise<void> {
  const record = (await listFreeWorkRecords(storage)).find((w) => w.id === workId);
  if (!record) return;
  const sanitized = sanitizeContainers(containers);
  const next: FreeWorkRecord = { ...record };
  if (sanitized) next.bookContainers = sanitized;
  else delete next.bookContainers;
  await registerFreeWork(next, storage);
}

