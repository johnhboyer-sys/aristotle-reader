/**
 * Work onboarding (Tauri only) — produce $APPDATA/corpus/<workId>/spine.json
 * from the user's local TLG texts via Diogenes' verse-mode exporter, then copy
 * the precomputed chapters.json + analyses.json + shared lsj/ shards from the
 * bundled resources when present (staged into src-tauri/resources/corpus/ at
 * package time by scripts/stage-corpus-resources.mjs — see tauri.conf.json's
 * bundle.resources).
 *
 * Onboarding does NOT run chapter detection or morphological analysis (both
 * are precomputed and ship with the app); it only builds the spine. The
 * TLG-derived spine stays on the user's machine — it is never committed
 * anywhere, and no TLG text is ever bundled as a resource.
 *
 * Every failure maps to one plain, calm sentence for the UI (the dialog shows
 * it verbatim); stderr/exit codes/stack traces go to the console only.
 *
 * Nothing in this module may be reached in the browser harness — callers gate
 * on isTauri() (the "Add work…" affordance simply doesn't render there).
 */

import { parseSpine } from '../corpus/spine';
import { exportedWorkPath } from '../corpus/discExport';
import type { WorkManifest } from '../works/manifest';
import { invalidateCorpus } from './corpusStore';
import { SPINE_CONFIG } from './spineConfig';

async function fsPlugin() {
  return import('@tauri-apps/plugin-fs');
}

export type FsModule = Awaited<ReturnType<typeof fsPlugin>>;

/**
 * Copy one bundled resource file into app data, if it exists as a resource.
 * Silent no-op (logged only) when the resource isn't bundled — mirrors the
 * chapters.json handling above: a missing resource is a normal degraded
 * state, never a hard failure.
 */
export async function copyBundledResourceIfPresent(
  fs: FsModule,
  resourcePath: string,
  appDataPath: string,
): Promise<void> {
  try {
    if (!(await fs.exists(resourcePath, { baseDir: fs.BaseDirectory.Resource }))) return;
    const contents = await fs.readTextFile(resourcePath, { baseDir: fs.BaseDirectory.Resource });
    await fs.writeTextFile(appDataPath, contents, { baseDir: fs.BaseDirectory.AppData });
  } catch (err) {
    console.warn(`onboarding: failed copying bundled resource ${resourcePath}`, err);
  }
}

/**
 * Copy one shared dictionary shard directory from bundled resources into app
 * data, once. Idempotence guard: if the directory already exists in app data
 * (prior onboarding, or a pre-seeded install), this is a no-op — the shard sets
 * are tens of megabytes and are never re-copied per work.
 *
 * `dir` is 'lsj' (Greek, LSJ) or 'ls' (Latin, Lewis & Short). A missing
 * resource directory is the NORMAL case now, not a failure: since dictionaries
 * became separately-installed lexicon packs (src-tauri/src/packs.rs), a
 * packaged build stages no shards at all and this is a silent no-op. It stays
 * so that an install predating packs keeps its shards where lookup still
 * checks for them.
 */
export async function copySharedShardsIfMissing(fs: FsModule, dir: string): Promise<void> {
  const path = `corpus/${dir}`;
  try {
    if (await fs.exists(path, { baseDir: fs.BaseDirectory.AppData })) return;
    if (!(await fs.exists(path, { baseDir: fs.BaseDirectory.Resource }))) return;
    const entries = await fs.readDir(path, { baseDir: fs.BaseDirectory.Resource });
    await fs.mkdir(path, { baseDir: fs.BaseDirectory.AppData, recursive: true });
    for (const entry of entries) {
      if (!entry.isFile) continue;
      // Read and write rather than copyFile: the window has no copy_file
      // grant, which on $RESOURCE would also let it copy INTO the installed
      // app (capabilities/default.json). The shards are JSON text.
      const file = `${path}/${entry.name}`;
      const text = await fs.readTextFile(file, { baseDir: fs.BaseDirectory.Resource });
      await fs.writeTextFile(file, text, { baseDir: fs.BaseDirectory.AppData });
    }
  } catch (err) {
    console.warn(`onboarding: failed copying shared ${dir}/ resources`, err);
  }
}

/**
 * Both dictionaries' shards, if any were staged. Kept for pre-pack installs
 * only — see copySharedShardsIfMissing.
 */
export async function copySharedLsjIfMissing(fs: FsModule): Promise<void> {
  await copySharedShardsIfMissing(fs, 'lsj');
  await copySharedShardsIfMissing(fs, 'ls');
}

/** True when Rust finds Diogenes installed. */
export async function diogenesAvailable(): Promise<boolean> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke('diogenes_status')) !== null;
  } catch (err) {
    console.warn('onboarding: Diogenes check failed', err);
    return false;
  }
}

/**
 * Export one work's author in verse (lines) mode through Rust's
 * `diogenes_export`, the job the disc importer uses, sharing its cache.
 * Returns the work's XML path, or null when the export failed.
 */
export async function exportWorkXml(tlgAuthor: string, tlgWork: string, tlgDir: string): Promise<string | null> {
  const fs = await fsPlugin();
  const { appDataDir } = await import('@tauri-apps/api/path');
  const cached = exportedWorkPath(
    `${(await appDataDir()).replace(/[\\/]+$/, '')}/corpus/disc-export/lines`,
    'tlg',
    tlgAuthor,
    tlgWork,
  );
  if (await fs.exists(cached)) return cached;

  const { invoke } = await import('@tauri-apps/api/core');
  const outcome = (await invoke('diogenes_export', {
    corpus: 'tlg',
    author: tlgAuthor,
    lineMode: 'lines',
    discDir: tlgDir,
  })) as { out_dir: string; run: { code: number | null; stderr: string; spawned: boolean } };
  if (!outcome.run.spawned || outcome.run.code !== 0) {
    console.error(`onboarding: Diogenes export exited ${outcome.run.code}\n${outcome.run.stderr}`);
    return null;
  }
  return exportedWorkPath(outcome.out_dir, 'tlg', tlgAuthor, tlgWork);
}

