/**
 * morphology.ts — word parsing for Greek and Latin, read from the installed
 * lexicon pack.
 *
 * A pack carries the complete Morpheus analyses table for its language: every
 * inflected form, for every author, not just the works the app was built
 * around. That is the whole point — a text pasted in from Scaife, an imported
 * Cicero, a manuscript transcription, all parse the same way.
 *
 * The table is ASCII-sorted by key and ships with a companion index holding
 * TWO Perl hash literals — the start and end byte offset of each 1–3 character
 * key prefix — plus the file size:
 *
 *     %index_start = ( 'aff' => 6378632, 'vir' => 43337219, ... );
 *     %index_end   = ( 'Aqu' => 353297,  'vir' => 43369784, ... );
 *     $index_max = 43683497;
 *
 * Both hashes must be read SEPARATELY: they share prefix keys, so parsing the
 * file as one flat list of pairs silently yields a mix of starts and ends, and
 * every lookup then reads the wrong block and finds nothing. (Measured, the
 * hard way.)
 *
 * So a lookup reads the index once (~240 KB), then only the byte range
 * belonging to the clicked word's prefix — 12 KB on average. Blocks are cached,
 * so a second word from the same corner of the alphabet costs nothing. The
 * Greek table is 115 MB and the Latin 42 MB; neither is ever read whole.
 *
 * Line format — one key per line, tab-separated from its analyses:
 *
 *     lo/gos      {60875356 9 lo/gos\tcomputation, reckoning\tmasc nom sg}
 *     virtutem    {78555853 9 virtu_tem,virtus\t \tfem acc sg}
 *     esse        {24486703 9 e_sse,edo#1\t \tpres inf act}{70660545 9 sum#1\t \tpres inf act}
 *
 * Inside each brace: an id, a flag, then `lemma` or `form,lemma` (with `_`
 * marking a long vowel), then a TAB, a gloss, a TAB, and the parse. Greek
 * carries real glosses; Latin's gloss slot is always blank (measured by the
 * pipeline at 0 of 231,938), which is why a Latin analysis shows none.
 *
 * Every failure — no pack, an unreadable index, a word Morpheus doesn't know —
 * is a NORMAL empty result, never a throw.
 */

import { isTauri } from '../runtime';
import { packFor } from './packs';
import type { LexiconLanguage } from './packs';

/** One Morpheus analysis of a surface form. */
export interface MorphAnalysis {
  /** Lemma as the table keys it, homonym marker included (`edo#1`). */
  lemma: string;
  /** The inflected form with quantity marks, when the entry carries one. */
  form: string;
  /** Short sense. Always empty for Latin — see the module header. */
  gloss: string;
  parse: string;
}

/** What the Lexicon settings pane reports about one language. */
export interface MorphologyStatus {
  ready: boolean;
  /** The analyses file being read, when a pack is installed. */
  path: string | null;
}

async function analysesPath(language: LexiconLanguage): Promise<string | null> {
  const pack = await packFor(language);
  return pack ? `${pack.path}/morphology/${pack.analysesFile}` : null;
}

async function indexPath(language: LexiconLanguage): Promise<string | null> {
  const pack = await packFor(language);
  return pack ? `${pack.path}/morphology/${pack.indexFile}` : null;
}

/** Whether this language's morphology is installed, and where it lives. */
export async function morphologyStatus(language: LexiconLanguage): Promise<MorphologyStatus> {
  if (!isTauri()) return { ready: false, path: null };
  const path = await analysesPath(language);
  if (!path) return { ready: false, path: null };
  try {
    const fs = await import('@tauri-apps/plugin-fs');
    return { ready: await fs.exists(path), path };
  } catch (err) {
    console.warn('morphology: could not check the analyses file', err);
    return { ready: false, path };
  }
}

// ── the prefix index ────────────────────────────────────────────────────────

