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
import {
  buildDiscExportCommand,
  exportedWorkPath,
  perlCandidates,
  diogenesServerCandidates,
  platformFrom,
} from '../corpus/discExport';
import type { Corpus, LineMode, Platform } from '../corpus/discExport';
import { createSourceImport } from './createSourceImport';
import type { SourceImport } from './createSourceImport';
import { divisionsForDiscWork, divisionsToContainers, loadDivisions } from '../works/divisions';
import { loadSettings } from '../settings';

/** How long to let an export run. Whole-author exports are slow: Plato's 41
 * works took minutes against a real disc, so this is generous on purpose. */
const EXPORT_TIMEOUT_MS = 15 * 60 * 1000;
const PROBE_TIMEOUT_MS = 5000;

export const NO_DISC_MESSAGE = 'That folder isn’t a TLG or PHI disc — look for the one containing AUTHTAB.DIR.';
export const NO_DIOGENES_MESSAGE =
  'Importing from a TLG or PHI disc needs Diogenes installed, because it does the work of reading the disc. Install Diogenes, then set its location in Settings.';
export const EXPORT_FAILED_MESSAGE = 'Diogenes couldn’t read that work from the disc.';

async function fsPlugin() {
  return import('@tauri-apps/plugin-fs');
}

interface RunOutcome {
  code: number | null;
  stdout: string;
  stderr: string;
  timed_out: boolean;
  spawned: boolean;
}

/** Native folder picker for a disc; null when cancelled. The corpus only names
 * the picker's title — the user is choosing a folder, not a format. */
export async function pickDiscDir(corpus?: Corpus): Promise<string | null> {
  const dialog = await import('@tauri-apps/plugin-dialog');
  const picked = await dialog.open({
    directory: true,
    multiple: false,
    title: corpus ? `Choose your ${corpus.toUpperCase()} folder` : 'Choose your TLG or PHI folder',
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

/**
 * The platform the app is running on, from the webview's user agent.
 *
 * Tauri has an OS plugin that would answer this directly, but adding a
 * permanent dependency for one string is a poor trade when the user agent
 * already carries it — and this only chooses which paths to TRY. Every
 * candidate is probed by running it, so a wrong guess costs a failed probe,
 * not a wrong result.
 */
function currentPlatform(): Platform {
  return platformFrom(navigator.userAgent);
}

/** First path that exists, or null. */
async function firstExisting(paths: string[]): Promise<string | null> {
  const fs = await fsPlugin();
  for (const path of paths) {
    try {
      if (await fs.exists(path)) return path;
    } catch {
      // An unreadable candidate is just a miss.
    }
  }
  return null;
}

/** Where Diogenes is: the configured path, else a platform default that exists. */
export async function resolveDiogenesServer(platform: Platform): Promise<string | null> {
  const settings = await loadSettings();
  if (settings.diogenesPath) return settings.diogenesPath;
  return firstExisting(diogenesServerCandidates(platform));
}

/**
 * A perl that actually runs. Tries each candidate with `-v` — on Windows the
 * bundled interpreter's location is a guess, so "does it run" is the only
 * honest test.
 */
async function resolvePerl(platform: Platform, diogenesServer: string, configured?: string): Promise<string | null> {
  const { invoke } = await import('@tauri-apps/api/core');
  const candidates = configured ? [configured] : perlCandidates(platform, diogenesServer);
  for (const bin of candidates) {
    try {
      const probe = (await invoke('run_program', {
        binPath: bin,
        args: ['-v'],
        timeoutMs: PROBE_TIMEOUT_MS,
      })) as RunOutcome;
      if (probe.spawned && probe.code === 0) return bin;
    } catch (err) {
      console.warn('discImport: perl candidate failed', bin, err);
    }
  }
  return null;
}

export interface DiscImportRequest {
  discDir: string;
  author: DiscAuthor;
  work: DiscWork;
  lineMode?: LineMode;
  /** Where exports are cached. Defaults to app data. Must be ABSOLUTE. */
  exportDir?: string;
  /**
   * Work ids already in the library, so a second import of the same title
   * takes the next free id. Without them the two works share one id and the
   * second silently overwrites the first — translation and all.
   */
  existingIds?: Iterable<string>;
}

/**
 * Where cached exports live: <app data>/corpus/disc-export.
 *
 * Absolute, and it has to be. A relative path fails twice over — plugin-fs
 * refuses it (relative paths are resolved against a BaseDirectory, so a bare
 * "corpus/…" matches no scope and comes back "forbidden path"), and Diogenes
 * is a perl subprocess that has never heard of app data and would resolve the
 * same string against its own directory inside /Applications.
 */
async function defaultExportDir(): Promise<string> {
  const { appDataDir } = await import('@tauri-apps/api/path');
  return `${(await appDataDir()).replace(/[\\/]+$/, '')}/corpus/disc-export`;
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
  const exportDir = req.exportDir ?? `${await defaultExportDir()}/${lineMode}`;
  const xmlPath = exportedWorkPath(exportDir, corpus, num, req.work.number);

  if (!(await fs.exists(xmlPath))) {
    await runExport({ ...req, lineMode }, corpus, num, exportDir);
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

async function runExport(req: DiscImportRequest, corpus: Corpus, num: string, exportDir: string): Promise<void> {
  const platform = currentPlatform();
  const server = await resolveDiogenesServer(platform);
  if (server === null) throw new Error(NO_DIOGENES_MESSAGE);

  const settings = await loadSettings();
  const perl = await resolvePerl(platform, server, settings.perlPath);
  if (perl === null) {
    console.error('[discImport] no usable perl among', perlCandidates(platform, server));
    throw new Error(NO_DIOGENES_MESSAGE);
  }

  // xml-export.pl writes into the -o directory but does not create it, and it
  // runs with its cwd set to Diogenes' own folder, so a missing one fails there
  // rather than here.
  const fs = await fsPlugin();
  await fs.mkdir(exportDir, { recursive: true });

  const cmd = buildDiscExportCommand({
    corpus,
    authorNumber: num,
    discDir: req.discDir,
    diogenesServer: server,
    exportDir,
    ...(req.lineMode ? { lineMode: req.lineMode } : {}),
    perlPath: perl,
    platform,
  });

  const { invoke } = await import('@tauri-apps/api/core');
  const outcome = (await invoke('run_program', {
    binPath: cmd.program,
    args: cmd.args,
    cwd: cmd.cwd,
    env: cmd.env,
    timeoutMs: EXPORT_TIMEOUT_MS,
  })) as RunOutcome;

  if (!outcome.spawned || outcome.code !== 0) {
    console.error('[discImport] export failed', outcome);
    throw new Error(outcome.timed_out ? 'Reading that author from the disc took too long.' : EXPORT_FAILED_MESSAGE);
  }
}
