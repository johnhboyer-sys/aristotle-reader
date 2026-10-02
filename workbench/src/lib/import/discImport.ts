/**
 * Importing a work from the user's own TLG or PHI disc (Tauri only).
 *
 * The steps, and where each one lives:
 *
 *   1. the user picks a disc folder            → pickDiscDir
 *   2. read its AUTHTAB.DIR for the authors    → corpus/authtab.ts
 *   3. read <ID>.IDT for that author's works   → corpus/idtWorks.ts
 *   4. run Diogenes' exporter if needed        → corpus/discExport.ts
 *   5. read the exported TEI into rows         → corpus/teiRows.ts
 *   6. build the work and chapter file         → import/createSourceImport.ts
 *
 * Only step 4 needs Diogenes installed, and only this path needs it at all —
 * a Perseus import goes straight to step 5. That is the whole reason the
 * split exists.
 *
 * Every failure becomes ONE plain sentence for the dialog. Exit codes, stderr
 * and stack traces go to the console, as in onboarding.ts.
 */

import { parseAuthtab, corpusForAuthorId, authorNumber } from '../corpus/authtab';
import type { DiscAuthor } from '../corpus/authtab';
import { parseIdtWorks } from '../corpus/idtWorks';
import type { DiscWork } from '../corpus/idtWorks';
import { parseTeiRows } from '../corpus/teiRows';
import { exportedWorkPath } from '../corpus/discExport';
import type { Corpus, LineMode } from '../corpus/discExport';
import { createSourceImport } from './createSourceImport';
import type { SourceImport } from './createSourceImport';
import { divisionsForDiscWork, divisionsToContainers, loadDivisions } from '../works/divisions';

export const NO_DISC_MESSAGE = 'That folder isn’t a TLG or PHI disc — look for the one containing AUTHTAB.DIR.';
export const NO_DIOGENES_MESSAGE =
  'Importing from a TLG or PHI disc needs Diogenes installed, because it does the work of reading the disc. Install Diogenes in Applications, then try again.';
export const EXPORT_FAILED_MESSAGE = 'Diogenes couldn’t read that work from the disc.';

async function fsPlugin() {
  return import('@tauri-apps/plugin-fs');
}

/** `diogenes_export`'s answer (src-tauri/src/commands.rs). */
interface DiogenesOutcome {
  /** Where Rust wrote the export. */
  out_dir: string;
  run: { code: number | null; stdout: string; stderr: string; timed_out: boolean; spawned: boolean };
}

/** Native folder picker for a disc; null when cancelled. The corpus only names
 * the picker's title — the user is choosing a folder, not a format. The whole
 * folder (`recursive`), since Diogenes reads it; `defaultPath` opens the
 * dialog at a folder chosen before, for choosing it again. */
export async function pickDiscDir(corpus?: Corpus, defaultPath?: string): Promise<string | null> {
  const dialog = await import('@tauri-apps/plugin-dialog');
  const picked = await dialog.open({
    directory: true,
    recursive: true,
    multiple: false,
    title: corpus ? `Choose your ${corpus.toUpperCase()} folder` : 'Choose your TLG or PHI folder',
    ...(defaultPath ? { defaultPath } : {}),
  });
  return typeof picked === 'string' ? picked : null;
}

/** The disc's author table, whichever way its name is cased. */
async function authtabPath(dir: string): Promise<string | null> {
  const fs = await fsPlugin();
  for (const name of ['AUTHTAB.DIR', 'authtab.dir']) {
    const path = `${dir.replace(/[\\/]+$/, '')}/${name}`;
    if (await fs.exists(path)) return path;
  }
  return null;
}

/** True when `dir` looks like a disc. */
export async function looksLikeDisc(dir: string): Promise<boolean> {
  try {
    return (await authtabPath(dir)) !== null;
  } catch (err) {
    console.warn('discImport: disc check failed', err);
    return false;
  }
}

/** Every author the disc lists. Throws the plain sentence when it isn't a disc. */
export async function readDiscAuthors(dir: string): Promise<DiscAuthor[]> {
  const path = await authtabPath(dir);
  if (path === null) throw new Error(NO_DISC_MESSAGE);
  const fs = await fsPlugin();
  return parseAuthtab(await fs.readFile(path));
}

/**
 * One author's works and the disc's own names for their citation tiers. Read
 * from the .IDT, which is why this is instant — no export needed to fill the
 * work list.
 */
export async function readAuthorWorks(dir: string, author: DiscAuthor): Promise<DiscWork[]> {
  const fs = await fsPlugin();
  const base = `${dir.replace(/[\\/]+$/, '')}/${author.id}`;
  for (const path of [`${base}.IDT`, `${base}.idt`]) {
    if (!(await fs.exists(path))) continue;
    return parseIdtWorks(await fs.readFile(path)).works;
  }
  throw new Error(`The disc lists ${author.name} but has no index file for them.`);
}

/** Where Diogenes is installed, as Rust finds it; null when it isn't. */
export async function resolveDiogenesServer(): Promise<string | null> {
  const { invoke } = await import('@tauri-apps/api/core');
  return (await invoke('diogenes_status')) as string | null;
}

export interface DiscImportRequest {
  discDir: string;
  author: DiscAuthor;
  work: DiscWork;
  lineMode?: LineMode;
  /**
   * Work ids already in the library, so a second import of the same title
   * takes the next free id. Without them the two works share one id and the
   * second silently overwrites the first — translation and all.
   */
  existingIds?: Iterable<string>;
}

