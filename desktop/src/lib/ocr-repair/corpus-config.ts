// ocr-repair/corpus-config.ts
//
// Per-corpus configuration for the Goal-A repair pipeline. Everything
// corpus-specific lives HERE (loaded from a config.json next to the corpus
// files, outside the repo) — stage code receives (layoutText, config) and
// must contain no corpus literals. Repair rules for general OCR damage
// classes (Adobe column-letter garble, Genie apparatus encodings) are code,
// not config: they apply to every corpus.
//
// Paths in the config file are resolved relative to the config file's own
// directory, so a corpus directory is self-contained and movable.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export interface BekkerRef {
  /** Bekker page number, e.g. 639. */
  page: number;
  /** Column letter. */
  col: 'a' | 'b';
}

export interface CorpusConfig {
  /** Short slug, e.g. "pa-lennox"; used in output filenames and change-list ids. */
  id: string;
  /** Work title as printed, e.g. "Parts of Animals". */
  workTitle: string;
  /**
   * Line inserted when a page's running head was lost by OCR (spec §2: the
   * converter strips line 1 of every page unconditionally — a page must
   * never start with body text).
   */
  runningHeadPlaceholder: string;
  /** Inclusive Bekker column range of the translation body. */
  bekkerStart: BekkerRef;
  bekkerEnd: BekkerRef;
  /** Expected division structure; chaptersPerBook[i] = chapters in book i+1. */
  divisions: { books: number; chaptersPerBook: number[] };
  /**
   * Declared gutter side when the print is one-sided (e.g. an all-verso
   * edition). A hint for sparse pages only — side is normally decided per
   * page from tic evidence; never assume recto/verso alternation.
   */
  side?: 'verso' | 'recto' | 'alternating';
  /** The pdftotext -layout extraction (geometry backbone). */
  backbonePath: string;
  /** The History Genie extraction (wording witness). */
  witnessPath: string;
  /** Optional chapter map (Bekker ranges per chapter) for slice cross-checks. */
  chapterMapPath?: string;
  /**
   * Stage-1 slice boundaries, pattern-driven so an unseen edition needs only
   * config. Patterns are regex sources tested line-by-line against a page;
   * the first page with a matching line is the boundary. Cuts happen at page
   * boundaries only.
   */
  slice?: {
    /** First page with a matching line opens the translation body. */
    bodyStart: string;
    /**
     * When set, bodyStart only matches if the NEXT non-blank line matches
     * this too (e.g. BOOK heading followed by CHAPTER heading — running
     * heads that merely say "BOOK ONE" can't satisfy the pair).
     */
    bodyStartNextLine?: string;
    /**
     * Drop non-blank lines strictly between the body-start page's running
     * head (first non-blank line, always kept) and the matched bodyStart
     * line — front-matter prose printed above the opening heading. Logged;
     * removed lines are carried in the change record's evidence.
     */
    trimBodyStartPreamble?: boolean;
    /** First page AFTER bodyStart matching begins back matter (cut to end). */
    backMatterStart?: string;
  };
  /** Where stage outputs, reports, and change-lists are written. */
  outDir: string;
}

const REQUIRED: (keyof CorpusConfig)[] = [
  'id',
  'workTitle',
  'runningHeadPlaceholder',
  'bekkerStart',
  'bekkerEnd',
  'divisions',
  'backbonePath',
  'witnessPath',
];

export function parseBekkerRef(s: string): BekkerRef {
  const m = /^(\d{1,4})([ab])$/.exec(s.trim());
  if (!m) throw new Error(`invalid Bekker ref "${s}" (expected e.g. "639a")`);
  return { page: Number(m[1]), col: m[2] as 'a' | 'b' };
}

export function formatBekkerRef(r: BekkerRef): string {
  return `${r.page}${r.col}`;
}

/**
 * Load and validate a corpus config. Relative paths resolve against the
 * config file's directory; outDir defaults to that directory.
 */
export function loadCorpusConfig(configPath: string): CorpusConfig {
  const abs = resolve(configPath);
  const dir = dirname(abs);
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(abs, 'utf8'));
  } catch (e) {
    throw new Error(`cannot read corpus config ${abs}: ${(e as Error).message}`);
  }

  const cfg = { ...raw } as Record<string, unknown>;
  if (typeof cfg.bekkerStart === 'string') cfg.bekkerStart = parseBekkerRef(cfg.bekkerStart);
  if (typeof cfg.bekkerEnd === 'string') cfg.bekkerEnd = parseBekkerRef(cfg.bekkerEnd);
  cfg.backbonePath = resolve(dir, String(cfg.backbonePath ?? ''));
  cfg.witnessPath = resolve(dir, String(cfg.witnessPath ?? ''));
  if (cfg.chapterMapPath) cfg.chapterMapPath = resolve(dir, String(cfg.chapterMapPath));
  cfg.outDir = cfg.outDir ? resolve(dir, String(cfg.outDir)) : dir;

  for (const key of REQUIRED) {
    if (cfg[key] === undefined || cfg[key] === null || cfg[key] === '') {
      throw new Error(`corpus config ${abs}: missing required field "${key}"`);
    }
  }
  const div = cfg.divisions as CorpusConfig['divisions'];
  if (
    typeof div.books !== 'number' ||
    !Array.isArray(div.chaptersPerBook) ||
    div.chaptersPerBook.length !== div.books
  ) {
    throw new Error(
      `corpus config ${abs}: divisions.chaptersPerBook must list one entry per book (books=${div.books})`
    );
  }
  return cfg as unknown as CorpusConfig;
}
