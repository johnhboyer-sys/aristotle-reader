/**
 * Corpus store — loads the machine-generated, read-only-at-runtime corpus for
 * a work (spine.json + chapters.json) and caches it per work.
 *
 * Locations (decided architecture):
 *   Tauri:    $APPDATA/corpus/<workId>/spine.json + chapters.json
 *   Browser:  /corpus/<workId>/*.json (vite dev middleware over .dev-corpus/)
 *
 * A missing corpus is a NORMAL state, not an error: `corpusStatus` reports
 * 'absent' and the UI degrades to a quiet "Not on this Mac yet" line. Real
 * read/parse problems are logged to the console for debugging but still
 * surface to the app only as 'absent' — a non-technical user never sees a
 * stack trace or half-loaded work.
 */

import { isTauri } from '../runtime';
import type { Spine } from '../corpus/spine';
import type { ChapterEntry } from '../corpus/chapters';

export type CorpusStatus = 'ready' | 'absent';

export interface WorkCorpus {
  spine: Spine;
  chapters: ChapterEntry[];
}

async function readCorpusFileTauri(workId: string, file: string): Promise<string | null> {
  const fs = await import('@tauri-apps/plugin-fs');
  const path = `corpus/${workId}/${file}`;
  try {
    if (!(await fs.exists(path, { baseDir: fs.BaseDirectory.AppData }))) return null;
    return await fs.readTextFile(path, { baseDir: fs.BaseDirectory.AppData });
  } catch (err) {
    console.warn(`corpus: failed reading ${path} from app data`, err);
    return null;
  }
}

async function readCorpusFileBrowser(workId: string, file: string): Promise<string | null> {
  try {
    const res = await fetch(`/corpus/${workId}/${file}`);
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    console.warn(`corpus: failed fetching /corpus/${workId}/${file}`, err);
    return null;
  }
}

async function readCorpusFile(workId: string, file: string): Promise<string | null> {
  if (!isTauri()) return readCorpusFileBrowser(workId, file);
  const fromAppData = await readCorpusFileTauri(workId, file);
  if (fromAppData !== null) return fromAppData;
  // `tauri dev` serves the frontend from the vite dev server, so the same
  // /corpus middleware the browser harness uses is reachable — fall back to it
  // when app data has no corpus yet. Dev-only: in a packaged build
  // import.meta.env.DEV is false and 'absent' stays 'absent'.
  if (import.meta.env.DEV) return readCorpusFileBrowser(workId, file);
  return null;
}

/** Minimal shape validation — enough to keep garbage from reaching the UI. */
function validateCorpus(spine: unknown, chapters: unknown): WorkCorpus | null {
  const s = spine as Spine;
  if (typeof s !== 'object' || s === null || !Array.isArray(s.segments)) return null;
  if (!Array.isArray(chapters)) return null;
  for (const c of chapters as ChapterEntry[]) {
    if (typeof c !== 'object' || c === null) return null;
    if (typeof c.book !== 'number' || typeof c.column !== 'string') return null;
  }
  return { spine: s, chapters: chapters as ChapterEntry[] };
}

const cache = new Map<string, Promise<WorkCorpus | null>>();

async function loadUncached(workId: string): Promise<WorkCorpus | null> {
  const [spineText, chaptersText] = await Promise.all([
    readCorpusFile(workId, 'spine.json'),
    readCorpusFile(workId, 'chapters.json'),
  ]);
  if (spineText === null || chaptersText === null) return null;
  try {
    const corpus = validateCorpus(JSON.parse(spineText), JSON.parse(chaptersText));
    if (!corpus) console.warn(`corpus: ${workId} files present but malformed — treating as absent`);
    return corpus;
  } catch (err) {
    console.warn(`corpus: ${workId} files present but unparsable — treating as absent`, err);
    return null;
  }
}

/**
 * Load a work's corpus, cached per work. Resolves null when the corpus is not
 * on this machine (or unreadable) — never throws.
 */
export function loadCorpus(workId: string): Promise<WorkCorpus | null> {
  let p = cache.get(workId);
  if (!p) {
    p = loadUncached(workId);
    cache.set(workId, p);
  }
  return p;
}

/** 'ready' when both spine.json and chapters.json load and parse; else 'absent'. */
export async function corpusStatus(workId: string): Promise<CorpusStatus> {
  return (await loadCorpus(workId)) !== null ? 'ready' : 'absent';
}

/** Drop the cached load (e.g. after onboarding writes a new corpus dir). */
export function invalidateCorpus(workId?: string): void {
  if (workId === undefined) cache.clear();
  else cache.delete(workId);
}
