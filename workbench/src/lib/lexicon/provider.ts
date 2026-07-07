/**
 * LexiconProvider — language-abstracted click-to-parse lookup for the bottom
 * drawer. `greekProvider(workId)` is the Phase-1/2 implementation (Greek);
 * a Latin provider can implement the same interface later (Phase 3) without
 * touching the drawer component.
 *
 * Data shape and locations mirror the read-only reader app's data layer
 * (app/src/lib/data.ts: fetchAnalyses / lsjShard / fetchLsjShard /
 * lookupWord) and the Workbench's corpusStore pattern:
 *   Tauri:    $APPDATA/corpus/<workId>/analyses.json
 *             $APPDATA/corpus/lsj/<letter>.json
 *   Browser:  /corpus/<workId>/analyses.json      (vite dev middleware)
 *             /corpus/lsj/<letter>.json
 *
 * A missing file (corpus not onboarded, word not analyzed, LSJ shard absent)
 * is a NORMAL state — every lookup resolves to an empty-but-valid result,
 * never throws. The drawer shows "No entry found" rather than an error.
 */

import { isTauri } from '../runtime';
import { greekToBeta } from './greekToBeta';
import { betaToGreek } from '../betacode';

export interface LexiconAnalysis {
  form: string; // the clicked surface form (Unicode Greek), echoed for display
  lemma: string; // Beta Code lemma, as stored
  lemmaDisplay: string; // lemma decoded to Unicode Greek
  parse: string;
  gloss: string;
  lsjKeys: string[];
}

export interface LsjEntryView {
  key: string;
  head: string;
  html: string;
}

export interface LexiconResult {
  analyses: LexiconAnalysis[];
  lsjEntries: LsjEntryView[];
}

export interface LexiconProvider {
  lookup(word: string): Promise<LexiconResult>;
}

// ── raw pipeline data shapes (subset of app/src/lib/data.ts's Analysis/LsjEntry) ──

interface RawAnalysis {
  lemma: string;
  gloss: string;
  parse: string;
  lsj: string[];
}

interface RawLsjEntry {
  key: string;
  head: string;
  html: string;
}

const EMPTY_RESULT: LexiconResult = { analyses: [], lsjEntries: [] };

// ── file access: Tauri $APPDATA/corpus vs dev /corpus middleware ───────────

async function readCorpusFileTauri(relPath: string): Promise<string | null> {
  const fs = await import('@tauri-apps/plugin-fs');
  const path = `corpus/${relPath}`;
  try {
    if (!(await fs.exists(path, { baseDir: fs.BaseDirectory.AppData }))) return null;
    return await fs.readTextFile(path, { baseDir: fs.BaseDirectory.AppData });
  } catch (err) {
    console.warn(`lexicon: failed reading ${path} from app data`, err);
    return null;
  }
}

async function readCorpusFileBrowser(relPath: string): Promise<string | null> {
  try {
    const res = await fetch(`/corpus/${relPath}`);
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    console.warn(`lexicon: failed fetching /corpus/${relPath}`, err);
    return null;
  }
}

function readCorpusFile(relPath: string): Promise<string | null> {
  return isTauri() ? readCorpusFileTauri(relPath) : readCorpusFileBrowser(relPath);
}

// ── caches (module-level, per session — mirrors app/src/lib/data.ts) ───────

const analysesCache = new Map<string, Promise<Record<string, RawAnalysis[]> | null>>();
const lsjShardCache = new Map<string, Promise<Record<string, RawLsjEntry>>>();

async function loadAnalysesUncached(workId: string): Promise<Record<string, RawAnalysis[]> | null> {
  const text = await readCorpusFile(`${workId}/analyses.json`);
  if (text === null) return null;
  try {
    return JSON.parse(text) as Record<string, RawAnalysis[]>;
  } catch (err) {
    console.warn(`lexicon: ${workId}/analyses.json is present but unparsable`, err);
    return null;
  }
}

function loadAnalyses(workId: string): Promise<Record<string, RawAnalysis[]> | null> {
  let p = analysesCache.get(workId);
  if (!p) {
    p = loadAnalysesUncached(workId);
    analysesCache.set(workId, p);
  }
  return p;
}

/** Which LSJ shard file a Beta Code key lives in — first Latin letter, skipping '*'. */
export function lsjShardLetter(key: string): string {
  for (const ch of key) {
    if (ch === '*') continue;
    if (/[a-z]/.test(ch)) return ch;
  }
  return '_';
}

