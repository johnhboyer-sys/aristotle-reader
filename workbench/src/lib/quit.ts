// Quit waits for saves. ⌘Q is our own menu item (src-tauri/src/lib.rs): it
// emits `quit-requested`, App flushes every open editor through here, then
// calls `quit_now`. Closing the window runs the same flush. The macOS
// built-in Quit ended the app with the last edit still inside the autosave
// debounce, and that edit was lost.

const committers = new Set<() => void>();
const flushers = new Set<() => Promise<void>>();

/** Register a pending-edit commit (e.g. a footnote body's 400ms timer); runs before any save. */
export function onQuitCommit(commit: () => void): () => void {
  committers.add(commit);
  return () => committers.delete(commit);
}

/** Register a save to run before quit; it rejects if the save failed. Returns the unregister call. */
export function onQuitFlush(flush: () => Promise<void>): () => void {
  flushers.add(flush);
  return () => flushers.delete(flush);
}

/** How long quit waits on saves before treating them as failed and asking. */
export const QUIT_FLUSH_TIMEOUT_MS = 10_000;

/**
 * Commit every pending edit, then run every save. Resolves true when all saves
 * landed; false when one failed or they did not finish within `timeoutMs`.
 */
export async function flushForQuit(timeoutMs = QUIT_FLUSH_TIMEOUT_MS): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<false>((resolve) => {
    timer = setTimeout(() => {
      console.error(`saves before quit did not finish in ${timeoutMs}ms`);
      resolve(false);
    }, timeoutMs);
  });
  try {
    return await Promise.race([runFlush(), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

async function runFlush(): Promise<boolean> {
  for (const commit of committers) {
    try {
      commit();
    } catch (err) {
      console.error('commit before quit failed', err);
    }
  }
  const results = await Promise.allSettled([...flushers].map((f) => f()));
  let ok = true;
  for (const r of results) {
    if (r.status === 'rejected') {
      ok = false;
      console.error('save before quit failed', r.reason);
    }
  }
  return ok;
}
