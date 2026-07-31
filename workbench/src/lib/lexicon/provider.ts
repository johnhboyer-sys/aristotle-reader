/**
 * LexiconProvider — language-abstracted click-to-parse lookup for the bottom
 * drawer. `greekProvider(workId)` is the Greek implementation and
 * `latinProvider()` the Latin one; the drawer picks between them by the work's
 * language and knows nothing else about either.
 *
 * Data shape and locations mirror the read-only reader app's data layer
 * (app/src/lib/data.ts: fetchAnalyses / lsjShard / fetchLsjShard /
 * lookupWord) and the Workbench's corpusStore pattern:
 *   Tauri:    $APPDATA/corpus/<workId>/analyses.json
 *             $APPDATA/corpus/lsj/<letter>.json   (Greek — LSJ)
 *             $APPDATA/corpus/ls/<letter>.json    (Latin — Lewis & Short)
 *   Browser:  /corpus/<workId>/analyses.json      (vite dev middleware)
 *             /corpus/lsj/<letter>.json, /corpus/ls/<letter>.json
 *
 * The two languages differ in where MORPHOLOGY comes from, and deliberately so:
 * Greek reads a precomputed per-work analyses.json that ships with the app,
 * which is why Greek lookup only works for a known work; Latin reads the user's
 * own Diogenes morphology at lookup time (see latinAnalyses.ts), so a Latin
 * text the app has never seen still parses. The DICTIONARY half is the same
 * shape for both: shared per-letter shards under corpus/.
 *
 * A missing file (corpus not onboarded, word not analyzed, shard absent) is a
 * NORMAL state — every lookup resolves to an empty-but-valid result, never
 * throws. The drawer shows "No entry found" rather than an error.
 */

import { isTauri } from '../runtime';
import { greekToBeta } from './greekToBeta';
import { betaToGreek } from '../betacode';
import { isCapitalizedSurface, latinLookupVariants, toLatinKey } from './latinKey';
import { lookupAnalyses } from './morphology';
import { packFor } from './packs';
import type { LexiconLanguage, LexiconPack } from './packs';

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

/** Read one dictionary shard out of an installed pack (an absolute path). */
async function readPackShard(pack: LexiconPack, letter: string): Promise<string | null> {
  try {
    const fs = await import('@tauri-apps/plugin-fs');
    const path = `${pack.path}/${pack.shardDir}/${letter}.json`;
    if (!(await fs.exists(path))) return null;
    return await fs.readTextFile(path);
  } catch (err) {
    console.warn(`lexicon: could not read shard ${letter} from the ${pack.language} pack`, err);
    return null;
  }
}

async function loadDictShardUncached(
  language: LexiconLanguage,
  letter: string,
): Promise<Record<string, RawLsjEntry>> {
  const pack = await packFor(language);
  // The pack is the real source. The corpus/ path below is the dev harness's
  // served shards (and any pre-pack install's leftovers) — a fallback, not a
  // parallel feature: a packaged build ships no shards there at all.
  const text = pack
    ? await readPackShard(pack, letter)
    : await readCorpusFile(`${language === 'grc' ? 'lsj' : 'ls'}/${letter}.json`);
  if (text === null) return {};
  try {
    return JSON.parse(text) as Record<string, RawLsjEntry>;
  } catch (err) {
    console.warn(`lexicon: the ${language} '${letter}' shard is present but unparsable`, err);
    return {};
  }
}

/**
 * One shard directory per dictionary — 'lsj' for Greek (Liddell & Scott),
 * 'ls' for Latin (Lewis & Short). They are kept apart because the two key
 * spaces can collide (Beta Code vs Latin with quantity marks); this mirrors
 * the pipeline's own SHARD_DIR convention.
 */
function loadDictShard(
  language: LexiconLanguage,
  letter: string,
): Promise<Record<string, RawLsjEntry>> {
  const cacheKey = `${language}:${letter}`;
  let p = lsjShardCache.get(cacheKey);
  if (!p) {
    p = loadDictShardUncached(language, letter);
    lsjShardCache.set(cacheKey, p);
  }
  return p;
}

