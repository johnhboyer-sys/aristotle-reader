/**
 * Folders and files the user chose, and whether the window may still use them
 * (workbench-design/sandboxing-plan.md, phases 3–4).
 *
 * The window reads and writes outside app data only where the user picked a
 * folder or file in a native dialog; Rust keeps those picks across restarts.
 * A path stored in settings.json is not a pick — the window can write that
 * file — so before using a stored library folder, TLG/PHI folder or reference
 * doc, the caller asks Rust (`pick_status`) whether the pick still holds.
 * When it does not, the user sees why and a "Choose … again" button: every
 * existing user meets this once after updating, since earlier builds kept no
 * picks.
 */

import { isTauri } from './runtime';

/** `pick_status`'s answer (src-tauri/src/commands.rs). */
export type PickStatus = 'ok' | 'missing' | 'not-picked';

export type StoredPick = 'library' | 'tlg' | 'phi' | 'reference';

const NAMES: Record<StoredPick, string> = {
  library: 'library folder',
  tlg: 'TLG folder',
  phi: 'PHI folder',
  reference: 'reference document',
};

/**
 * Whether `path` is still open to the window. `deep` for a folder read below
 * its top (the library, a disc). Always 'ok' in the browser harness, which has
 * no picks. A check that fails counts as not picked: asking the user again is
 * better than an empty library.
 */
export async function pickStatus(path: string, deep = false): Promise<PickStatus> {
  if (!isTauri()) return 'ok';
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return (await invoke('pick_status', { path, deep })) as PickStatus;
  } catch (err) {
    console.error('[picks] could not check', path, err);
    return 'not-picked';
  }
}

/** The button: "Choose your library folder again…". */
export function chooseAgainLabel(kind: StoredPick): string {
  return `Choose your ${NAMES[kind]} again…`;
}

/** Why the stored folder or file cannot be used, in plain words. */
export function repickReason(kind: StoredPick, status: Exclude<PickStatus, 'ok'>, path: string): string {
  const name = NAMES[kind];
  if (status === 'missing') {
    return `Your ${name} isn’t where it was (${path}). It may have been moved or renamed, or be on a drive that isn’t connected.`;
  }
  const what = kind === 'reference' ? 'files' : 'folders';
  return `The Workbench now opens only ${what} you have chosen in it, and remembers each one. Choose your ${name} again, once, to keep using it.`;
}