export interface PrefixIndex {
  /** prefix → the byte offset its block starts at. */
  starts: Map<string, number>;
  /** prefix → the byte offset its block ends at (one prefix lacks an end). */
  ends: Map<string, number>;
  /** Total file size (the index's own `$index_max`). */
  size: number;
}

/**
 * Parse the index's two hashes. Exported for unit testing — it is the part
 * most worth pinning, since reading it as one flat list of pairs produces an
 * index that looks fine and resolves nothing.
 */
export function parsePrefixIndex(text: string): PrefixIndex | null {
  const pairs = (section: string) => {
    const map = new Map<string, number>();
    for (const m of section.matchAll(/'([^']*)'\s*=>\s*(\d+)/g)) map.set(m[1], Number(m[2]));
    return map;
  };

  const split = text.indexOf('%index_end');
  const starts = pairs(split >= 0 ? text.slice(0, split) : text);
  const ends = split >= 0 ? pairs(text.slice(split)) : new Map<string, number>();
  if (starts.size === 0) return null;

  const maxMatch = /\$index_max\s*=\s*(\d+)/.exec(text);
  const size = maxMatch ? Number(maxMatch[1]) : Math.max(...starts.values(), ...ends.values()) + 1;
  return { starts, ends, size };
}

const indexCache = new Map<LexiconLanguage, Promise<PrefixIndex | null>>();

async function loadIndexUncached(language: LexiconLanguage): Promise<PrefixIndex | null> {
  if (!isTauri()) return null;
  const path = await indexPath(language);
  if (!path) return null;
  let text: string;
  try {
    const fs = await import('@tauri-apps/plugin-fs');
    if (!(await fs.exists(path))) return null;
    text = await fs.readTextFile(path);
  } catch (err) {
    console.warn(`morphology: could not read ${path}`, err);
    return null;
  }
  const index = parsePrefixIndex(text);
  if (!index) console.warn(`morphology: ${path} held no index entries`);
  return index;
}

function loadIndex(language: LexiconLanguage): Promise<PrefixIndex | null> {
  let p = indexCache.get(language);
  if (!p) {
    p = loadIndexUncached(language);
    indexCache.set(language, p);
  }
  return p;
}

/**
 * The index keys prefixes at 1, 2, or 3 characters, so try longest first — a
 * 3-character block is the tightest read.
 */
function prefixFor(key: string, index: PrefixIndex): string | null {
  for (let len = Math.min(3, key.length); len >= 1; len--) {
    const candidate = key.slice(0, len);
    if (index.starts.has(candidate)) return candidate;
  }
  return null;
}

/**
 * A little slack past the recorded end covers the case where the end lands
 * mid-line: the extra keys read cannot collide with anything (they belong to
 * the next prefix and are never asked for), whereas a truncated final line
 * would silently lose a word.
 */
const RANGE_SLACK = 1024;

export function blockRange(prefix: string, index: PrefixIndex): { start: number; end: number } {
  const start = index.starts.get(prefix)!;
  // One prefix in the shipped index has no end entry; the file's end bounds it.
  const end = index.ends.get(prefix) ?? index.size;
  return { start, end: Math.min(end + RANGE_SLACK, index.size) };
}

// ── block reads ─────────────────────────────────────────────────────────────

/** `${language}:${prefix}` → key → raw analyses text (everything after the first tab). */
const blockCache = new Map<string, Promise<Map<string, string> | null>>();

