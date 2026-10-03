/**
 * Which built-in works the library lists. None ship preinstalled (B12, John
 * 2026-10-03): not everyone wants to translate the Metaphysics or the
 * Posterior Analytics. A built-in work appears once it is this user's — its
 * library folder holds files, or Add work has put its corpus on this Mac — so
 * an existing library keeps its works and no data moves.
 */

import { listWorks } from './manifest';
import type { WorkManifest } from './manifest';
import { loadCorpus } from '../data/corpusStore';
import { libraryStorage } from '../library/storage';

export async function shownBuiltInWorks(): Promise<WorkManifest[]> {
  const storage = libraryStorage();
  const works = listWorks();
  const shown = await Promise.all(
    works.map(async (work) => {
      if ((await loadCorpus(work.id)) !== null) return true;
      try {
        return (await storage.list(work.id)).length > 0;
      } catch {
        // A folder that could not be read may hold the user's translation:
        // never hide it.
        return true;
      }
    }),
  );
  return works.filter((_, i) => shown[i]);
}