/** True when `dir` looks like the TLG texts folder (AUTHTAB.DIR present). */
export async function looksLikeTlgDir(dir: string): Promise<boolean> {
  try {
    const fs = await fsPlugin();
    // APFS is usually case-insensitive, but check both spellings to be safe.
    if (await fs.exists(`${dir}/AUTHTAB.DIR`)) return true;
    return await fs.exists(`${dir}/authtab.dir`);
  } catch (err) {
    console.warn('onboarding: TLG folder check failed', err);
    return false;
  }
}

/**
 * Native folder picker for the TLG directory; null when cancelled. The whole
 * folder (`recursive`), since Diogenes reads it; `defaultPath` opens the
 * dialog at a folder chosen before, for choosing it again.
 */
export async function pickTlgDir(defaultPath?: string): Promise<string | null> {
  const dialog = await import('@tauri-apps/plugin-dialog');
  const picked = await dialog.open({
    directory: true,
    recursive: true,
    multiple: false,
    title: 'Choose the folder that holds the TLG texts',
    ...(defaultPath ? { defaultPath } : {}),
  });
  return typeof picked === 'string' ? picked : null;
}

export type OnboardOutcome = 'ready' | 'no-chapters' | 'export-failed' | 'unsupported';

/**
 * Run the full onboarding for one work. `tlgDir` must already be validated
 * with looksLikeTlgDir. Returns:
 *   'ready'         — corpus complete; the work is usable now.
 *   'no-chapters'   — spine built, but no precomputed chapters.json ships for
 *                     this work → "This work isn't fully supported yet."
 *   'export-failed' — → "The Greek text couldn't be prepared."
 *   'unsupported'   — work has no spine config / TLG ids (shouldn't be offered).
 */
export async function onboardWork(work: WorkManifest, tlgDir: string): Promise<OnboardOutcome> {
  const spineConfig = SPINE_CONFIG[work.id];
  if (!spineConfig || !work.tlgAuthor || !work.tlgWork) {
    console.warn(`onboarding: ${work.id} has no spine config/TLG ids`);
    return 'unsupported';
  }

  try {
    const fs = await fsPlugin();

    // 1. Run the Diogenes verse-mode export (Rust's diogenes_export job).
    const xmlPath = await exportWorkXml(work.tlgAuthor, work.tlgWork, tlgDir);
    if (xmlPath === null) return 'export-failed';

    // 2. Parse the exported XML into the work's spine.
    if (!(await fs.exists(xmlPath))) {
      console.error(`onboarding: export ran but ${xmlPath} is missing`);
      return 'export-failed';
    }
    const xml = await fs.readTextFile(xmlPath);
    const spine = parseSpine(xml, spineConfig);
    if (spine.segments.length === 0) {
      console.error(`onboarding: parsed spine for ${work.id} has no segments`);
      return 'export-failed';
    }

    // 3. Write the corpus dir.
    await fs.mkdir(`corpus/${work.id}`, { baseDir: fs.BaseDirectory.AppData, recursive: true });
    await fs.writeTextFile(`corpus/${work.id}/spine.json`, JSON.stringify(spine), {
      baseDir: fs.BaseDirectory.AppData,
    });

    // 4. Precomputed chapters.json from the bundled resources, if it ships.
    const chaptersRes = `corpus/${work.id}/chapters.json`;
    let hasChapters = false;
    try {
      if (await fs.exists(chaptersRes, { baseDir: fs.BaseDirectory.Resource })) {
        const chapters = await fs.readTextFile(chaptersRes, {
          baseDir: fs.BaseDirectory.Resource,
        });
        await fs.writeTextFile(chaptersRes, chapters, { baseDir: fs.BaseDirectory.AppData });
        hasChapters = true;
      }
    } catch (err) {
      console.warn(`onboarding: no bundled chapters.json for ${work.id}`, err);
    }

    // 5. Bundled analyses.json (morphology for the click-to-parse lexicon) —
    // best-effort, never blocks onboarding: the lexicon drawer just shows
    // "No entry found" if this is absent (see lib/lexicon/provider.ts).
    await copyBundledResourceIfPresent(
      fs,
      `corpus/${work.id}/analyses.json`,
      `corpus/${work.id}/analyses.json`,
    );

    // 6. Shared LSJ dictionary shards — one copy for the whole corpus, not
    // per work. Idempotent: skipped once corpus/lsj/ already exists in app
    // data (either from a prior onboarding or a pre-seeded install), so
    // onboarding a second work never re-copies the ~46 MB shard set.
    await copySharedLsjIfMissing(fs);

    invalidateCorpus(work.id);
    // Without chapters the work is deliberately NOT usable (book-level-only
    // reading is out of Phase 1 scope) — the spine is kept on disk so the
    // work lights up as soon as a build that bundles chapters.json arrives.
    return hasChapters ? 'ready' : 'no-chapters';
  } catch (err) {
    console.error(`onboarding: ${work.id} failed`, err);
    return 'export-failed';
  }
}