async function readBlockUncached(
  language: LexiconLanguage,
  prefix: string,
): Promise<Map<string, string> | null> {
  const index = await loadIndex(language);
  const path = await analysesPath(language);
  if (!index || !path) return null;
  const { start, end } = blockRange(prefix, index);
  const length = end - start;
  if (length <= 0) return null;

  let bytes: Uint8Array;
  try {
    const fs = await import('@tauri-apps/plugin-fs');
    const file = await fs.open(path, { read: true });
    try {
      await file.seek(start, fs.SeekMode.Start);
      bytes = new Uint8Array(length);
      // One read() can return a short count; loop until the range is filled or
      // the file ends (a truncated tail is a normal end-of-file, not an error).
      let filled = 0;
      while (filled < length) {
        const chunk = new Uint8Array(length - filled);
        const got = await file.read(chunk);
        if (got === null || got === 0) break;
        bytes.set(chunk.subarray(0, got), filled);
        filled += got;
      }
      bytes = bytes.subarray(0, filled);
    } finally {
      await file.close();
    }
  } catch (err) {
    console.warn(`morphology: could not read the '${prefix}' block`, err);
    return null;
  }

  const text = new TextDecoder('utf-8').decode(bytes);
  const table = new Map<string, string>();
  // A block ends on a newline, so the final split element is empty; when the
  // slack read above ran past the end it is a partial line of the NEXT block.
  // Either way the last element is dropped, and nothing this prefix owns is
  // lost.
  const lines = text.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    const tab = lines[i].indexOf('\t');
    if (tab <= 0) continue;
    table.set(lines[i].slice(0, tab), lines[i].slice(tab + 1));
  }
  return table;
}

function readBlock(language: LexiconLanguage, prefix: string): Promise<Map<string, string> | null> {
  const cacheKey = `${language}:${prefix}`;
  let p = blockCache.get(cacheKey);
  if (!p) {
    p = readBlockUncached(language, prefix);
    blockCache.set(cacheKey, p);
  }
  return p;
}

// ── parsing ─────────────────────────────────────────────────────────────────

/**
 * Parse one line's analyses into structured entries. Exported for unit testing
 * — it is the only part of this module that runs without a pack.
 */
export function parseAnalysesField(raw: string): MorphAnalysis[] {
  const out: MorphAnalysis[] = [];
  for (const m of raw.matchAll(/\{([^}]*)\}/g)) {
    // "<id> <flag> <lemma|form,lemma>\t<gloss>\t<parse>"
    const parts = m[1].split('\t');
    if (parts.length < 3) continue;
    const head = parts[0];
    const gloss = parts[1].trim();
    // A parse can itself be the remainder; rejoin in case one ever holds a tab.
    const parse = parts.slice(2).join(' ').trim();

    // Drop the leading "<id> <flag> " — two whitespace-separated fields.
    const headParts = head.split(/\s+/);
    if (headParts.length < 3) continue;
    const lemmaField = headParts.slice(2).join(' ');

    const comma = lemmaField.indexOf(',');
    const form = comma >= 0 ? lemmaField.slice(0, comma) : '';
    const lemma = comma >= 0 ? lemmaField.slice(comma + 1) : lemmaField;
    if (lemma.length === 0) continue;
    out.push({ lemma, form, gloss, parse });
  }
  return out;
}

/**
 * Every analysis the table has for the first of `variants` that resolves.
 * The caller supplies the variant list because normalization is
 * language-specific — Beta Code capital/accent handling for Greek (provider.ts)
 * and enclitic/capital fallbacks for Latin (latinKey.ts) — and this module has
 * no business knowing either. An empty array means "no analysis", which is
 * normal.
 */
export async function lookupAnalyses(
  language: LexiconLanguage,
  variants: string[],
): Promise<MorphAnalysis[]> {
  if (!isTauri()) return [];
  const index = await loadIndex(language);
  if (!index) return [];

  for (const variant of variants) {
    const prefix = prefixFor(variant, index);
    if (!prefix) continue;
    const block = await readBlock(language, prefix);
    const raw = block?.get(variant);
    if (raw) {
      const analyses = parseAnalysesField(raw);
      if (analyses.length > 0) return analyses;
    }
  }
  return [];
}

/** Drop every cached read — call after installing or removing a pack. */
export function invalidateMorphology(): void {
  indexCache.clear();
  blockCache.clear();
}
