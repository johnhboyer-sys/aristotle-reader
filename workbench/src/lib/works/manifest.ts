/**
 * Work-manifest loading. Manifests are YAML files under
 * src/lib/works/manifests/, imported via Vite `?raw` and parsed with
 * js-yaml into WorkMeta (the citation/types.ts contract) plus a few
 * work-specific extra fields (original_language, tlg_author, tlg_work).
 *
 * The `.yaml` files are the single source of truth. `parseManifest` is
 * exported so tests can feed it the same YAML text read from disk directly
 * (Vite's `?raw` transform is not guaranteed to behave identically under
 * every test runner configuration) without duplicating manifest content.
 */

import yaml from 'js-yaml';
import type { SchemeId, WorkMeta } from '../citation/types';
import { isKnownScheme } from '../citation/registry';
import type { WorkProfile } from './profile';
import type { BookContainer } from './bookContainers';
import type { ChapterContainer } from './chapterContainers';

import metaphysicsYaml from './manifests/metaphysics.yaml?raw';
import posteriorAnalyticsYaml from './manifests/posterior-analytics.yaml?raw';

export type OriginalLanguage = 'greek' | 'latin';

/** One chapter slot inside a free work's explicit Book container. `n` is
 * positional (1-based) and drives the chapter file name; `label` is the
 * display name ("Question 2"). A slot can exist with no file on disk yet — an
 * empty chapter awaiting an import. */
export interface DocumentChapterSlot {
  n: number;
  label: string;
}

/** A free work's explicit Book container (D8 structure tools). `n` is
 * positional (1-based) and drives the chapter file name's book part; `chapters`
 * may be empty (a Book created before any chapters are added). */
export interface DocumentBook {
  n: number;
  label: string;
  chapters: DocumentChapterSlot[];
}

/** WorkMeta plus the extra fields carried in the manifest YAML. */
export interface WorkManifest extends WorkMeta {
  originalLanguage?: OriginalLanguage;
  /** Free-text source-language label, VERBATIM as the user typed it (free
   * works only — built-in manifests use `originalLanguage`). Threaded into
   * the AI-assist prompts so a German document is never framed as Greek. */
  language?: string;
  tlgAuthor?: string;
  tlgWork?: string;
  /** Organization profile (document-spine free works only, D8 heading tools):
   * the work's named heading tiers + their navigation roles. Absent on built-in
   * works; free works get their saved profile or the default (works/profile.ts). */
  profile?: WorkProfile;
  /** Explicit Book/Chapter containers (document-spine free works with the D8
   * structure tools). Absent = a single-document "bookless" free work (the
   * legacy shape; `books` is then `[{ n: 1, label: '' }]`). When present, `books`
   * mirrors these entries' `n`/`label` and this carries the per-book chapter
   * slots the rail, editor, and compiler navigate. */
  documentBooks?: DocumentBook[];
  /** Book boundaries over the document's marker-built root outline nodes.
   * Unlike legacy `documentBooks`, these containers never create text or files. */
  documentBookContainers?: BookContainer[];
  /** Chapter boundaries inside the document, each at a ROW (works/chapterContainers).
   * Navigation only, same contract as the Books: nothing is marked, so no line
   * of text is turned into a title. */
  documentChapterContainers?: ChapterContainer[];
}

interface RawManifestBook {
  n: number;
  label: string;
}

interface RawManifest {
  id: string;
  title: string;
  author: string;
  original_language?: string;
  citation_scheme: string;
  tlg_author?: string;
  tlg_work?: string;
  books: RawManifestBook[];
}

function isRawManifestBook(value: unknown): value is RawManifestBook {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.n === 'number' && typeof v.label === 'string';
}

function assertRawManifest(value: unknown, source: string): asserts value is RawManifest {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`work manifest ${source}: expected a YAML mapping at the top level`);
  }
  const v = value as Record<string, unknown>;
  const requiredStrings: (keyof RawManifest)[] = ['id', 'title', 'author', 'citation_scheme'];
  for (const key of requiredStrings) {
    if (typeof v[key] !== 'string' || (v[key] as string).length === 0) {
      throw new Error(`work manifest ${source}: missing or invalid required field "${key}"`);
    }
  }
  if (!Array.isArray(v.books) || v.books.length === 0 || !v.books.every(isRawManifestBook)) {
    throw new Error(`work manifest ${source}: "books" must be a non-empty list of { n, label }`);
  }
  if (v.original_language !== undefined && typeof v.original_language !== 'string') {
    throw new Error(`work manifest ${source}: "original_language" must be a string if present`);
  }
  if (v.tlg_author !== undefined && typeof v.tlg_author !== 'string') {
    throw new Error(`work manifest ${source}: "tlg_author" must be a string if present`);
  }
  if (v.tlg_work !== undefined && typeof v.tlg_work !== 'string') {
    throw new Error(`work manifest ${source}: "tlg_work" must be a string if present`);
  }
}

const KNOWN_LANGUAGES: OriginalLanguage[] = ['greek', 'latin'];

/**
 * Parse a work-manifest YAML string into a validated WorkManifest.
 * `source` is used only for error messages (e.g. the manifest's file name).
 */
export function parseManifest(raw: string, source = '<manifest>'): WorkManifest {
  const parsed = yaml.load(raw);
  assertRawManifest(parsed, source);

  if (!isKnownScheme(parsed.citation_scheme)) {
    throw new Error(
      `work manifest ${source}: unknown citation_scheme "${parsed.citation_scheme}"`
    );
  }
  if (parsed.original_language !== undefined && !KNOWN_LANGUAGES.includes(parsed.original_language as OriginalLanguage)) {
    throw new Error(
      `work manifest ${source}: unknown original_language "${parsed.original_language}"`
    );
  }

  const scheme: SchemeId = parsed.citation_scheme;
  const books = [...parsed.books]
    .sort((a, b) => a.n - b.n)
    .map((b) => ({ n: b.n, label: b.label }));

  const manifest: WorkManifest = {
    id: parsed.id,
    title: parsed.title,
    author: parsed.author,
    scheme,
    books,
  };
  if (parsed.original_language !== undefined) {
    manifest.originalLanguage = parsed.original_language as OriginalLanguage;
  }
  if (parsed.tlg_author !== undefined) manifest.tlgAuthor = parsed.tlg_author;
  if (parsed.tlg_work !== undefined) manifest.tlgWork = parsed.tlg_work;
  return manifest;
}

// ── static registry of built-in works ───────────────────────────────────────

const MANIFEST_SOURCES: Record<string, string> = {
  metaphysics: metaphysicsYaml,
  'posterior-analytics': posteriorAnalyticsYaml,
};

let cache: Map<string, WorkManifest> | null = null;

function loadAll(): Map<string, WorkManifest> {
  if (cache) return cache;
  const map = new Map<string, WorkManifest>();
  for (const [id, raw] of Object.entries(MANIFEST_SOURCES)) {
    const manifest = parseManifest(raw, `${id}.yaml`);
    if (manifest.id !== id) {
      throw new Error(
        `work manifest ${id}.yaml: manifest id "${manifest.id}" does not match file name "${id}"`
      );
    }
    map.set(id, manifest);
  }
  cache = map;
  return map;
}

/** Look up a built-in work manifest by id. Throws if the id is unknown. */
export function getWork(id: string): WorkManifest {
  const work = loadAll().get(id);
  if (!work) {
    throw new Error(`unknown work: ${JSON.stringify(id)}`);
  }
  return work;
}

/** List all built-in work manifests. */
export function listWorks(): WorkManifest[] {
  return [...loadAll().values()];
}