/** Drop cached dictionary/morphology reads — call after a pack changes. */
export function invalidateLexiconCaches(): void {
  lsjShardCache.clear();
  lsBaseIndexCache.clear();
  analysesCache.clear();
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

/**
 * Greek lookup. `workId` selects the work's own precomputed analyses table
 * when there is one — that ships with an onboarded corpus work and is the
 * cheapest path — but it is not required: with the Greek pack installed, a
 * word from ANY text resolves against the complete Morpheus table, which is
 * what lets a document pasted in from Scaife parse like a corpus work.
 *
 * Order matters and is deliberate: the per-work table first (already loaded,
 * carries the pipeline's own LSJ key mapping), the pack second. They are the
 * same underlying Morpheus data, so this is a cost ordering, not a
 * correctness one.
 */
export function greekProvider(workId: string): LexiconProvider {
  return {
    async lookup(word: string): Promise<LexiconResult> {
      const trimmed = word.trim();
      if (!trimmed) return EMPTY_RESULT;

      const beta = greekToBeta(trimmed);
      const variants = keyVariants(beta);

      // 1. The work's own analyses, when this is an onboarded corpus work.
      const table = await loadAnalyses(workId);
      if (table) {
        for (const variant of variants) {
          const raw = table[variant];
          if (raw && raw.length > 0) return greekResultFromWorkTable(trimmed, raw);
        }
      }

      // 2. The pack's complete table — any author, no corpus needed. Its
      //    analyses carry no LSJ key, so entries are found by lemma the same
      //    way the Latin side does.
      const packAnalyses = await lookupAnalyses('grc', variants);
      if (packAnalyses.length === 0) return EMPTY_RESULT;

      const lsjEntries = await dictEntriesForLemmas(
        'grc',
        packAnalyses.map((a) => a.lemma),
      );
      return {
        analyses: packAnalyses.map((a) => ({
          form: trimmed,
          lemma: a.lemma,
          lemmaDisplay: betaToGreek(dictBaseKey(a.lemma)),
          parse: a.parse,
          gloss: a.gloss,
          lsjKeys: [],
        })),
        lsjEntries,
      };
    },
  };
}

/** Build a result from a work's own analyses table, which carries LSJ keys. */
async function greekResultFromWorkTable(
  surface: string,
  raw: RawAnalysis[],
): Promise<LexiconResult> {
  const lsjEntries: LsjEntryView[] = [];
  const seenLsj = new Set<string>();
  for (const a of raw) {
    for (const lsjKey of a.lsj) {
      if (seenLsj.has(lsjKey)) continue;
      seenLsj.add(lsjKey);
      const shard = await loadDictShard('grc', lsjShardLetter(lsjKey));
      const entry = shard[lsjKey];
      if (entry) lsjEntries.push({ key: entry.key, head: entry.head, html: entry.html });
    }
  }
  return {
    analyses: raw.map((a) => ({
      form: surface,
      lemma: a.lemma,
      lemmaDisplay: betaToGreek(a.lemma),
      parse: a.parse,
      gloss: a.gloss,
      lsjKeys: a.lsj,
    })),
    lsjEntries,
  };
}

// ── dictionary matching, shared by both languages ──────────────────────────
//
// A dictionary heads its entries differently from a morphology table. Lewis &
// Short writes `va^co`, `va_gi_na`, `vallus1`, where Morpheus says `vaco`,
// `vagina`, `vallus`; LSJ marks homonyms `ei)mi/1`, `ei)mi/2` where Morpheus
// says `ei)mi/`. So the two sides are matched on a STRIPPED form rather than by
// exact key — dictBaseKey, which is the pipeline's own `base_key` rule doing at
// lookup time what it does at build time there.

/**
 * Strip everything that distinguishes a dictionary's spelling of a headword
 * from a morphology table's: quantity marks (`_` long, `^` short), homonym
 * markers (a trailing digit, or Morpheus' `#`), and compound hyphens. Accents
 * and breathings are NOT stripped — for Greek they are part of the identity of
 * the word, not decoration.
 */
export function dictBaseKey(key: string): string {
  return key.replace(/[0-9_^\-#]/g, '');
}

/** Kept as the old name for the Latin-specific tests and callers. */
export const latinBaseKey = dictBaseKey;

/** Which shard file a key lives in: first ASCII a–z, skipping any leading
 * capital (so `Py_tha^go^ras` shards under 'y') and Beta Code's `*` marker. */
function dictShardLetter(key: string): string {
  for (const ch of key) {
    if (ch >= 'a' && ch <= 'z') return ch;
  }
  return '_';
}

/** `${language}:${letter}` → base key → the dictionary keys reducing to it. */
const lsBaseIndexCache = new Map<string, Promise<Map<string, string[]>>>();

async function dictBaseIndex(
  language: LexiconLanguage,
  letter: string,
): Promise<Map<string, string[]>> {
  const cacheKey = `${language}:${letter}`;
  let p = lsBaseIndexCache.get(cacheKey);
  if (!p) {
    p = (async () => {
      const shard = await loadDictShard(language, letter);
      const index = new Map<string, string[]>();
      for (const key of Object.keys(shard)) {
        const base = dictBaseKey(key);
        const bucket = index.get(base);
        if (bucket) bucket.push(key);
        else index.set(base, [key]);
      }
      return index;
    })();
    lsBaseIndexCache.set(cacheKey, p);
  }
  return p;
}

/**
 * Dictionary entries for one lemma. A lemma with a homonym marker (`edo#1`)
 * reduces to the same base as its siblings, so ALL of that base's entries come
 * back — the workbench has no corpus-wide parse statistics to choose between
 * homonyms with, and showing both readings is more useful to a translator than
 * silently picking one.
 */
async function dictEntriesForLemma(
  language: LexiconLanguage,
  lemma: string,
): Promise<LsjEntryView[]> {
  const base = dictBaseKey(lemma);
  if (base.length === 0) return [];
  const letter = dictShardLetter(base);
  const shard = await loadDictShard(language, letter);

  // An exact hit is possible for a headword carrying no quantity marks.
  const exact = shard[lemma] ?? shard[base];
  if (exact) return [{ key: exact.key, head: exact.head, html: exact.html }];

  const index = await dictBaseIndex(language, letter);
  const out: LsjEntryView[] = [];
  for (const key of index.get(base) ?? []) {
    const entry = shard[key];
    if (entry) out.push({ key: entry.key, head: entry.head, html: entry.html });
  }
  return out;
}

/** Entries for several lemmas, de-duplicated, order preserved. */
async function dictEntriesForLemmas(
  language: LexiconLanguage,
  lemmas: string[],
): Promise<LsjEntryView[]> {
  const out: LsjEntryView[] = [];
  const seen = new Set<string>();
  for (const lemma of lemmas) {
    for (const entry of await dictEntriesForLemma(language, lemma)) {
      if (seen.has(entry.key)) continue;
      seen.add(entry.key);
      out.push(entry);
    }
  }
  return out;
}

// ── the Latin provider ──────────────────────────────────────────────────────

/**
 * Latin lookup. Unlike the Greek provider this takes no workId: there is never
 * per-work Latin data, which is exactly what lets it parse a text the app has
 * never processed.
 *
 * Degraded state worth knowing: with no Latin pack installed there are no
 * analyses and no dictionary, and the drawer says which pack would answer the
 * click. With a pack, an inflected form resolves through morphology; the
 * lookup also falls back to treating the clicked word as a lemma, so a word
 * that IS its own headword still finds its entry.
 */
export function latinProvider(): LexiconProvider {
  return {
    async lookup(word: string): Promise<LexiconResult> {
      const trimmed = word.trim();
      if (!trimmed) return EMPTY_RESULT;

      const key = toLatinKey(trimmed);
      const variants = latinLookupVariants(key, isCapitalizedSurface(trimmed));
      const raw = await lookupAnalyses('lat', variants);

      const lemmas = raw.length > 0 ? raw.map((a) => a.lemma) : [key];
      const lsjEntries = await dictEntriesForLemmas('lat', lemmas);

      const analyses: LexiconAnalysis[] = raw.map((a) => ({
        form: trimmed,
        lemma: a.lemma,
        // Quantity marks and homonym digits are lookup plumbing, not something
        // to show a reader.
        lemmaDisplay: dictBaseKey(a.lemma),
        parse: a.parse,
        gloss: a.gloss, // always blank for Latin — see morphology.ts
        lsjKeys: [],
      }));

      return { analyses, lsjEntries };
    },
  };
}
