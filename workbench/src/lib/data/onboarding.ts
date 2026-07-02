/**
 * Work onboarding (Tauri only) — produce $APPDATA/corpus/<workId>/spine.json
 * from the user's local TLG texts via Diogenes' verse-mode exporter, then copy
 * the precomputed chapters.json from the bundled resources when present.
 *
 * Onboarding does NOT run chapter detection (chapters.json is precomputed and
 * ships with the app); it only builds the spine. The TLG-derived spine stays
 * on the user's machine — it is never committed anywhere.
 *
 * Every failure maps to one plain, calm sentence for the UI (the dialog shows
 * it verbatim); stderr/exit codes/stack traces go to the console only.
 *
 * Nothing in this module may be reached in the browser harness — callers gate
 * on isTauri() (the "Add work…" affordance simply doesn't render there).
 */

import { parseSpine } from '../corpus/spine';
import { buildDiogenesExportCommand } from '../corpus/diogenes';
import type { WorkManifest } from '../works/manifest';
import { loadSettings } from '../settings';
import { invalidateCorpus } from './corpusStore';
import { SPINE_CONFIG } from './spineConfig';

export const DEFAULT_DIOGENES_SERVER = '/Applications/Diogenes.app/Contents/server';

/** Matches the capability scope entry in src-tauri/capabilities/default.json. */
const SHELL_SCOPE_NAME = 'diogenes-export';

async function fsPlugin() {
  return import('@tauri-apps/plugin-fs');
}

/** The Diogenes server directory to run the exporter from (settings override
 * or the standard install location). */
export async function diogenesServerDir(): Promise<string> {
  const settings = await loadSettings();
  return settings.diogenesPath ?? DEFAULT_DIOGENES_SERVER;
}

/** True when Diogenes' xml-export.pl is where the pipeline expects it. */
export async function diogenesAvailable(): Promise<boolean> {
  try {
    const fs = await fsPlugin();
    return await fs.exists(`${await diogenesServerDir()}/xml-export.pl`);
  } catch (err) {
    console.warn('onboarding: Diogenes check failed', err);
    return false;
  }
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

/** Native folder picker for the TLG directory; null when cancelled. */
export async function pickTlgDir(): Promise<string | null> {
  const dialog = await import('@tauri-apps/plugin-dialog');
  const picked = await dialog.open({
    directory: true,
    multiple: false,
    title: 'Choose the folder that holds the TLG texts',
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
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    const { Command } = await import('@tauri-apps/plugin-shell');

    // 1. Run the Diogenes verse-mode export into $APPDATA/export.
    await fs.mkdir('export', { baseDir: fs.BaseDirectory.AppData, recursive: true });
    const exportDir = await join(await appDataDir(), 'export');
    const cmd = buildDiogenesExportCommand(
      {
        work: { tlg_author: work.tlgAuthor },
        sources: {
          diogenes_server: await diogenesServerDir(),
          tlg_dir_env: 'TLG_DIR',
          tlg_dir_default: tlgDir, // absolute → used as-is
        },
      },
      exportDir,
      '/',
      () => undefined,
    );

    const xmlRelPath = `export/Diogenes-Resources/xml/tlg/tlg${work.tlgAuthor}${work.tlgWork}.xml`;
    const alreadyExported = await fs.exists(xmlRelPath, { baseDir: fs.BaseDirectory.AppData });
    if (!alreadyExported) {
      // cmd.cmd[0] is "perl"; the scope entry supplies the program, we pass args.
      const child = await Command.create(SHELL_SCOPE_NAME, cmd.cmd.slice(1), {
        cwd: cmd.cwd,
        env: cmd.env,
      }).execute();
      if (child.code !== 0) {
        console.error(
          `onboarding: Diogenes export exited ${child.code}\n${child.stderr}`,
        );
        return 'export-failed';
      }
    }

    // 2. Parse the exported XML into the work's spine.
    if (!(await fs.exists(xmlRelPath, { baseDir: fs.BaseDirectory.AppData }))) {
      console.error(`onboarding: export ran but ${xmlRelPath} is missing`);
      return 'export-failed';
    }
    const xml = await fs.readTextFile(xmlRelPath, { baseDir: fs.BaseDirectory.AppData });
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
