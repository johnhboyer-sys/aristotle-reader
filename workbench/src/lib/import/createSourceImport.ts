/**
 * createSourceImport — the pure core every source importer feeds: TLG/PHI via
 * Diogenes, a downloaded Perseus TEI file, and a CTS fetch all reduce to the
 * same thing, a list of (source citation, text) rows plus some work metadata.
 *
 * The difference from createFreeDocument (the "New document…" path) is where
 * the addresses come from. There, rows are numbered by position: the third row
 * is "3" no matter what the source called it. Here the source's own citation
 * is carried through verbatim onto every row, which is the entire reason for
 * importing from a cited edition rather than pasting text. That is what the
 * `source-ref` scheme and the chapter file's `row_refs` field exist for.
 *
 * Like createFreeDocument this module never touches storage or the network —
 * callers write the file through libraryStorage() and register the work
 * through registerFreeWork. Fetching, unzipping, running Diogenes, and parsing
 * TEI all happen upstream and hand their result here as plain rows.
 */

import { getScheme } from '../citation/registry';
import type { ChapterFile, ChapterFileMeta } from '../chapterfile';
import { emptyRowDocJSON } from '../editor/schema';
import { serializeRowSegments } from '../editor/serialize';
import type { FreeWorkRecord } from '../works/freeWorks';
import type { WorkLevel } from '../works/profile';
import { slugForTitle } from './createFreeDocument';

/** The scheme every source import uses: addresses are the source's own. */
const SCHEME = 'source-ref' as const;

/** One imported row: the source's citation for it, and its text. */
export interface SourceRow {
  /** The source's citation, e.g. "1.5", "379d". Verbatim — never renumbered. */
  ref: string;
  /** The row's text in the original language. */
  text: string;
}

export interface SourceImportSpec {
  title: string;
  /** Omitted for an anonymous work. */
  author?: string;
  /** Free-text original language, e.g. "Greek", "Latin". */
  language?: string;
  /**
   * The citation tiers the SOURCE declares, outermost first — e.g.
   * ["book", "line"] or ["book", "chapter", "section"]. Used for the work's
   * outline levels so the rail names them the way the source does. Omitted
   * when the source declares none, in which case the work takes the default
   * profile.
   */
  levelNames?: string[];
  rows: SourceRow[];
}

export interface SourceImport {
  work: FreeWorkRecord;
  file: ChapterFile;
}

/** Rows with blank text carry no citation worth keeping — a source's structural
 * placeholders (empty <l/>, lacunae markers) would otherwise become empty rows
 * the translator has to step through. */
function usableRows(rows: SourceRow[]): SourceRow[] {
  return rows.filter((r) => r.text.trim().length > 0);
}

/**
 * Every level a source declares becomes an outline tier, nested one inside the
 * next (book > chapter > section), which is what the source's own hierarchy
 * means. navRole is 'heading' throughout: 'book'/'chapter' roles drive the
 * container machinery (D8), and an import has no containers — it is one
 * document whose rows carry addresses.
 */
function levelsFor(names: string[] | undefined): WorkLevel[] | undefined {
  if (!names || names.length === 0) return undefined;
  const clean = names.map((n) => n.trim()).filter((n) => n.length > 0);
  if (clean.length === 0) return undefined;
  return clean.map((name, i) => ({ name, navRole: 'heading' as const, depth: i }));
}

/**
 * Build the chapter file + registration record for an imported source text.
 *
 * Throws a plain-language Error when the title is blank, no row has any text,
 * or a citation is unparseable — all three are caller bugs or a broken source
 * file, and guessing at any of them would silently mis-cite the text.
 *
 * Deliberately does NOT require the citations to ascend. Real sources are not
 * always monotonic (transposed fragments, appendices, editorial reordering),
 * and refusing an import over it would block texts that are perfectly usable;
 * the addresses are labels on rows whose ORDER is the file order.
 */
export function createSourceImport(
  spec: SourceImportSpec,
  existingIds: Iterable<string> = [],
): SourceImport {
  const title = spec.title.trim();
  if (title.length === 0) {
    throw new Error('Give the imported text a title.');
  }

  const rows = usableRows(spec.rows);
  if (rows.length === 0) {
    throw new Error('That source has no text in it.');
  }

  const scheme = getScheme(SCHEME);
  const refs = rows.map((r) => r.ref);
  for (const ref of refs) {
    try {
      scheme.parseAddress(ref);
    } catch (err) {
      throw new Error(`The source has an unusable citation (${JSON.stringify(ref)}): ${(err as Error).message}`);
    }
  }

  const workId = slugForTitle(title, existingIds);

  // Key order mirrors parseChapterFile's meta construction — autosave's
  // round-trip self-check compares JSON shapes.
  const meta: ChapterFileMeta = {
    schemaVersion: 1,
    work: workId,
    book: 1,
    chapter: 1,
    citationScheme: SCHEME,
    spanStart: refs[0],
    spanEnd: refs[refs.length - 1],
    rowRefs: refs,
  };

  const file: ChapterFile = {
    meta,
    greekLines: rows.map((r) => r.text),
    englishLines: rows.map(() => emptyEnglishLine()),
    footnotes: [],
  };

  const author = spec.author?.trim();
  const language = spec.language?.trim();
  const levels = levelsFor(spec.levelNames);
  const work: FreeWorkRecord = {
    id: workId,
    title,
    ...(author ? { author } : {}),
    ...(language ? { language } : {}),
    scheme: SCHEME,
    ...(levels ? { levels } : {}),
  };

  return { work, file };
}

/** One untranslated [ENGLISH] row: a single empty segment. */
function emptyEnglishLine(): string {
  return serializeRowSegments([emptyRowDocJSON()]);
}