/**
 * Where Rust caches exports: <app data>/corpus/disc-export/<line mode>
 * (`diogenes_export` in src-tauri/src/commands.rs). Used only to find an
 * earlier export; after a run, the path Rust returns is the one read.
 */
async function cachedExportDir(lineMode: LineMode): Promise<string> {
  const { appDataDir } = await import('@tauri-apps/api/path');
  return `${(await appDataDir()).replace(/[\\/]+$/, '')}/corpus/disc-export/${lineMode}`;
}

/**
 * Export the author if their XML isn't already cached, then build the work.
 *
 * The cache matters: Diogenes has no way to export a single work, so importing
 * one dialogue of Plato exports all 41. Doing that once per author instead of
 * once per import is the difference between a slow first import and a slow
 * every import.
 */
export async function importFromDisc(req: DiscImportRequest): Promise<SourceImport> {
  const fs = await fsPlugin();
  const corpus: Corpus = corpusForAuthorId(req.author.id);
  const num = authorNumber(req.author.id);
  if (num === null) throw new Error(`The disc gave an author id we can’t use (${req.author.id}).`);

  // Verse mode by default, as the corpus pipeline runs it: it is the only mode
  // that keeps line numbers, so a Bekker page comes back as 402a.1, 402a.2
  // rather than one 900-character block addressed 402a three times over.
  // Diogenes' own 'auto' calls most of Aristotle prose and throws them away.
  const lineMode: LineMode = req.lineMode ?? 'lines';

  // The mode is part of the cache path: the same work exported as lines and as
  // prose are different texts, and a cached one must not answer for the other.
  let xmlPath = exportedWorkPath(await cachedExportDir(lineMode), corpus, num, req.work.number);

  if (!(await fs.exists(xmlPath))) {
    const outDir = await runExport(req.discDir, corpus, num, lineMode);
    xmlPath = exportedWorkPath(outDir, corpus, num, req.work.number);
  }
  if (!(await fs.exists(xmlPath))) {
    // The export ran but produced nothing for this work — a real thing when a
    // disc record has no text behind it.
    console.error('[discImport] export produced no file at', xmlPath);
    throw new Error(EXPORT_FAILED_MESSAGE);
  }

  const doc = parseTeiRows(await fs.readTextFile(xmlPath));
  if (doc.rows.length === 0) throw new Error('That work has no text on the disc.');

  const imported = createSourceImport({
    title: req.work.title || doc.title || 'Untitled',
    ...(req.author.name ? { author: req.author.name } : {}),
    ...(req.author.language ? { language: req.author.language } : {}),
    // The disc's own tier names beat the export's `type` attributes:
    // "Stephanus page" rather than "Stephanus-page".
    levelNames: req.work.levelNames.length > 0 ? req.work.levelNames : doc.levelNames,
    rows: doc.rows,
  }, req.existingIds ?? []);

  return withKnownDivisions(imported, req);
}

/**
 * Lay down the work's books and chapters when this project already knows them.
 *
 * The disc exports the citation scheme its edition prints and no more: for
 * Aristotle that is the Bekker page and line, so the Physics arrives as eight
 * title lines and 5,520 lines of Greek with none of its 71 chapters — the disc
 * has no chapter level to give. The divisions table does (see works/divisions),
 * addressed in the very coordinates the imported rows carry.
 *
 * Boundaries, not marks: a marked row becomes a title and drops out of the
 * flowing text, and a chapter of the Physics starts mid-prose on a line the
 * reader still needs. Nothing here touches a row.
 *
 * A work the table doesn't know imports exactly as it did before.
 */
async function withKnownDivisions(
  imported: SourceImport,
  req: DiscImportRequest,
): Promise<SourceImport> {
  const divisions = divisionsForDiscWork(await loadDivisions(), req.author.id, req.work.number);
  if (!divisions) return imported;

  const refs = imported.file.meta.rowRefs ?? [];
  // The outline roots ARE the printed title lines; their text is what names
  // the Books ("Book Α", not "Book 1").
  const rootTexts = (imported.file.meta.headers ?? []).map(
    (mark) => imported.file.greekLines[mark.row - 1] ?? '',
  );
  const applied = divisionsToContainers(divisions, refs, rootTexts);
  if (applied.chapters.length === 0) return imported;

  if (applied.unmatched.length > 0) {
    // Loud in the log, quiet in the UI: the import is still good, and a
    // chapter this could not place is a fact about the export, not a failure.
    console.warn(
      `[discImport] ${applied.unmatched.length} chapter(s) of ${divisions.id} matched no row`,
      applied.unmatched,
    );
  }

  return {
    ...imported,
    work: {
      ...imported.work,
      ...(applied.books.length > 0 ? { bookContainers: applied.books } : {}),
      chapterContainers: applied.chapters,
    },
  };
}

/** Run Diogenes' exporter for one author; returns the folder it wrote. */
async function runExport(discDir: string, corpus: Corpus, num: string, lineMode: LineMode): Promise<string> {
  if ((await resolveDiogenesServer()) === null) throw new Error(NO_DIOGENES_MESSAGE);

  const { invoke } = await import('@tauri-apps/api/core');
  const outcome = (await invoke('diogenes_export', { corpus, author: num, lineMode, discDir })) as DiogenesOutcome;

  if (!outcome.run.spawned || outcome.run.code !== 0) {
    console.error('[discImport] export failed', outcome);
    throw new Error(outcome.run.timed_out ? 'Reading that author from the disc took too long.' : EXPORT_FAILED_MESSAGE);
  }
  return outcome.out_dir;
}
