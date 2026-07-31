/**
 * packs.ts — the frontend's view of installed lexicon packs.
 *
 * The app ships with no dictionary. A pack is one language's COMPLETE
 * dictionary plus its COMPLETE morphology, installed by the user from a .zip
 * in Settings › Lexicon:
 *
 *   Greek  — Liddell & Scott, all 116,728 entries, + every form Morpheus knows
 *   Latin  — Lewis & Short, all 51,674 entries,   + every form Morpheus knows
 *
 * Installing, listing, and removing all happen in Rust (src-tauri/src/packs.rs)
 * because a pack is 127–225 MB unpacked; this module only caches the resulting
 * list and answers "is there a pack for this language, and where is it?".
 *
 * NO PACK IS A NORMAL STATE. Every consumer degrades: the lexicon drawer says
 * which pack would answer the click, and the rest of the app is unaffected.
 * Nothing here throws.
 *
 * Diogenes is NOT involved. It was, in the first cut of Latin lookup, and that
 * made the workbench a two-download app; a pack carries its own morphology so
 * lookup stands alone. Diogenes remains needed only to build the Greek spine of
 * the bundled Aristotle works from the user's own TLG texts — acquiring a text,
 * not looking a word up.
 */

import { isTauri } from '../runtime';

export type LexiconLanguage = 'grc' | 'lat';

/** An installed pack, as reported by the Rust side. */
export interface LexiconPack {
  language: LexiconLanguage;
  /** Human name, e.g. "Greek dictionary and word parsing". */
  name: string;
  /** The dictionary's own name, e.g. "Liddell & Scott". */
  dictionary: string;
  entries: number;
  /** Shard directory relative to `path` — 'lsj' for Greek, 'ls' for Latin. */
  shardDir: string;
  analysesFile: string;
  indexFile: string;
  source: string;
  /** Absolute path of the installed pack. */
  path: string;
  bytes: number;
}

export interface InstallResult {
  ok: boolean;
  /** One plain sentence when `ok` is false. */
  message?: string;
  pack?: LexiconPack;
}

/** The Rust side returns snake_case field names. */
interface RawPack {
  language: string;
  name: string;
  dictionary: string;
  entries: number;
  shard_dir: string;
  analyses_file: string;
  index_file: string;
  source: string;
  path: string;
  bytes: number;
}

function fromRaw(raw: RawPack): LexiconPack | null {
  if (raw.language !== 'grc' && raw.language !== 'lat') return null;
  return {
    language: raw.language,
    name: raw.name,
    dictionary: raw.dictionary,
    entries: raw.entries,
    shardDir: raw.shard_dir,
    analysesFile: raw.analyses_file,
    indexFile: raw.index_file,
    source: raw.source,
    path: raw.path,
    bytes: raw.bytes,
  };
}

let listPromise: Promise<LexiconPack[]> | null = null;

async function listUncached(): Promise<LexiconPack[]> {
  if (!isTauri()) return [];
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const raw = (await invoke('list_lexicon_packs')) as RawPack[];
    return raw.map(fromRaw).filter((p): p is LexiconPack => p !== null);
  } catch (err) {
    console.warn('packs: could not list installed packs', err);
    return [];
  }
}

/** Installed packs. Cached — call `invalidatePacks()` after any change. */
export function listPacks(): Promise<LexiconPack[]> {
  if (!listPromise) listPromise = listUncached();
  return listPromise;
}

/** The pack for one language, or null when it isn't installed. */
export async function packFor(language: LexiconLanguage): Promise<LexiconPack | null> {
  return (await listPacks()).find((p) => p.language === language) ?? null;
}

/**
 * Drop every cached pack fact. Callers that change what's installed MUST call
 * this — the dictionary shard and morphology caches key off pack paths, and a
 * removed pack whose data is still cached would keep answering lookups.
 */
export function invalidatePacks(): void {
  listPromise = null;
}

/** Install a pack from a .zip the user picked. */
export async function installPack(zipPath: string): Promise<InstallResult> {
  if (!isTauri()) return { ok: false, message: 'Packs can only be installed in the app.' };
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const result = (await invoke('install_lexicon_pack', { zipPath })) as {
      ok: boolean;
      message: string | null;
      pack: RawPack | null;
    };
    invalidatePacks();
    const pack = result.pack ? fromRaw(result.pack) : null;
    return {
      ok: result.ok,
      message: result.message ?? undefined,
      pack: pack ?? undefined,
    };
  } catch (err) {
    console.error('packs: install failed', err);
    return { ok: false, message: "The pack couldn't be installed." };
  }
}

/** Remove an installed pack. */
export async function removePack(language: LexiconLanguage): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const ok = (await invoke('remove_lexicon_pack', { language })) as boolean;
    invalidatePacks();
    return ok;
  } catch (err) {
    console.error('packs: remove failed', err);
    return false;
  }
}

/** "225 MB" / "1.2 GB" — for the settings pane. */
export function formatPackSize(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  return `${Math.round(bytes / 1_048_576)} MB`;
}
