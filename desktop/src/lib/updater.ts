// Dormant until the first signed release + pubkey config exist (see README
// "Releasing"). Not imported anywhere yet. Wire into desktop startup
// (main.ts) once a real tauri.release.conf.json with a pubkey has shipped a
// signed build — until then there is no manifest for `check()` to find, and
// no key to trust it with. After wiring, consider @tauri-apps/plugin-process
// `relaunch()` to restart the app once `install()` finishes.

import { check } from '@tauri-apps/plugin-updater';

export interface AvailableUpdate {
  version: string;
  install: () => Promise<void>;
}

/**
 * Check the configured updater endpoint for a newer release.
 *
 * Returns `null` if there is no update, if the app is offline, or if the
 * endpoint/manifest can't be reached — callers should treat `null` as
 * "nothing to do" rather than an error condition.
 */
export async function checkForUpdates(): Promise<AvailableUpdate | null> {
  try {
    const update = await check();
    if (!update) return null;
    return {
      version: update.version,
      install: () => update.downloadAndInstall(),
    };
  } catch {
    // Offline, no manifest published yet, or signature/config mismatch.
    return null;
  }
}