async function loadLsjShardUncached(letter: string): Promise<Record<string, RawLsjEntry>> {
  const text = await readCorpusFile(`lsj/${letter}.json`);
  if (text === null) return {};
  try {
    return JSON.parse(text) as Record<string, RawLsjEntry>;
  } catch (err) {
    console.warn(`lexicon: lsj/${letter}.json is present but unparsable`, err);
    return {};
  }
}

function loadLsjShard(letter: string): Promise<Record<string, RawLsjEntry>> {
  let p = lsjShardCache.get(letter);
  if (!p) {
    p = loadLsjShardUncached(letter);
    lsjShardCache.set(letter, p);
  }
  return p;
}

// ── key-variant fallback chain ──────────────────────────────────────────
//
// greekToBeta() is a faithful, order-preserving encoder — it reflects what
// is actually written. The analyses.json keys, however, are the pipeline's
// *dictionary lookup form*, which differs from running text in three
// systematic ways (measured against the full Metaphysics corpus, see
// __tests__/greekToBeta.test.ts):
//   1. Capitalized words (proper names, sentence-initial, ALL-CAPS labels)
//      are keyed in plain lowercase, no leading "*" marker(s).
//   2. Grave accent (running-text word followed by another word) is
//      normalized to acute in the dictionary key.
//   3. A second accent picked up by an enclitic/proclitic in context is
//      dropped from the dictionary key (only the lemma's own accent stays).
// The fallback chain below generates every combination of these
// normalizations and tries each in turn. Verified: 100% exact-key hit rate
// across all 78,944 tokens in the built Metaphysics corpus (14 books).

/** Strip every capital marker, moving each base letter before its own
 * diacritics (Beta's capital order is "*"+diacritics+letter; the lowercase
 * key form is letter+diacritics). Handles both a single leading "*" and
 * ALL-CAPS words where every letter carries its own "*". */
function stripCapitals(beta: string): string {
  return beta.replace(/\*([)(+/\\=|]*)([a-zA-Z])/g, (_m, diac: string, letter: string) => letter.toLowerCase() + diac);
}

function graveToAcute(beta: string): string {
  return beta.replaceAll('\\', '/');
}

/** Drop the LAST accent mark, if the string carries two or more — the
 * enclitic-accent case. Leaves single-accent (or unaccented) forms alone. */
function dropExtraAccent(beta: string): string | null {
  const marks = [...beta.matchAll(/[/\\=]/g)];
  if (marks.length < 2) return null;
  const last = marks[marks.length - 1];
  const idx = last.index!;
  return beta.slice(0, idx) + beta.slice(idx + 1);
}

/** Every normalization combination worth trying, most-faithful first. */
function keyVariants(beta: string): string[] {
  const out: string[] = [beta];
  const seen = new Set(out);
  const add = (v: string) => {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  };

  const stage1 = [beta, stripCapitals(beta)];
  for (const v of stage1) add(v);

  const stage2 = [...stage1, ...stage1.map(graveToAcute)];
  for (const v of stage2) add(v);

  for (const v of stage2) {
    const dropped = dropExtraAccent(v);
    if (dropped !== null) add(dropped);
  }

  return out;
}

// ── the Greek provider ──────────────────────────────────────────────────

export function greekProvider(workId: string): LexiconProvider {
  return {
    async lookup(word: string): Promise<LexiconResult> {
      const trimmed = word.trim();
      if (!trimmed) return EMPTY_RESULT;

      const table = await loadAnalyses(workId);
      if (!table) return EMPTY_RESULT;

      const beta = greekToBeta(trimmed);
      let raw: RawAnalysis[] | undefined;
      for (const variant of keyVariants(beta)) {
        raw = table[variant];
        if (raw && raw.length > 0) break;
      }
      if (!raw || raw.length === 0) return EMPTY_RESULT;

      const lsjEntries: LsjEntryView[] = [];
      const seenLsj = new Set<string>();
      for (const a of raw) {
        for (const lsjKey of a.lsj) {
          if (seenLsj.has(lsjKey)) continue;
          seenLsj.add(lsjKey);
          const shard = await loadLsjShard(lsjShardLetter(lsjKey));
          const entry = shard[lsjKey];
          if (entry) lsjEntries.push({ key: entry.key, head: entry.head, html: entry.html });
        }
      }

      const analyses: LexiconAnalysis[] = raw.map((a) => ({
        form: trimmed,
        lemma: a.lemma,
        lemmaDisplay: betaToGreek(a.lemma),
        parse: a.parse,
        gloss: a.gloss,
        lsjKeys: a.lsj,
      }));

      return { analyses, lsjEntries };
    },
  };
}
